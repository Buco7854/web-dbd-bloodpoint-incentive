import type { Logger } from '../../../common/logger.js';
import type { VersionDiscovery } from '../types.js';
import type { SteamClient } from './steamClient.js';

/**
 * Reads the latest client version from the Steam depot, with a short cache so the
 * version resolver and the login flow share a single depot read at startup.
 */
export class SteamVersionDiscovery implements VersionDiscovery {
  private cached: { value: string; at: number } | null = null;

  constructor(
    private readonly steam: SteamClient,
    private readonly log: Logger,
    private readonly ttlMs = 60_000,
  ) {}

  async resolveLatestVersion(): Promise<string> {
    if (this.cached && Date.now() - this.cached.at < this.ttlMs) {
      return this.cached.value;
    }
    const value = await this.steam.readVersionString();
    this.cached = { value, at: Date.now() };
    this.log.info({ version: value }, 'resolved latest client version from Steam depot');
    return value;
  }
}
