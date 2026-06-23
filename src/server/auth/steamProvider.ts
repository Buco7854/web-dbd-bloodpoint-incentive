import type { AppConfig } from '../config.js';
import type { Logger } from '../logger.js';
import { buildUserAgent } from '../version/category.js';
import { AuthError } from './errors.js';
import { type Anchor, parseLiveKeys, selectAnchor } from './steam/loginAnchor.js';
import type { SteamClient } from './steam/steamClient.js';
import type { SteamVersionDiscovery } from './steam/versionDiscovery.js';
import type { AuthProvider, VersionDiscovery } from './types.js';

export interface SteamAuthProviderDeps {
  steamClient: SteamClient;
  discovery: SteamVersionDiscovery;
  config: AppConfig;
  log: Logger;
}

/**
 * Full Steam mode: log into Steam headlessly, exchange an auth ticket for a DBD
 * api-key, and re-login on a 401. Best effort against live BHVR (see SteamClient
 * for the web-ticket identity caveat); quick mode (DBD_API_KEY) is the validated
 * path. The key is cached and reused; concurrent logins are de-duplicated.
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
    const ticketHex = await steamClient.getWebTicketHex();
    const userAgent = buildUserAgent(await discovery.resolveLatestVersion(), config.clientOs);
    const anchor = await this.resolveAnchor(userAgent);
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
      throw new AuthError(`BHVR Steam login failed (${response.status}): ${await safeText(response)}`);
    }
    const data = (await response.json()) as { token?: string };
    if (!data.token) throw new AuthError('BHVR Steam login returned no token');
    this.apiKey = data.token;
    log.info('obtained DBD api-key via Steam login');
    return this.apiKey;
  }

  private async resolveAnchor(userAgent: string): Promise<Anchor> {
    const { config, log } = this.deps;
    const base: Record<string, string> = {
      Accept: '*/*',
      'Accept-Encoding': 'deflate, gzip',
      'User-Agent': userAgent,
      'x-kraken-client-platform': config.krakenProvider,
      'x-kraken-client-provider': config.krakenProvider,
      'x-kraken-client-os': config.clientOs,
    };

    const versionsRes = await fetch(`https://${config.bhvrHost}/api/v1/utils/contentVersion/version`, {
      headers: base,
    });
    if (!versionsRes.ok) throw new AuthError(`contentVersion/version failed (${versionsRes.status})`);
    const versionsBody = (await versionsRes.json()) as Record<string, unknown>;
    // The map may be under `availableVersions` or be the whole response body.
    const availableVersions = (versionsBody.availableVersions ?? versionsBody) as Record<
      string,
      unknown
    >;

    const keysRes = await fetch('https://keyapi.deadbyqueue.com/keys', {
      headers: { Accept: '*/*', 'User-Agent': userAgent },
    });
    if (!keysRes.ok) throw new AuthError(`keyapi/keys failed (${keysRes.status})`);
    const liveKeys = parseLiveKeys(await keysRes.text());

    try {
      return selectAnchor({ availableVersions, liveKeys });
    } catch (err) {
      // Print the shapes (keys only, never the secret values) so a mismatch
      // between the two endpoints can be diagnosed and the parser corrected.
      log.warn(
        {
          contentVersionTopKeys: Object.keys(versionsBody).slice(0, 25),
          availableVersionsType: Array.isArray(availableVersions) ? 'array' : typeof availableVersions,
          availableVersionsKeys: Object.keys(availableVersions).slice(0, 25),
          liveKeyPatterns: Object.keys(liveKeys).slice(0, 25),
        },
        'could not select a BHVR login anchor; dumping input keys for diagnosis',
      );
      throw err;
    }
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
