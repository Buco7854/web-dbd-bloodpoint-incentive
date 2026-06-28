import { useEffect, useState } from 'react';
import type { BodyPlatform } from '@shared/platforms';
import type { RegionActivityPayload } from '@shared/types';
import { fetchRegionActivity } from '../api';

export interface RegionActivityState {
  data: RegionActivityPayload | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Fetches a region's latest readings and change log. Window-independent (unlike
 * useHistoryRange), so keyed only by platform+region. Refetches when `reloadKey`
 * changes so the activity list tracks new readings in real time. Aborts in-flight
 * on change/unmount.
 */
export function useRegionActivity(platform: BodyPlatform, region: string, reloadKey = 0): RegionActivityState {
  const [data, setData] = useState<RegionActivityPayload | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    fetchRegionActivity(platform, region, controller.signal)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled || (err as Error).name === 'AbortError') return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [platform, region, reloadKey]);

  return { data, error, loading };
}
