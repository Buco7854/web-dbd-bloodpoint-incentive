import { lazy, Suspense } from 'react';
import clsx from 'clsx';
import { formatPercent } from '@shared/format';
import type { BodyPlatform } from '@shared/platforms';
import type { ForecastConfidence, ForecastPoint } from '@shared/types';
import { useI18n } from '../i18n';
import { useForecast } from '../hooks/useForecast';
import { ChartSkeleton } from './Skeletons';

// Chart.js is heavy; load it only when a forecast is actually shown.
const ForecastChart = lazy(() => import('./ForecastChart'));

const CONF: Record<ForecastConfidence, { key: 'forecastConfHigh' | 'forecastConfMedium' | 'forecastConfLow'; cls: string }> = {
  high: { key: 'forecastConfHigh', cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' },
  medium: { key: 'forecastConfMedium', cls: 'border-ember-500/30 bg-ember-500/10 text-ember-300' },
  low: { key: 'forecastConfLow', cls: 'border-white/10 bg-white/5 text-bone-400' },
};

interface Props {
  platform: BodyPlatform;
  regionId: string;
  /** Bumps to refetch the forecast when a fresh reading lands (real-time). */
  reloadKey?: number;
}

/** "Predicted bonus (next 24h)" panel: a textual peak summary plus the band chart. */
export function ForecastSection({ platform, regionId, reloadKey }: Props) {
  const { t, lang } = useI18n();
  const { data, loading, error } = useForecast(platform, regionId, reloadKey);
  const points = data?.points ?? [];
  const past = data?.past ?? [];
  const actual = data?.actual ?? [];
  // Worth showing if the forecast or the recent real data has any non-zero level.
  const hasSignal =
    points.some((p) => p.survivor || p.killer || p.survivorHi || p.killerHi) ||
    actual.some((a) => a.survivor || a.killer);

  const fmtTime = (ms: number): string =>
    new Intl.DateTimeFormat(lang, { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  const peakBy = (sel: (p: ForecastPoint) => number): ForecastPoint | null =>
    points.reduce<ForecastPoint | null>((best, p) => (best && sel(best) >= sel(p) ? best : p), null);

  const renderSummary = () => {
    const sPeak = peakBy((p) => p.survivor);
    const kPeak = peakBy((p) => p.killer);
    const lines: string[] = [];
    if (sPeak && sPeak.survivor > 0)
      lines.push(t('forecastPeakSurvivor', { time: fmtTime(sPeak.t), value: formatPercent(sPeak.survivor) }));
    if (kPeak && kPeak.killer > 0)
      lines.push(t('forecastPeakKiller', { time: fmtTime(kPeak.t), value: formatPercent(kPeak.killer) }));
    if (lines.length === 0) return <p className="text-sm text-bone-500">{t('forecastFlat')}</p>;
    return (
      <ul className="space-y-1 text-sm text-bone-300">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    );
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-void-800/50 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-wide text-bone-100">{t('forecastTitle')}</h2>
        {data && (
          <span className={clsx('rounded-full border px-2.5 py-1 text-xs font-medium', CONF[data.confidence].cls)}>
            {t(CONF[data.confidence].key)}
          </span>
        )}
      </div>
      {loading && !data ? (
        <ChartSkeleton />
      ) : (error && !data) || !hasSignal ? (
        <p className="text-sm text-bone-500">{t('forecastEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {renderSummary()}
          <Suspense fallback={<ChartSkeleton />}>
            <ForecastChart now={data?.generatedAt ?? Date.now()} points={points} past={past} actual={actual} />
          </Suspense>
        </div>
      )}
    </section>
  );
}
