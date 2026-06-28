/**
 * Shared domain + transport types. Pure TypeScript with no Node or DOM
 * dependencies so the agent, the hub, and the browser bundle can all import them.
 */

import type { BodyPlatform } from './platforms.js';

export type Role = 'survivor' | 'killer';

/**
 * Overall health of a platform's data, surfaced to the UI so it can show an
 * honest status instead of pretending stale/missing data is live.
 *
 * - `initializing`: no agent has reported a real reading for this platform yet.
 * - `ok`:           at least one region has a fresh real reading.
 * - `degraded`:     only stale readings; every agent has gone quiet recently.
 * - `error`:        no agents are configured to cover this platform.
 */
export type DataStatus = 'initializing' | 'ok' | 'degraded' | 'error';

/** A single region's incentive, as served to the browser. */
export interface RegionIncentive {
  /** AWS-style region id, e.g. "eu-central-1". */
  region: string;
  /** Human label, e.g. "EU Central (Frankfurt)". */
  displayName: string;
  flag: string;
  /** Bonus percent for the survivor role (e.g. 75 => +75% => x1.75). */
  survivor: number;
  killer: number;
  /** Live killer:survivor queue ratio. Real data only when this is non-zero. */
  ratio: number;
  /** True once a real (ratio !== 0) reading has ever been received for it. */
  isReal: boolean;
  /** True when the latest reading is older than the freshness window (or missing). */
  stale: boolean;
  /** ISO timestamp of the last real reading, or null if never. */
  lastUpdated: string | null;
}

/**
 * One reading an agent pushes to the hub for its single assigned region and
 * platform. The hub keeps the most recent reading per (region, platform).
 */
export interface AgentReport {
  region: string;
  platform: BodyPlatform;
  survivor: number;
  killer: number;
  ratio: number;
  isReal: boolean;
  /** Resolved client version the reading was taken with. */
  version: string | null;
  /** Resolved incentive category the reading was taken with. */
  category: string | null;
  /** DBD's reported refresh cadence (seconds) at read time; drives dynamic cadence. */
  refreshTimeSeconds: number | null;
  /** ISO timestamp (UTC) the agent took the reading. */
  measuredAt: string;
}

/**
 * What the hub tells an agent to poll, derived from the agent's key. The hub owns
 * the cadence: the agent obeys the interval and the phase offset (the latter
 * evenly spaces redundant agents on the same region+platform so they don't bunch
 * up). The agent may still refuse to start if the interval is below its own floor.
 */
export interface AgentAssignment {
  region: string;
  platform: BodyPlatform;
  /** Minimum seconds between requests, set by the hub. */
  pollMinSeconds: number;
  /** Maximum seconds between requests, set by the hub. */
  pollMaxSeconds: number;
  /** Seconds to delay the first request, so redundant agents are evenly spaced. */
  phaseOffsetSeconds: number;
  /**
   * Whether this agent should poll once immediately on startup instead of waiting
   * for its slot. The hub sets this for a single lead agent per platform, and only
   * while DBD's refreshTime is still unknown, so one reading seeds the cadence for
   * everyone without the whole fleet polling at once.
   */
  probeImmediately: boolean;
}

/**
 * The current incentives served by `GET /api/v1/platforms/{platform}/incentives`
 * and the SSE stream. Incentive data only; hub-wide config lives in `SiteMeta`.
 */
export interface Incentives {
  /** ISO timestamp of the most recent reading across this platform, or null. */
  updatedAt: string | null;
  /** ISO timestamp this response was generated (always now). */
  generatedAt: string;
  platform: BodyPlatform;
  /** Representative client version for this platform (most recent reading). */
  version: string | null;
  /** Representative incentive category for this platform. */
  category: string | null;
  status: DataStatus;
  statusReason: string | null;
  regions: RegionIncentive[];
}

/** Hub-wide UI/config bootstrap, served once by `GET /api/v1/meta`. */
export interface SiteMeta {
  /** Every platform the hub has agents for, so the UI can offer a switcher. */
  platforms: BodyPlatform[];
  /** Optional contact email shown in the registration banner/page and footer. */
  contactEmail: string | null;
  /** Optional community links, shown next to the contact email. */
  discordUrl: string | null;
  matrixUrl: string | null;
  /** Link to the agent setup instructions. */
  agentSetupUrl: string;
  /** Whether the "contribute data" page/banner is enabled on this instance. */
  contributeEnabled: boolean;
  /** Paginate above this many regions. */
  pageSize: number;
}

/** The browser's merged view-model: the current incentives plus the site metadata. */
export type IncentivesPayload = Incentives & SiteMeta;

/** How many agents cover one region on the current platform (0 = uncovered). */
export interface CoverageEntry {
  region: string;
  displayName: string;
  flag: string;
  agents: number;
}

/** Agent coverage for a platform, served by `GET /api/v1/platforms/{platform}/coverage`. */
export interface CoveragePayload {
  platform: BodyPlatform;
  regions: CoverageEntry[];
}

/**
 * Preset framing for the per-region history graph. These only set the chart's
 * initial visible window; the chart itself is freely zoomable/pannable and
 * refetches whatever range is on screen.
 */
export type HistoryScale = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * One point on the history graph. Always a real observed bonus level: when the
 * range is shown raw it is a single measurement, when bucketed it is the LAST
 * reading of the bucket (never an average, which would invent levels like 135).
 */
export interface HistoryPoint {
  /** Measurement time (raw) or bucket start (bucketed), epoch milliseconds. */
  t: number;
  /** Survivor bonus percent (e.g. 75 => +75%). */
  survivor: number;
  killer: number;
}

/** Whether a range came back as individual measurements or last-value buckets. */
export type HistoryResolution = 'raw' | 'bucketed';

/** Payload served by `GET /api/v1/platforms/{platform}/regions/{region}/history`. */
export interface HistoryRangePayload {
  region: string;
  platform: BodyPlatform;
  /** 'raw' = one point per measurement; 'bucketed' = last-value per bucket. */
  resolution: HistoryResolution;
  /** Bucket width in ms when bucketed, 0 when raw. */
  bucketMs: number;
  points: HistoryPoint[];
  /**
   * The region's overall data extent (epoch ms), independent of the requested
   * window, so the UI can bound zoom/pan to where readings exist. Null if none.
   */
  firstAt: number | null;
  lastAt: number | null;
}

/** One raw (non-bucketed) reading, for the recent-readings / change-log lists. */
export interface ReadingEntry {
  /** Measurement time, epoch milliseconds. */
  t: number;
  survivor: number;
  killer: number;
  /** Live killer:survivor queue ratio at the time of the reading. */
  ratio: number;
}

/** Payload served by `GET /api/v1/platforms/{platform}/regions/{region}/activity`: latest readings and change points. */
export interface RegionActivityPayload {
  region: string;
  platform: BodyPlatform;
  /** Most recent readings, newest first. */
  recent: ReadingEntry[];
  /** Readings where survivor or killer changed from the previous one, newest first. */
  changes: ReadingEntry[];
}

/** How much history backs a forecast, surfaced so the UI can hedge thin data. */
export type ForecastConfidence = 'high' | 'medium' | 'low';

/** One predicted hour: per-role median with a p25-p75 uncertainty band. */
export interface ForecastPoint {
  /** Start of the predicted hour, epoch milliseconds. */
  t: number;
  survivor: number;
  survivorLo: number;
  survivorHi: number;
  killer: number;
  killerLo: number;
  killerHi: number;
}

/** Payload served by `GET /api/v1/platforms/{platform}/regions/{region}/forecast`. */
export interface ActualPoint {
  t: number;
  survivor: number;
  killer: number;
}

export interface ForecastPayload {
  region: string;
  platform: BodyPlatform;
  /** When the forecast was computed, epoch milliseconds. */
  generatedAt: number;
  /** Number of hours predicted ahead. */
  horizonHours: number;
  confidence: ForecastConfidence;
  points: ForecastPoint[];
  /** What the model predicted ~24h ago for the now-elapsed window (leak-free hindcast). */
  past: ForecastPoint[];
  /** Real observed values over the past window, to compare against `past`. */
  actual: ActualPoint[];
}

/** Health payload served by `GET /healthz` (always unauthenticated). */
export interface HealthPayload {
  status: 'ok' | 'unhealthy';
  uptimeSeconds: number;
  /** Hub: agents configured. Agent: omitted. */
  agentsConfigured?: number;
  /** Hub: regions with at least one reading. */
  regionsReporting?: number;
}
