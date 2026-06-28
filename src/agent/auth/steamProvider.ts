import type { AppConfig } from '../config.js';
import type { Logger } from '../../common/logger.js';
import type { AnchorResolver } from '../bhvr/anchor.js';
import { buildUserAgent } from '../version/category.js';
import { AuthError, FatalAuthError } from './errors.js';
import type { SteamClient } from './steam/steamClient.js';
import type { SteamVersionDiscovery } from './steam/versionDiscovery.js';
import type { AuthProvider, VersionDiscovery } from './types.js';

export interface SteamAuthProviderDeps {
  steamClient: SteamClient;
  discovery: SteamVersionDiscovery;
  anchorResolver: AnchorResolver;
  config: AppConfig;
  log: Logger;
}

/**
 * Steam mode: log into Steam headlessly, exchange an auth ticket for a DBD
 * api-key, and re-login on a 401. The key is cached and reused; concurrent
 * logins are de-duplicated. If BHVR rejects the ticket, DBD_API_KEY is the fallback.
 */
export class SteamAuthProvider implements AuthProvider {
  readonly name = 'steam';
  readonly versionDiscovery: VersionDiscovery;
  private apiKey: string | null = null;
  private loginInFlight: Promise<string> | null = null;

  constructor(private readonly deps: SteamAuthProviderDeps) {
    this.versionDiscovery = deps.discovery;
    // When the Steam session cycles (every 4-6h), drop the DBD api-key too so the
    // next poll re-logs into both, like a player relaunching the game.
    deps.steamClient.setOnSessionCycle(() => {
      this.apiKey = null;
      deps.log.info('invalidated DBD api-key alongside the Steam session cycle');
    });
  }

  async getApiKey(): Promise<string> {
    return this.apiKey ?? this.login();
  }

  async refresh(): Promise<string> {
    this.apiKey = null;
    return this.login();
  }

  private login(): Promise<string> {
    if (!this.loginInFlight) {
      this.loginInFlight = this.doLogin().finally(() => {
        this.loginInFlight = null;
      });
    }
    return this.loginInFlight;
  }

  private async doLogin(): Promise<string> {
    const { steamClient, discovery, config, log } = this.deps;
    const ticketHex = await steamClient.getWebApiTicketHex('KRAKEN_DBD');
    const userAgent = buildUserAgent(await discovery.resolveLatestVersion(), config.clientOs);
    const anchor = await this.deps.anchorResolver.getAnchor(userAgent);
    log.info({ pattern: anchor.pattern, contentVersionId: anchor.contentVersionId }, 'selected BHVR login anchor');

    const response = await fetch(`https://${config.bhvrHost}/api/v1/auth/provider/steam/login`, {
      method: 'POST',
      headers: {
        Accept: '*/*',
        'Accept-Encoding': 'deflate, gzip',
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        'x-kraken-client-version': anchor.pattern,
        'x-kraken-client-platform': config.krakenProvider,
        'x-kraken-client-provider': config.krakenProvider,
        'x-kraken-client-os': config.clientOs,
        'x-kraken-content-version': JSON.stringify({ contentVersionId: anchor.contentVersionId }),
        'x-kraken-content-secret-key': anchor.secretKey,
      },
      body: JSON.stringify({
        abortIfAlreadyLoggedInUnifiedAccount: true,
        clientData: {},
        dynamicContentClientVersion: anchor.pattern,
        dynamicContentVariant: config.platform,
        token: ticketHex,
      }),
    });

    if (!response.ok) {
      const body = await safeText(response);
      if (/InvalidToken|cantGetSteamUserInfo/i.test(body)) {
        throw new FatalAuthError(
          'BHVR rejected the Steam web ticket (Invalid Token). Steam mode could not ' +
            'produce the identity-bound web ticket BHVR requires (node-steam-user has no ' +
            'GetAuthTicketForWebApi) on this setup. Fall back to DBD_API_KEY; keep the ' +
            'Steam credentials so version discovery still works.',
        );
      }
      throw new AuthError(`BHVR Steam login failed (${response.status}): ${body}`);
    }
    const data = (await response.json()) as { token?: string };
    if (!data.token) throw new AuthError('BHVR Steam login returned no token');
    this.apiKey = data.token;
    log.info('obtained DBD api-key via Steam login');
    return this.apiKey;
  }

  async shutdown(): Promise<void> {
    await this.deps.steamClient.shutdown();
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}
