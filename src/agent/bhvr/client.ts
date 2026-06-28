import { isRealResponse } from '../../shared/incentive.js';
import type { Logger } from '../../common/logger.js';
import type { AuthProvider } from '../auth/types.js';
import type { VersionArtifacts } from '../version/category.js';
import type { AnchorResolver } from './anchor.js';
import { buildLatencies } from './latency.js';
import type { RateGate } from './rateGate.js';

export class BhvrError extends Error {
  override name = 'BhvrError';
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}
export class BhvrUnauthorizedError extends BhvrError {
  override name = 'BhvrUnauthorizedError';
}
export class BhvrRateLimitedError extends BhvrError {
  override name = 'BhvrRateLimitedError';
}
export class BhvrServerError extends BhvrError {
  override name = 'BhvrServerError';
}

interface MatchIncentivesResponse {
  killerPercentageIncentive?: number;
  survivorPercentageIncentive?: number;
  ratio?: number;
  /** Server-side incentive refresh cadence (seconds); drives `auto` polling. */
  refreshTime?: number;
}

/** Result of reading one region's incentive. */
export interface RegionRead {
  region: string;
  survivor: number;
  killer: number;
  ratio: number;
  isReal: boolean;
  /** Server's reported refresh cadence in seconds, or null when absent. */
  refreshTime: number | null;
}

export interface BhvrClientOptions {
  host: string;
  krakenProvider: 'steam' | 'egs';
  clientOs: string;
  platform: string;
  requestTimeoutMs?: number;
}

/**
 * Calls POST /api/v1/matchIncentives one region at a time, sending the headers
 * the API expects, and re-authenticates once on a 401.
 */
export class BhvrClient {
  private readonly timeoutMs: number;

  constructor(
    private readonly options: BhvrClientOptions,
    private readonly auth: AuthProvider,
    private readonly anchorResolver: AnchorResolver,
    private readonly rateGate: RateGate,
    private readonly log: Logger,
  ) {
    this.timeoutMs = options.requestTimeoutMs ?? 15_000;
  }

  async fetchRegion(
    region: string,
    version: VersionArtifacts,
    signal?: AbortSignal,
  ): Promise<RegionRead> {
    try {
      return await this.doFetch(region, version, signal);
    } catch (err) {
      if (err instanceof BhvrUnauthorizedError) {
        this.log.warn({ region }, 'matchIncentives returned 401; re-authenticating');
        await this.auth.refresh();
        return this.doFetch(region, version, signal);
      }
      throw err;
    }
  }

  private async doFetch(
    region: string,
    version: VersionArtifacts,
    signal?: AbortSignal,
  ): Promise<RegionRead> {
    await this.rateGate.wait(signal);

    const apiKey = await this.auth.getApiKey();
    const clientVersion = await this.anchorResolver.getClientVersion(version.userAgent);
    const url = `https://${this.options.host}/api/v1/matchIncentives`;
    const headers: Record<string, string> = {
      Accept: '*/*',
      'Accept-Encoding': 'deflate, gzip',
      'Content-Type': 'application/json',
      'User-Agent': version.userAgent,
      'x-kraken-client-version': clientVersion,
      'x-kraken-client-platform': this.options.krakenProvider,
      'x-kraken-client-provider': this.options.krakenProvider,
      'x-kraken-client-os': this.options.clientOs,
      'api-key': apiKey,
    };
    const body = JSON.stringify({
      category: version.category,
      latencies: buildLatencies(region),
      platform: this.options.platform,
      region: 'all',
      serverProvider: '',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onParentAbort = (): void => controller.abort();
    signal?.addEventListener('abort', onParentAbort, { once: true });

    let response: Response;
    try {
      response = await fetch(url, { method: 'POST', headers, body, signal: controller.signal });
    } catch (err) {
      throw new BhvrError(`network error calling matchIncentives: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onParentAbort);
    }

    if (response.status === 401) throw new BhvrUnauthorizedError('unauthorized', 401);
    if (response.status === 429) throw new BhvrRateLimitedError('rate limited', 429);
    if (response.status >= 500) {
      throw new BhvrServerError(`server error ${response.status}`, response.status);
    }
    if (!response.ok) {
      throw new BhvrError(`unexpected status ${response.status}`, response.status);
    }

    let data: MatchIncentivesResponse;
    try {
      data = (await response.json()) as MatchIncentivesResponse;
    } catch (err) {
      throw new BhvrError(`could not parse matchIncentives response: ${(err as Error).message}`);
    }

    const survivor = numberOr(data.survivorPercentageIncentive, 0);
    const killer = numberOr(data.killerPercentageIncentive, 0);
    const ratio = numberOr(data.ratio, 0);
    return {
      region,
      survivor,
      killer,
      ratio,
      isReal: isRealResponse(ratio),
      refreshTime: typeof data.refreshTime === 'number' ? data.refreshTime : null,
    };
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
