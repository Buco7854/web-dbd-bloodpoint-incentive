import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Logger } from '../../common/logger.js';

interface PersistedState {
  /** Full version string whose category last returned real data. */
  lastWorkingVersion: string | null;
  updatedAt: string;
}

/**
 * Persists the last version whose category returned real data, so a cosmetic
 * build bump doesn't lose the working category across restarts. Mount the state
 * dir as a volume to survive container recreation.
 */
export class StateStore {
  private readonly filePath: string;

  constructor(
    private readonly dir: string,
    private readonly log: Logger,
  ) {
    this.filePath = path.join(dir, 'state.json');
  }

  async readLastWorkingVersion(): Promise<string | null> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      const value = typeof parsed.lastWorkingVersion === 'string' ? parsed.lastWorkingVersion : null;
      if (value) this.log.info({ lastWorkingVersion: value }, 'loaded persisted last-working version');
      return value;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.log.warn({ err }, 'could not read persisted state; starting fresh');
      }
      return null;
    }
  }

  async writeLastWorkingVersion(version: string): Promise<void> {
    const payload: PersistedState = {
      lastWorkingVersion: version,
      updatedAt: new Date().toISOString(),
    };
    try {
      await fs.mkdir(this.dir, { recursive: true });
      // Write-then-rename for atomicity.
      const tmp = `${this.filePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
      await fs.rename(tmp, this.filePath);
    } catch (err) {
      this.log.warn({ err }, 'could not persist last-working version (continuing in-memory)');
    }
  }
}
