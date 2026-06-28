import type { Logger } from '../../common/logger.js';
import { isFatalError } from '../auth/errors.js';
import type { VersionDiscovery } from '../auth/types.js';
import { deriveVersionArtifacts, type VersionArtifacts } from './category.js';
import { StateStore } from './store.js';

export interface VersionResolverOptions {
  /** 'auto' to discover from the Steam depot, or a pinned full version string. */
  gameVersion: string;
  clientOs: string;
  discovery: VersionDiscovery | null;
  store: StateStore;
  log: Logger;
}

/**
 * Owns the active client version (and its category + User-Agent). In auto mode it
 * discovers the newest build and applies the cosmetic-patch guard: if a freshly
 * discovered build returns only fallbacks, revert to the last working category
 * and wait for a newer build before trying again.
 */
export class VersionResolver {
  private readonly pinned: boolean;
  private active: VersionArtifacts | null = null;
  private candidate: VersionArtifacts | null = null;
  private candidateVerified = false;
  private lastWorking: VersionArtifacts | null = null;
  private rejectedBuildId = 0;

  constructor(private readonly opts: VersionResolverOptions) {
    this.pinned = opts.gameVersion.trim().toLowerCase() !== 'auto';
  }

  async init(): Promise<void> {
    if (this.pinned) {
      this.active = deriveVersionArtifacts(this.opts.gameVersion, this.opts.clientOs);
      this.opts.log.info({ version: this.active.version, category: this.active.category }, 'using pinned game version');
      return;
    }

    const persisted = await this.opts.store.readLastWorkingVersion();
    if (persisted) {
      try {
        this.lastWorking = deriveVersionArtifacts(persisted, this.opts.clientOs);
      } catch (err) {
        this.opts.log.warn({ err, persisted }, 'persisted version is malformed; ignoring');
      }
    }

    await this.refreshFromDiscovery();
    if (!this.active) this.active = this.lastWorking;
    if (!this.active) {
      // Not fatal: the poller stays in an error state and keeps retrying
      // discovery rather than crashing the whole server at boot.
      this.opts.log.warn('could not resolve a client version yet; will keep retrying discovery');
    }
  }

  getActive(): VersionArtifacts | null {
    return this.active;
  }

  /** Re-resolve the latest build (auto mode). Adopts it only if it is newer. */
  async refreshFromDiscovery(): Promise<void> {
    if (this.pinned || !this.opts.discovery) return;

    let versionString: string;
    try {
      versionString = await this.opts.discovery.resolveLatestVersion();
    } catch (err) {
      if (isFatalError(err)) throw err;
      this.opts.log.warn({ err }, 'version discovery failed; keeping current version');
      return;
    }

    let derived: VersionArtifacts;
    try {
      derived = deriveVersionArtifacts(versionString, this.opts.clientOs);
    } catch (err) {
      this.opts.log.warn({ err, versionString }, 'discovered version is malformed; ignoring');
      return;
    }

    // Only adopt a strictly newer build, and never re-adopt one we already rejected.
    if (this.candidate && derived.buildId <= this.candidate.buildId) return;
    if (derived.buildId <= this.rejectedBuildId) return;

    this.candidate = derived;
    this.candidateVerified = false;
    this.active = derived;
    this.opts.log.info({ version: derived.version, category: derived.category }, 'trying freshly discovered version');
  }

  /** Called after each full poll pass with whether any region returned real data. */
  reportPassResult(gotRealData: boolean): void {
    if (this.pinned || !this.active) return;

    const onCandidate = this.candidate !== null && this.active.version === this.candidate.version;

    if (onCandidate && !this.candidateVerified) {
      if (gotRealData) {
        this.candidateVerified = true;
        this.lastWorking = this.candidate;
        void this.opts.store.writeLastWorkingVersion(this.active.version);
        this.opts.log.info({ version: this.active.version }, 'version confirmed working');
      } else if (this.lastWorking && this.lastWorking.version !== this.active.version) {
        this.rejectedBuildId = this.candidate?.buildId ?? this.rejectedBuildId;
        this.active = this.lastWorking;
        this.opts.log.warn(
          { rejected: this.candidate?.version, revertedTo: this.lastWorking.version },
          'candidate returned only fallbacks; reverting to last-working version',
        );
      }
    }
  }
}
