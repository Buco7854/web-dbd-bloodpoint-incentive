import type { BodyPlatform } from '@shared/platforms';
import type {
  CoveragePayload,
  ForecastPayload,
  HistoryRangePayload,
  RegionActivityPayload,
  SiteMeta,
} from '@shared/types';

const base = (platform: BodyPlatform): string => `/api/v1/platforms/${encodeURIComponent(platform)}`;

/** Fetches the hub-wide UI/config metadata (platforms, links, page size). */
export async function fetchSiteMeta(signal?: AbortSignal): Promise<SiteMeta> {
  const res = await fetch('/api/v1/meta', { signal, headers: { Accept: 'application/json' } });
  if (res.status === 401) {
    throw new Error('Access denied. This instance is protected; sign in to continue.');
  }
  if (!res.ok) {
    throw new Error(`The metadata service responded with ${res.status}.`);
  }
  return (await res.json()) as SiteMeta;
}

/** Fetches agent coverage per region for a platform. */
export async function fetchCoverage(platform: BodyPlatform, signal?: AbortSignal): Promise<CoveragePayload> {
  const res = await fetch(`${base(platform)}/coverage`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`The coverage service responded with ${res.status}.`);
  }
  return (await res.json()) as CoveragePayload;
}
const regionBase = (platform: BodyPlatform, region: string): string =>
  `${base(platform)}/regions/${encodeURIComponent(region)}`;

/** URL of the live incentives SSE stream for a platform (same-origin EventSource). */
export function incentivesStreamUrl(platform: BodyPlatform): string {
  return `${base(platform)}/incentives/stream`;
}

export async function fetchHistoryRange(
  platform: BodyPlatform,
  region: string,
  from: number,
  to: number,
  signal?: AbortSignal,
): Promise<HistoryRangePayload> {
  const params = new URLSearchParams({
    from: String(Math.round(from)),
    to: String(Math.round(to)),
  });
  const res = await fetch(`${regionBase(platform, region)}/history?${params.toString()}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401) {
    throw new Error('Access denied. This instance is protected; sign in to continue.');
  }
  if (!res.ok) {
    throw new Error(`The history service responded with ${res.status}.`);
  }
  return (await res.json()) as HistoryRangePayload;
}

export async function fetchRegionActivity(
  platform: BodyPlatform,
  region: string,
  signal?: AbortSignal,
): Promise<RegionActivityPayload> {
  const res = await fetch(`${regionBase(platform, region)}/activity`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401) {
    throw new Error('Access denied. This instance is protected; sign in to continue.');
  }
  if (!res.ok) {
    throw new Error(`The activity service responded with ${res.status}.`);
  }
  return (await res.json()) as RegionActivityPayload;
}

export async function fetchForecast(
  platform: BodyPlatform,
  region: string,
  signal?: AbortSignal,
): Promise<ForecastPayload> {
  const res = await fetch(`${regionBase(platform, region)}/forecast`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401) {
    throw new Error('Access denied. This instance is protected; sign in to continue.');
  }
  if (!res.ok) {
    throw new Error(`The forecast service responded with ${res.status}.`);
  }
  return (await res.json()) as ForecastPayload;
}
