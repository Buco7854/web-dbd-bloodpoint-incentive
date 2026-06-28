/**
 * Estimates the visitor's closest matchmaking region by measuring network
 * round-trip latency to each region from the browser. This is the same signal
 * Dead by Daylight itself uses to place a player on a server (see the server's
 * `latencies` payload in `src/agent/bhvr`), so the lowest-latency region is the
 * one a player will most likely be matched into.
 *
 * Architecture: the ONLY provider-specific detail is `probeUrl` on the strategy.
 * Region ids are AWS region codes today, so the default strategy pings a tiny
 * AWS regional endpoint for the service DBD's matchmaking actually runs on,
 * Amazon GameLift. If DBD ever changes provider or region naming, swap the
 * strategy (or just its `probeUrl`) and nothing else here changes. Detection runs
 * fully in the visitor's browser - their IP/location never reaches our server.
 */

export interface RegionLatencyStrategy {
  /** Builds the URL to probe for a region id. The swappable, provider-specific bit. */
  probeUrl: (regionId: string) => string;
}

/**
 * Default: region ids are AWS codes and DBD matchmaking runs on Amazon GameLift,
 * so ping each region's GameLift endpoint for a proximity signal that mirrors
 * where a player would actually be placed.
 */
export const awsRegionLatencyStrategy: RegionLatencyStrategy = {
  probeUrl: (regionId) => `https://gamelift.${regionId}.amazonaws.com/`,
};

export interface DetectOptions {
  strategy?: RegionLatencyStrategy;
  /** Throwaway probes to warm the connection (DNS/TCP/TLS) before measuring. */
  warmup?: number;
  /** Measured probes per region; the best (lowest) is kept. */
  samples?: number;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Max probes in flight at once. */
  concurrency?: number;
  /** Overall budget; after it, stop probing and decide from what we have. */
  deadlineMs?: number;
  /**
   * A region to stick with unless another is clearly faster, to stop the result
   * flip-flopping between two near-equidistant regions (e.g. Frankfurt vs London)
   * across reloads. Usually the previously detected region.
   */
  preferred?: string;
  /** Keep `preferred` while its latency is within this many ms of the new best. */
  marginMs?: number;
  /** Keep `preferred` while its latency is within this factor of the new best. */
  marginRatio?: number;
  signal?: AbortSignal;
}

export interface RegionLatencyResult {
  /** The lowest-latency region id. */
  region: string;
  /** Best measured latency per region, in ms (Infinity if it never responded). */
  latencies: Record<string, number>;
}

const DEFAULTS = {
  warmup: 1,
  samples: 5,
  timeoutMs: 2500,
  concurrency: 6,
  deadlineMs: 9000,
  marginMs: 12,
  marginRatio: 1.15,
} as const;

/**
 * One opaque, timed request. We only care about the round-trip time, not the
 * body, so `no-cors` is fine: the request still completes against the endpoint.
 * Resolves to elapsed ms, or `Infinity` if it failed/timed out.
 */
async function probeOnce(url: string, timeoutMs: number, signal?: AbortSignal): Promise<number> {
  if (typeof fetch !== 'function' || typeof performance === 'undefined') return Infinity;
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const bust = `${url.includes('?') ? '&' : '?'}_=${performance.now()}`;
  const start = performance.now();
  try {
    await fetch(url + bust, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    return performance.now() - start;
  } catch {
    return Infinity;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * Latency for one region: warm the connection, then keep the BEST (minimum) of
 * several probes.
 *
 * Why the minimum rather than an average or a median? Network jitter and
 * transient load can only ever *inflate* a latency sample - nothing can push it
 * below the physical round-trip floor - so the minimum is the cleanest, most
 * stable proximity signal and can never be spuriously low. A mean or median, by
 * contrast, gets dragged up by a single slow sample, which would blur the
 * ranking between two nearby regions. The warmup probes (DNS/TCP/TLS handshakes)
 * are discarded for the same reason: they reflect setup cost, not distance.
 */
async function measureRegion(
  url: string,
  warmup: number,
  samples: number,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<number> {
  for (let i = 0; i < warmup; i += 1) {
    if (signal?.aborted) return Infinity;
    await probeOnce(url, timeoutMs, signal);
  }
  let best = Infinity;
  for (let i = 0; i < samples; i += 1) {
    if (signal?.aborted) break;
    const ms = await probeOnce(url, timeoutMs, signal);
    if (ms < best) best = ms;
  }
  return best;
}

/**
 * Probe every region and return the lowest-latency one, or `null` if none
 * responded (offline, all blocked, aborted). Bounded by `deadlineMs` so one
 * slow/unreachable region can't stall the whole thing. Never throws.
 */
export async function detectClosestRegion(
  regionIds: readonly string[],
  options: DetectOptions = {},
): Promise<RegionLatencyResult | null> {
  const strategy = options.strategy ?? awsRegionLatencyStrategy;
  const warmup = options.warmup ?? DEFAULTS.warmup;
  const samples = options.samples ?? DEFAULTS.samples;
  const timeoutMs = options.timeoutMs ?? DEFAULTS.timeoutMs;
  const concurrency = options.concurrency ?? DEFAULTS.concurrency;
  const deadlineMs = options.deadlineMs ?? DEFAULTS.deadlineMs;

  // One controller fired by either the caller's signal or the overall deadline,
  // so the work is always bounded.
  const controller = new AbortController();
  const onExternalAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });
  const deadline = setTimeout(() => controller.abort(), deadlineMs);

  const latencies: Record<string, number> = {};
  const queue = [...regionIds];
  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      if (controller.signal.aborted) return;
      latencies[id] = await measureRegion(strategy.probeUrl(id), warmup, samples, timeoutMs, controller.signal);
    }
  };

  const workers = Math.max(1, Math.min(concurrency, regionIds.length));
  try {
    await Promise.all(Array.from({ length: workers }, worker));
  } finally {
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }

  let best: string | null = null;
  let bestMs = Infinity;
  for (const [id, ms] of Object.entries(latencies)) {
    if (ms < bestMs) {
      bestMs = ms;
      best = id;
    }
  }
  if (best === null || !Number.isFinite(bestMs)) return null;

  // Hysteresis: keep the preferred region unless the new winner beats it by a clear
  // margin, so two near-equidistant regions don't trade places on every reload.
  const preferred = options.preferred;
  const marginMs = options.marginMs ?? DEFAULTS.marginMs;
  const marginRatio = options.marginRatio ?? DEFAULTS.marginRatio;
  if (preferred && preferred !== best) {
    const pref = latencies[preferred] ?? Infinity;
    if (Number.isFinite(pref) && pref <= bestMs + marginMs && pref <= bestMs * marginRatio) {
      return { region: preferred, latencies };
    }
  }
  return { region: best, latencies };
}
