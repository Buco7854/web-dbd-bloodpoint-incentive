import { useCallback, useState } from 'react';
import { type BodyPlatform, DEFAULT_PLATFORM, isKnownPlatform } from '@shared/platforms';

const STORAGE_KEY = 'dbd-bp-platform';

function readStored(): BodyPlatform {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && isKnownPlatform(saved)) return saved;
  } catch {
    /* ignore */
  }
  return DEFAULT_PLATFORM;
}

/** The visitor's chosen platform, persisted across visits. Defaults to DEFAULT_PLATFORM so the UI always requests a concrete platform. */
export function usePlatform(): readonly [BodyPlatform, (p: BodyPlatform) => void] {
  const [platform, setPlatformState] = useState<BodyPlatform>(readStored);

  const setPlatform = useCallback((p: BodyPlatform) => {
    setPlatformState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      /* ignore */
    }
  }, []);

  return [platform, setPlatform] as const;
}
