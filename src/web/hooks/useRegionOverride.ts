import { useCallback, useState } from 'react';

const STORAGE_KEY = 'dbd-bp-region-override';

/** A region the visitor manually pinned as theirs, overriding latency detection. */
export function useRegionOverride(): readonly [string | null, (region: string | null) => void] {
  const [override, setOverrideState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });

  const setOverride = useCallback((region: string | null) => {
    setOverrideState(region);
    try {
      if (region) localStorage.setItem(STORAGE_KEY, region);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return [override, setOverride] as const;
}
