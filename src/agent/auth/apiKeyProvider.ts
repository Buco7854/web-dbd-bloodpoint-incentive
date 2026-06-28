import type { AuthProvider, VersionDiscovery } from './types.js';
import { FatalAuthError } from './errors.js';

/**
 * Fallback BHVR auth: use a pre-obtained `DBD_API_KEY` directly. No session to
 * refresh, so a 401 is a hard, actionable error (the key expired).
 */
export class ApiKeyProvider implements AuthProvider {
  readonly name = 'apiKey';
  readonly versionDiscovery: VersionDiscovery | null = null;

  constructor(private readonly key: string) {}

  async getApiKey(): Promise<string> {
    return this.key;
  }

  async refresh(): Promise<string> {
    throw new FatalAuthError(
      'DBD_API_KEY was rejected (401) and cannot be refreshed in quick mode. ' +
        'Update DBD_API_KEY, or run full Steam mode (STEAM_USERNAME/PASSWORD) ' +
        'for automatic, unattended re-authentication.',
    );
  }

  async shutdown(): Promise<void> {
    /* nothing to release */
  }
}
