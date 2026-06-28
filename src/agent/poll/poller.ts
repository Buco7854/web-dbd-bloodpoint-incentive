import type { Logger } from '../../common/logger.js';
import { delay } from '../../common/async.js';
import { AuthError, isFatalError } from '../auth/errors.js';
import {
  BhvrRateLimitedError,
  BhvrServerError,
  BhvrUnauthorizedError,
  type BhvrClient,
} from '../bhvr/client.js';
import type { VersionResolver } from '../version/resolver.js';
import type { PollSink } from './sink.js';

const MAX_BACKOFF = 8;
const MAX_SLEEP_MS = 20 * 60 * 1000;
const HARD_PAUSE_MS = 5 * 60 * 1000;
const PAUSE_AFTER_BAD_CYCLES = 3;

export interface PollerOptions {
  region: string;
  /** Base wait (ms) until the next request, from the hub-driven schedule. */
  nextBaseWaitMs: () => number;
  /**
   * Poll once immediately on startup instead of waiting for the first slot. Set
   * for the lead agent so refreshTime is seeded fast; others wait for their slots
   * so they never bunch up.
   */
  probeImmediately?: boolean;
  versionRefreshMs: number;
  /** Called once when an unrecoverable error occurs, so the app can shut down. */
  onFatal?: (err: unknown) => void;
}

/**
 * Drives BHVR traffic for one region like a real client: request, wait, request
 * (matchmake → play → matchmake, not a constant drip). The wait comes from the
 * hub-driven schedule so redundant agents stay spaced; backs off when BHVR pushes
 * back.
 */
export class Poller {
  private readonly controller = new AbortController();
  private loopDone: Promise<void> | null = null;
  private backoff = 1;
  private consecutiveBadCycles = 0;
  private lastVersionRefresh = Date.now();
  private fatalHandled = false;

  constructor(
    private readonly sink: PollSink,
    private readonly client: BhvrClient,
    private readonly resolver: VersionResolver,
    private readonly options: PollerOptions,
    private readonly log: Logger,
  ) {}

  start(): void {
    if (this.loopDone) return;
    this.loopDone = this.run();
  }

  async stop(): Promise<void> {
    this.controller.abort();
    await this.loopDone;
  }

  private get signal(): AbortSignal {
    return this.controller.signal;
  }

  private async run(): Promise<void> {
    this.log.info({ region: this.options.region }, 'poller started');
    if (!this.options.probeImmediately) {
      await delay(this.nextWaitMs(), this.signal);
    }
    while (!this.signal.aborted) {
      try {
        await this.cycle();
      } catch (err) {
        if (isFatalError(err)) {
          this.triggerFatal(err);
          return;
        }
        this.log.error({ err }, 'unexpected poller error');
        await delay(HARD_PAUSE_MS, this.signal);
      }
    }
    this.log.info('poller stopped');
  }

  private async cycle(): Promise<void> {
    const version = this.resolver.getActive();
    if (!version) {
      this.sink.setStatus('degraded', 'client version not resolved yet; retrying discovery');
      this.log.warn('no active client version yet; retrying discovery');
      await delay(HARD_PAUSE_MS, this.signal);
      await this.resolver.refreshFromDiscovery();
      return;
    }
    this.sink.setVersionInfo(version.version, version.category);

    this.sink.markPassStarted();
    const gotReal = await this.queryRegion(version);
    if (this.signal.aborted) return;
    await this.finishCycle(gotReal);

    await delay(this.nextWaitMs(), this.signal);
  }

  /** Query the region once. Returns whether it produced real data. */
  private async queryRegion(version: ReturnType<VersionResolver['getActive']>): Promise<boolean> {
    if (!version) return false;
    const region = this.options.region;
    try {
      const read = await this.client.fetchRegion(region, version, this.signal);
      if (read.isReal) {
        await this.sink.recordReal(read);
        this.backoff = 1;
        return true;
      }
      this.sink.markStale(region);
      return false;
    } catch (err) {
      this.sink.markStale(region);
      this.handleError(err);
      return false;
    }
  }

  /** Schedule-driven wait, scaled by backoff and capped. */
  private nextWaitMs(): number {
    return Math.min(this.options.nextBaseWaitMs() * this.backoff, MAX_SLEEP_MS);
  }

  private triggerFatal(err: unknown): void {
    if (this.fatalHandled) return;
    this.fatalHandled = true;
    const message = err instanceof Error ? err.message : String(err);
    this.sink.setStatus('error', message);
    this.log.fatal({ err }, 'unrecoverable error; stopping the poller');
    this.controller.abort();
    this.options.onFatal?.(err);
  }

  private handleError(err: unknown): void {
    if (isFatalError(err)) {
      this.triggerFatal(err);
      return;
    }
    if (err instanceof BhvrRateLimitedError) {
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF);
      this.sink.setStatus('paused', 'rate limited by BHVR; backing off');
      this.log.warn('rate limited; backing off');
      return;
    }
    if (err instanceof AuthError || err instanceof BhvrServerError || err instanceof BhvrUnauthorizedError) {
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF);
      this.sink.setStatus('degraded', err.message);
      this.log.warn({ err }, 'server/auth error from BHVR; backing off');
      return;
    }
    this.backoff = Math.min(this.backoff * 1.5, MAX_BACKOFF);
    this.log.warn({ err }, 'transient error querying region');
  }

  private async finishCycle(gotReal: boolean): Promise<void> {
    this.resolver.reportPassResult(gotReal);

    if (gotReal) {
      this.consecutiveBadCycles = 0;
      this.sink.markPassCompleted();
      this.sink.setStatus('ok');
    } else {
      this.consecutiveBadCycles += 1;
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF);
      if (this.consecutiveBadCycles >= PAUSE_AFTER_BAD_CYCLES) {
        this.sink.setStatus('paused', 'no real data repeatedly; backing off');
      } else {
        this.sink.setStatus('degraded', 'no real data this cycle');
      }
    }

    if (Date.now() - this.lastVersionRefresh >= this.options.versionRefreshMs) {
      this.lastVersionRefresh = Date.now();
      this.log.info('re-resolving latest client version');
      await this.resolver.refreshFromDiscovery();
    }
  }
}
