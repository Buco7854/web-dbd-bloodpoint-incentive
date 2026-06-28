import { useEffect, useState } from 'react';
import type { BodyPlatform } from '@shared/platforms';
import type { ForecastPayload } from '@shared/types';
import { fetchForecast } from '../api';

export interface ForecastState {
  data: ForecastPayload | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Fetches the next-24h bonus forecast for a region+platform. Refetches when
 * `reloadKey` changes (the region view feeds it the live freshness timestamp so
 * the forecast tracks new readings in real time).
 */
export function useForecast(platform: BodyPlatform, region: string, reloadKey = 0): ForecastState {
  const [data, setData] = useState<ForecastPayload | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    fetchForecast(platform, region, controller.signal)
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
