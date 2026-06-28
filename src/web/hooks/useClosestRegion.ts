import { useCallback, useEffect, useState } from 'react';
import { ALL_REGION_IDS } from '@shared/regions';
import { detectClosestRegion } from '../lib/regionLatency';

const CACHE_KEY = 'dbd-bp-closest-region';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // re-measure at most once a day

export type LocateStatus = 'idle' | 'detecting' | 'ready' | 'error';

export interface ClosestRegion {
  /** Lowest-latency region id, or null until known / on failure. */
  region: string | null;
  status: LocateStatus;
  /** Clear the cache and probe again (e.g. after a failure). */
  retry: () => void;
}

interface Cached {
  region: string;
  at: number;
}

function readCache(valid: readonly string[]): Cached | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Cached;
    if (typeof c?.region !== 'string' || typeof c?.at !== 'number') return null;
    return valid.includes(c.region) ? c : null;
  } catch {
    return null;
  }
}

/**
 * Best-effort guess of the visitor's matchmaking region: the lowest-latency one
 * across ALL DBD regions, not just those this instance covers. Runs once in the
 * background, caches in localStorage, and never blocks render.
 */
export function useClosestRegion(): ClosestRegion {
  const [region, setRegion] = useState<string | null>(null);
  const [status, setStatus] = useState<LocateStatus>('idle');
  const [nonce, setNonce] = useState(0);
  const key = ALL_REGION_IDS.join(',');

  const retry = useCallback(() => {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* ignore */
    }
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const ids = key ? key.split(',') : [];
    if (ids.length < 1) {
      setRegion(null);
      setStatus('idle');
      return;
    }

    const cached = readCache(ids);
    if (cached && Date.now() - cached.at <= CACHE_TTL_MS) {
      setRegion(cached.region);
      setStatus('ready');
      return;
    }

    setRegion(null);
    setStatus('detecting');
    const controller = new AbortController();
    // A stale cached region (TTL expired) still biases the re-probe so a near-tie
    // between two regions doesn't flip the result on every cold load.
    detectClosestRegion(ids, { signal: controller.signal, preferred: cached?.region })
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result) {
          setRegion(result.region);
          setStatus('ready');
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ region: result.region, at: Date.now() }));
          } catch {
            /* ignore */
          }
        } else {
          setRegion(null);
          setStatus('error');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRegion(null);
          setStatus('error');
        }
      });

    return () => controller.abort();
  }, [key, nonce]);

  return { region, status, retry };
}
