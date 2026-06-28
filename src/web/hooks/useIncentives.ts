import { useCallback, useEffect, useRef, useState } from 'react';
import type { BodyPlatform } from '@shared/platforms';
import type { Incentives, IncentivesPayload, SiteMeta } from '@shared/types';
import { fetchSiteMeta, incentivesStreamUrl } from '../api';

const RECONNECT_MS = 5000;
const RECONNECT_JITTER_MS = 1500;
const DISCONNECT_GRACE_MS = 2500;

/** Validate a parsed SSE frame at the trust boundary before it reaches the UI. */
function isIncentives(v: unknown): v is Incentives {
  const o = v as Partial<Incentives> | null;
  return !!o && typeof o === 'object' && Array.isArray(o.regions) && typeof o.status === 'string';
}

/** Fallback so a failed metadata fetch degrades gracefully instead of hanging. */
function fallbackMeta(platform: BodyPlatform): SiteMeta {
  return {
    platforms: [platform],
    contactEmail: null,
    discordUrl: null,
    matrixUrl: null,
    agentSetupUrl: '',
    contributeEnabled: false,
    pageSize: 20,
  };
}

export interface IncentivesState {
  data: IncentivesPayload | null;
  error: Error | null;
  loading: boolean;
  /** Re-initialise the live connection (used by the refresh button). */
  refresh: () => void;
  refreshing: boolean;
  /** True while the live stream is dropped and retrying (data may be stale). */
  disconnected: boolean;
}

/**
 * Subscribes to a platform's incentives over an SSE stream so the hub pushes
 * updates instead of the browser polling. On a drop it reconnects periodically
 * and surfaces `disconnected`. Switching platform or refreshing reopens it.
 */
export function useIncentives(platform: BodyPlatform): IncentivesState {
  const [snapshot, setSnapshot] = useState<Incentives | null>(null);
  const [meta, setMeta] = useState<SiteMeta | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const gotData = useRef(false);
  const disconnectedRef = useRef(false);
  disconnectedRef.current = disconnected;

  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let bannerTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    gotData.current = false;
    setLoading(true);

    const clearBanner = (): void => {
      if (bannerTimer) {
        clearTimeout(bannerTimer);
        bannerTimer = null;
      }
    };

    const open = (): void => {
      if (stopped) return;
      es = new EventSource(incentivesStreamUrl(platform));

      es.onopen = (): void => {
        clearBanner();
        setDisconnected(false);
      };

      es.onmessage = (ev: MessageEvent<string>): void => {
        try {
          const payload: unknown = JSON.parse(ev.data);
          if (!isIncentives(payload)) {
            console.warn('discarded an incentives frame with an unexpected shape');
            return;
          }
          gotData.current = true;
          clearBanner();
          setSnapshot(payload);
          setError(null);
          setLoading(false);
          setRefreshing(false);
          setDisconnected(false);
        } catch (err) {
          // Ignore a malformed frame. The next one will refresh the snapshot. Log it
          // so a persistently broken stream is diagnosable in the field.
          console.warn('discarded a malformed incentives stream frame', err);
        }
      };

      es.onerror = (): void => {
        // EventSource dropped. We close and drive reconnection ourselves, keeping the
        // last good data on screen. Retry on a fixed interval (light jitter so a hub
        // restart doesn't make every client reconnect on the same tick).
        es?.close();
        es = null;
        if (stopped) return;
        setRefreshing(false);
        if (gotData.current) {
          if (!bannerTimer) bannerTimer = setTimeout(() => setDisconnected(true), DISCONNECT_GRACE_MS);
        } else {
          // Never connected yet: show the error screen (its retry == refresh).
          setLoading(false);
          setError(new Error('Unable to reach the live updates stream.'));
        }
        timer = setTimeout(open, RECONNECT_MS + Math.random() * RECONNECT_JITTER_MS);
      };
    };

    open();
    return () => {
      stopped = true;
      es?.close();
      if (timer) clearTimeout(timer);
      clearBanner();
    };
  }, [platform, reconnectNonce]);

  useEffect(() => {
    const onVisible = (): void => {
      if (document.visibilityState === 'visible' && disconnectedRef.current) {
        setReconnectNonce((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Site metadata (platforms, links, page size) is hub-wide, so fetch it once and
  // merge it with the live incentives into the view-model the components expect.
  useEffect(() => {
    const ac = new AbortController();
    fetchSiteMeta(ac.signal)
      .then(setMeta)
      .catch((err) => {
        // Don't let a failed metadata fetch deadlock the app on the skeleton: fall
        // back to safe defaults so the incentives still render. (Ignore aborts.)
        if (!ac.signal.aborted) setMeta(fallbackMeta(platform));
        void err;
      });
    return () => ac.abort();
  }, [platform, reconnectNonce]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setError(null);
    setReconnectNonce((n) => n + 1); // re-runs the effect: closes and reopens the stream
  }, []);

  const data: IncentivesPayload | null = snapshot && meta ? { ...snapshot, ...meta } : null;
  return { data, error, loading: loading || (snapshot != null && meta == null), refresh, refreshing, disconnected };
}
