import { ALL_REGION_IDS } from '../../shared/regions.js';
import { randInt } from '../../common/async.js';

export interface LatencyEntry {
  latency: number;
  regionName: string;
}

/**
 * Steers BHVR to the target region by giving it the lowest ping while reporting
 * all regions like a real client (target 18-45 ms, rest 70-280 ms; no synthetic
 * 1/9999 tells).
 */
export function buildLatencies(
  targetRegion: string,
  regions: readonly string[] = ALL_REGION_IDS,
): LatencyEntry[] {
  return regions.map((regionName) => ({
    regionName,
    latency: regionName === targetRegion ? randInt(18, 45) : randInt(70, 280),
  }));
}
