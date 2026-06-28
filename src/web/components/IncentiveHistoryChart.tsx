import { useMemo } from 'react';
import type { Chart, ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatPercent } from '@shared/format';
import type { HistoryPoint } from '@shared/types';
import { useI18n } from '../i18n';
import { CHART_AXIS, CHART_GRID, CHART_TICK, tickTargetForWidth, timeTicks } from '../lib/chartSetup';
import { SERIES_COLOR } from '../lib/regionTheme';

const DAY_MS = 24 * 60 * 60 * 1000;

interface Props {
  points: HistoryPoint[];
  /** Current visible window (controlled): also the chart's x min/max. */
  range: { from: number; to: number };
  /** The region's overall data extent, used to bound zoom/pan. Null if unknown. */
  extent: { firstAt: number; lastAt: number } | null;
  /** Called when the user zooms/pans, with the new visible window. */
  onRangeChange: (from: number, to: number) => void;
}

/** Zoomable/pannable chart of the survivor & killer bonus over time; lazy-loaded to keep Chart.js out of the dashboard bundle. */
export default function IncentiveHistoryChart({ points, range, extent, onRangeChange }: Props) {
  const { t, lang } = useI18n();

  const data = useMemo(
    () => ({
      datasets: [
        {
          label: t('historySurvivorLine'),
          data: points.map((p) => ({ x: p.t, y: p.survivor })),
          borderColor: SERIES_COLOR.survivor,
          backgroundColor: SERIES_COLOR.survivor,
          stepped: 'after' as const,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
        {
          label: t('historyKillerLine'),
          data: points.map((p) => ({ x: p.t, y: p.killer })),
          borderColor: SERIES_COLOR.killer,
          backgroundColor: SERIES_COLOR.killer,
          stepped: 'after' as const,
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
        },
      ],
    }),
    [points, t],
  );

  const options = useMemo<ChartOptions<'line'>>(() => {
    const timeFmt = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
    const dateFmt = new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric' });
    const fullFmt = new Intl.DateTimeFormat(lang, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const emitRange = ({ chart }: { chart: Chart }) => {
      const x = chart.scales.x;
      if (x) onRangeChange(x.min, x.max);
    };
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'linear',
          min: range.from,
          max: range.to,
          grid: { display: false },
          border: { color: CHART_AXIS },
          // Place ticks at regular clock-aligned steps (whole hours/days) rather
          // than at arbitrary round-millisecond values, recomputed live on zoom.
          afterBuildTicks: (axis) => {
            const target = tickTargetForWidth(axis.chart.width);
            axis.ticks = timeTicks(axis.min, axis.max, target).values.map((value) => ({ value }));
          },
          ticks: {
            color: CHART_TICK,
            font: { size: 11 },
            maxRotation: 0,
            autoSkip: false,
            callback: (value) => {
              const v = Number(value);
              // Label whole midnights as dates, everything else as the time of day.
              const d = new Date(v);
              const isMidnight = d.getHours() === 0 && d.getMinutes() === 0;
              return isMidnight ? dateFmt.format(d) : timeFmt.format(d);
            },
          },
        },
        y: {
          min: 0,
          grid: { color: CHART_GRID },
          border: { display: false },
          ticks: {
            color: CHART_TICK,
            font: { size: 11 },
            callback: (value) => formatPercent(Number(value)),
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#100f15',
          borderColor: 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          titleColor: '#cfc7b8',
          bodyColor: '#f5f1ea',
          padding: 10,
          callbacks: {
            title: (items) => (items[0] ? fullFmt.format(new Date(Number(items[0].parsed.x))) : ''),
            label: (item) => ` ${item.dataset.label}: ${formatPercent(Number(item.parsed.y))}`,
          },
        },
        zoom: {
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'x',
            onZoomComplete: emitRange,
          },
          pan: { enabled: true, mode: 'x', onPanComplete: emitRange },
          // Bound zoom/pan to where data actually exists, so you can't zoom out
          // into a long empty stretch (which crams the readings against one edge
          // and collapses the axis to a couple of labels). Falls back to the last
          // year until the extent is known; never pans into the future.
          limits: {
            x: {
              min: extent?.firstAt ?? Date.now() - 365 * DAY_MS,
              max: Date.now(),
              minRange: 10 * 60_000,
            },
          },
        },
      },
    };
  }, [lang, range.from, range.to, extent?.firstAt, onRangeChange]);

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-bone-300">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLOR.survivor }} />
          {t('historySurvivorLine')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLOR.killer }} />
          {t('historyKillerLine')}
        </span>
        <span className="text-bone-500">{t('historyZoomHint')}</span>
      </div>
      <div className="h-72 w-full touch-pan-y sm:h-80">
        <Line data={data} options={options} />
      </div>
    </div>
  );
}
