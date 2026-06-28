import type { Logger } from '../../common/logger.js';
import { AuthError } from '../auth/errors.js';
import { type Anchor, parseLiveKeys, selectAnchor } from '../auth/steam/loginAnchor.js';

export interface AnchorResolverDeps {
  host: string;
  krakenProvider: 'steam' | 'egs';
  clientOs: string;
  log: Logger;
}

const DEFAULT_TTL_MS = 6 * 3_600_000;

/**
 * Resolves the live client-version anchor (semver, content id, secret key) from
 * BHVR's endpoints, shared by Steam login and matchIncentives, and caches it.
 */
export class AnchorResolver {
  private cached: { anchor: Anchor; at: number } | null = null;

  constructor(
    private readonly deps: AnchorResolverDeps,
    private readonly ttlMs: number = DEFAULT_TTL_MS,
  ) {}

  /** The current anchor, fetched at most once per TTL. */
  async getAnchor(userAgent: string): Promise<Anchor> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < this.ttlMs) return this.cached.anchor;
    const anchor = await this.resolve(userAgent);
    this.cached = { anchor, at: now };
    return anchor;
  }

  /** The live client version semver, e.g. "10.0.1". */
  async getClientVersion(userAgent: string): Promise<string> {
    return (await this.getAnchor(userAgent)).pattern;
  }

  private async resolve(userAgent: string): Promise<Anchor> {
    const { host, krakenProvider, clientOs, log } = this.deps;
    const base: Record<string, string> = {
      Accept: '*/*',
      'Accept-Encoding': 'deflate, gzip',
      'User-Agent': userAgent,
      'x-kraken-client-platform': krakenProvider,
      'x-kraken-client-provider': krakenProvider,
      'x-kraken-client-os': clientOs,
    };

    const versionsRes = await fetch(`https://${host}/api/v1/utils/contentVersion/version`, {
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
          availableVersionsKeys: Object.keys(availableVersions).slice(0, 25),
          liveKeyPatterns: Object.keys(liveKeys).slice(0, 25),
        },
        'could not select a BHVR login anchor; dumping input keys for diagnosis',
      );
      throw err;
    }
  }
}
