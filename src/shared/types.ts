/**
 * Shared domain + transport types. Pure TypeScript with no Node or DOM
 * dependencies so both the server and the browser bundle can import them.
 */

export type Role = 'survivor' | 'killer';

/**
 * Overall health of the background poller, surfaced to the UI so it can show an
 * honest status instead of pretending stale/fallback data is live.
 *
 * - `initializing`: first poll pass has not completed yet.
 * - `ok`:           at least one region returned real data this cycle.
 * - `degraded`:     serving last-known-good; recent reads were fallback/failed.
 * - `paused`:       deliberately backed off (rate limited / repeated failures).
 * - `error`:        cannot poll at all (e.g. version/category unresolved).
 */
export type PollerStatus = 'initializing' | 'ok' | 'degraded' | 'paused' | 'error';

/** A single region's cached incentive, as served to the browser. */
export interface RegionIncentive {
  /** AWS-style region id, e.g. "eu-central-1". */
  region: string;
  /** Human label, e.g. "EU Central (Frankfurt)". */
  displayName: string;
  /** Flag emoji. */
  flag: string;
  /** Bonus percent for the survivor role (e.g. 75 => +75% => x1.75). */
  survivor: number;
  /** Bonus percent for the killer role. */
  killer: number;
  /** Live killer:survivor queue ratio. Real data only when this is non-zero. */
  ratio: number;
  /** True once we have ever received a real (ratio !== 0) reading for it. */
  isReal: boolean;
  /** True when the most recent attempt did not return real data (showing last-good). */
  stale: boolean;
  /** ISO timestamp of the last real reading, or null if never. */
  lastUpdated: string | null;
}

/** Payload served by `GET /api/incentives`. The browser only ever reads this. */
export interface IncentivesPayload {
  /** ISO timestamp the last full poll pass completed. */
  updatedAt: string | null;
  /** ISO timestamp the current/last poll pass started. */
  pollStartedAt: string | null;
  /** ISO timestamp this snapshot was generated (always now). */
  generatedAt: string;
  /** Body `platform`: Windows | EGS | GRDK. */
  platform: string;
  /** Auth provider: steam | epic. */
  provider: string;
  /** Resolved client version string, e.g. "DBD_Sushi_REL_Steam_Shipping_9_3420587". */
  version: string | null;
  /** Resolved incentive category, e.g. "sushi-rel-3420587-live". */
  category: string | null;
  /** When set, only this region is polled and the single-server layout is used. */
  forcedRegion: string | null;
  status: PollerStatus;
  statusReason: string | null;
  /** Hint for how often the browser should re-read this endpoint (seconds). */
  refreshSeconds: number;
  /** Paginate above this many regions. */
  pageSize: number;
  regions: RegionIncentive[];
}

/** Health payload served by `GET /healthz` (always unauthenticated). */
export interface HealthPayload {
  status: 'ok' | 'unhealthy';
  uptimeSeconds: number;
  cacheAgeSeconds: number | null;
  pollerStatus: PollerStatus;
  regionsCached: number;
}
