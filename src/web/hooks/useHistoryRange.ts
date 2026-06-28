import { useEffect, useState } from 'react';
import type { BodyPlatform } from '@shared/platforms';
import type { HistoryRangePayload } from '@shared/types';
import { fetchHistoryRange } from '../api';

export interface HistoryRangeState {
  data: HistoryRangePayload | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Fetches one region's history for an arbitrary [from, to] window at the server's
 * adaptive resolution. Keeps the last good data on screen during a window change
 * so a zoom/pan refetch doesn't flash empty; aborts in-flight on change/unmount.
 */
export function useHistoryRange(
  platform: BodyPlatform,
  region: string,
  from: number,
  to: number,
  reloadNonce = 0,
): HistoryRangeState {
  const [data, setData] = useState<HistoryRangePayload | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    fetchHistoryRange(platform, region, from, to, controller.signal)
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
  }, [platform, region, from, to, reloadNonce]);

  return { data, error, loading };
}
