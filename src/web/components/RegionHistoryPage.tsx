import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { BodyPlatform } from '@shared/platforms';
import { getRegionMeta } from '@shared/regions';
import type { HistoryScale, IncentivesPayload, RegionIncentive } from '@shared/types';
import { useI18n } from '../i18n';
import { formatUpdated } from '../i18n/time';
import { useHistoryRange } from '../hooks/useHistoryRange';
import { useRegionActivity } from '../hooks/useRegionActivity';
import { Badge } from './Badge';
import { ErrorState } from './ErrorState';
import { ForecastSection } from './ForecastSection';
import { FreshnessDot } from './FreshnessChip';
import { ArrowLeftIcon } from './icons';
import { RegionActivity } from './RegionActivity';
import { RegionLabel } from './RegionLabel';
import { ChartSkeleton } from './Skeletons';
import { RoleStat } from './RoleStat';
import { ScaleToggle } from './ScaleToggle';

// Keep Chart.js out of the dashboard's critical bundle.
const IncentiveHistoryChart = lazy(() => import('./IncentiveHistoryChart'));

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** How wide a window each preset frames (the chart stays freely zoomable within/around it). */
const PRESET_WINDOW_MS: Record<HistoryScale, number> = {
  hourly: HOUR,
  daily: DAY,
  weekly: 7 * DAY,
  monthly: 30 * DAY,
  yearly: 365 * DAY,
};

/** Debounce zoom/pan-driven refetches so a gesture doesn't spray requests. */
const RANGE_DEBOUNCE_MS = 300;

interface Props {
  data: IncentivesPayload | null;
  platform: BodyPlatform;
  regionId: string;
  now: number;
  onBack: () => void;
}

/** Fallback label for a region this instance doesn't currently cover. */
function placeholderRegion(regionId: string): RegionIncentive {
  const info = getRegionMeta(regionId);
  return {
    region: regionId,
    displayName: info?.displayName ?? regionId,
    flag: info?.flag ?? '',
    survivor: 0,
    killer: 0,
    ratio: 0,
    isReal: false,
    stale: true,
    lastUpdated: null,
  };
}

export function RegionHistoryPage({ data, platform, regionId, now, onBack }: Props) {
  const { t } = useI18n();
  const [reloadNonce, setReloadNonce] = useState(0);
  // The visible window. Set immediately (presets + zoom/pan) so the chart's
  // x-axis stays in sync with what's on screen; a debounced copy drives fetches.
  const [range, setRange] = useState(() => {
    const to = Date.now();
    return { from: to - PRESET_WINDOW_MS.hourly, to };
  });
  const [fetchRange, setFetchRange] = useState(range);
  useEffect(() => {
    const id = window.setTimeout(() => setFetchRange(range), RANGE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [range]);

  const region = data?.regions.find((r) => r.region === regionId) ?? placeholderRegion(regionId);
  // The live SSE update bumps this region's lastUpdated whenever a fresh reading
  // lands, so folding it into the reload key refetches the charts in real time. The
  // manual-retry nonce rides along so the retry button still forces a reload.
  const reloadKey = (region.lastUpdated ? Date.parse(region.lastUpdated) : 0) + reloadNonce;

  const { data: history, error, loading } = useHistoryRange(
    platform,
    regionId,
    fetchRange.from,
    fetchRange.to,
    reloadKey,
  );
  const activity = useRegionActivity(platform, regionId, reloadKey);

  const points = history?.points ?? [];
  // Once a window has shown data, keep the (zoomable) chart mounted so the user
  // never loses the controls by panning into an empty stretch.
  const everHadData = useRef(false);
  if (points.length > 0) everHadData.current = true;
  // Latch the region's overall data extent so zoom/pan and presets stay within
  // where readings actually exist (no panning into a year of emptiness).
  const extent = useRef<{ firstAt: number; lastAt: number } | null>(null);
  if (history?.firstAt != null && history.lastAt != null) {
    extent.current = { firstAt: history.firstAt, lastAt: history.lastAt };
  }

  // Presets just frame a window; the buttons are momentary (they don't latch active).
  const applyPreset = (p: HistoryScale) => {
    const to = Date.now();
    // Don't frame more emptiness than exists: start no earlier than the first reading.
    const from = Math.max(to - PRESET_WINDOW_MS[p], extent.current?.firstAt ?? -Infinity);
    setRange({ from, to });
  };

  const handleRangeChange = useCallback((from: number, to: number) => {
    setRange({ from, to });
  }, []);

  // On the first load, if the default window reaches back before any data exists
  // (a region that only started reporting recently), pull its start up to the
  // first reading so the readings fill the chart instead of hugging the right.
  const clampedInit = useRef(false);
  useEffect(() => {
    if (clampedInit.current) return;
    const ext = extent.current;
    if (!ext) return;
    clampedInit.current = true;
    if (range.from < ext.firstAt) {
      setRange((r) => ({ from: Math.max(r.from, ext.firstAt), to: r.to }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  const renderChart = () => {
    if (!history && loading) {
      return <ChartSkeleton />;
    }
    if (!history && error) {
      return <ErrorState message={error.message} onRetry={() => setReloadNonce((n) => n + 1)} />;
    }
    if (!everHadData.current && points.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/5 bg-void-700/30 py-20 text-center">
          <p className="font-display text-lg text-bone-200">{t('historyEmptyTitle')}</p>
          <p className="max-w-sm text-sm text-bone-500">{t('historyEmptyBody')}</p>
        </div>
      );
    }
    return (
      <Suspense fallback={<ChartSkeleton />}>
        <IncentiveHistoryChart
          points={points}
          range={range}
          extent={extent.current}
          onRangeChange={handleRangeChange}
        />
      </Suspense>
    );
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 text-sm text-bone-400 transition hover:text-bone-100"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        {t('historyBack')}
      </button>

      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <RegionLabel region={region} size="hero" />
          {/* This region's own freshness (not the platform-wide chip, which would mislead here). */}
          {region.isReal && (
            <div className="flex flex-col items-end gap-2">
              <span className="inline-flex items-center gap-2 text-xs text-bone-500">
                <FreshnessDot status={region.stale ? 'degraded' : 'ok'} />
                {formatUpdated(region.lastUpdated, now, t)}
              </span>
              {region.stale && <Badge tone="amber">{t('badgeStale')}</Badge>}
            </div>
          )}
        </div>

        {region.isReal && (
          <div className="grid gap-2 sm:max-w-md">
            <RoleStat role="survivor" percent={region.survivor} emphasized={region.survivor > 0} />
            <RoleStat role="killer" percent={region.killer} emphasized={region.killer > 0} />
          </div>
        )}

        <section className="rounded-2xl border border-white/10 bg-void-800/50 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-wide text-bone-100">
              {t('historyTitle')}
            </h2>
            <ScaleToggle value={null} onChange={applyPreset} />
          </div>
          {renderChart()}
        </section>

        <ForecastSection platform={platform} regionId={regionId} reloadKey={reloadKey} />

        <RegionActivity
          recent={activity.data?.recent ?? []}
          changes={activity.data?.changes ?? []}
          loading={activity.loading && !activity.data}
        />
      </div>
    </main>
  );
}
