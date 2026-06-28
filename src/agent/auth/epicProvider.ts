import type { AuthProvider, VersionDiscovery } from './types.js';
import { NotImplementedError } from './errors.js';

/**
 * Epic Games Store provider stub: operations throw NotImplemented. To implement:
 * OAuth via Epic (client creds + refresh token) for the session ticket, then the
 * same BHVR login against host egs.live.bhvrdbd.com with provider `egs` and body
 * platform `EGS`.
 */
export class EpicAuthProvider implements AuthProvider {
  readonly name = 'epic';
  readonly versionDiscovery: VersionDiscovery | null = null;

  async getApiKey(): Promise<string> {
    throw new NotImplementedError(
      'AUTH_PROVIDER=epic is not implemented yet. Use AUTH_PROVIDER=steam, ' +
        'or provide DBD_API_KEY in quick mode.',
    );
  }

  async refresh(): Promise<string> {
    return this.getApiKey();
  }

  async shutdown(): Promise<void> {
    /* nothing to release */
  }
}
