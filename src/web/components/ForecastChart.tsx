import { useMemo } from 'react';
import type { ChartOptions, Plugin } from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatPercent } from '@shared/format';
import type { ActualPoint, ForecastPoint } from '@shared/types';
import { useI18n } from '../i18n';
import { CHART_AXIS, CHART_GRID, CHART_TICK, tickTargetForWidth, timeTicks } from '../lib/chartSetup';
import { FORECAST_COLOR, SERIES_COLOR } from '../lib/regionTheme';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type Role = 'survivor' | 'killer';

interface Props {
  /** Current time; the chart is centered here. */
  now: number;
  /** Future forecast (now .. +24h). */
  points: ForecastPoint[];
  /** Hindcast for the past 24h (what the model predicted ~24h ago). */
  past: ForecastPoint[];
  /** Real observed values over the past 24h. */
  actual: ActualPoint[];
}

function band(hex: string): string {
  return `${hex}1f`; // ~12% alpha
}

const modeOf = (counts: Map<number, number>): number => {
  let best = 0;
  let bestN = -1;
  for (const [v, n] of counts) if (n > bestN || (n === bestN && v > best)) [best, bestN] = [v, n];
  return best;
};

/** Collapse raw readings to one modal value per local hour. */
function actualByHour(actual: ActualPoint[]): Map<number, { survivor: number; killer: number }> {
  const buckets = new Map<number, { s: Map<number, number>; k: Map<number, number> }>();
  for (const a of actual) {
    const h = Math.floor(a.t / HOUR_MS) * HOUR_MS;
    let b = buckets.get(h);
    if (!b) {
      b = { s: new Map(), k: new Map() };
      buckets.set(h, b);
    }
    b.s.set(a.survivor, (b.s.get(a.survivor) ?? 0) + 1);
    b.k.set(a.killer, (b.k.get(a.killer) ?? 0) + 1);
  }
  const out = new Map<number, { survivor: number; killer: number }>();
  for (const [h, b] of buckets) out.set(h, { survivor: modeOf(b.s), killer: modeOf(b.k) });
  return out;
}

/**
 * A 48h window centered on now. Everything is laid on one hourly grid so the lines
 * and tooltips line up by time: the past 24h shows the real values (solid) and, once
 * there's enough history, what the model predicted for them (dashed); the next 24h is
 * the forecast (dashed) with its p25-p75 band.
 */
export default function ForecastChart({ now, points, past, actual }: Props) {
  const { t, lang } = useI18n();

  const data = useMemo(() => {
    const lo = Math.floor((now - DAY_MS) / HOUR_MS) * HOUR_MS;
    const hi = Math.ceil((now + DAY_MS) / HOUR_MS) * HOUR_MS;
    const hours: number[] = [];
    for (let h = lo; h <= hi; h += HOUR_MS) hours.push(h);

    const aMap = actualByHour(actual);
    const pMap = new Map<number, ForecastPoint>();
    for (const p of [...past, ...points]) pMap.set(Math.floor(p.t / HOUR_MS) * HOUR_MS, p);

    const loKey = (role: Role): 'survivorLo' | 'killerLo' => (role === 'survivor' ? 'survivorLo' : 'killerLo');
    const hiKey = (role: Role): 'survivorHi' | 'killerHi' => (role === 'survivor' ? 'survivorHi' : 'killerHi');
    const color = (role: Role) => (role === 'survivor' ? SERIES_COLOR.survivor : SERIES_COLOR.killer);
    const label = (role: Role) => (role === 'survivor' ? t('historySurvivorLine') : t('historyKillerLine'));
    const predicted = (role: Role) => `${label(role)} (${t('forecastPredicted')})`;
    const real = (role: Role) => `${label(role)} (${t('forecastActual')})`;

    const bandFor = (role: Role) => [
      {
        label: '',
        data: hours.map((h) => ({ x: h, y: pMap.get(h)?.[hiKey(role)] ?? null })),
        borderWidth: 0,
        pointRadius: 0,
        fill: false,
        stepped: 'after' as const,
      },
      {
        label: '',
        data: hours.map((h) => ({ x: h, y: pMap.get(h)?.[loKey(role)] ?? null })),
        borderWidth: 0,
        pointRadius: 0,
        backgroundColor: band(FORECAST_COLOR[role]),
        fill: '-1' as const,
        stepped: 'after' as const,
      },
    ];
    const predLine = (role: Role) => ({
      label: predicted(role),
      data: hours.map((h) => {
        const p = pMap.get(h);
        return p ? { x: h, y: p[role], lo: p[loKey(role)], hi: p[hiKey(role)] } : { x: h, y: null };
      }),
      borderColor: FORECAST_COLOR[role],
      backgroundColor: FORECAST_COLOR[role],
      borderDash: [5, 4],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      stepped: 'after' as const,
    });
    const actLine = (role: Role) => ({
      label: real(role),
      data: hours.map((h) => ({ x: h, y: aMap.get(h)?.[role] ?? null })),
      borderColor: color(role),
      backgroundColor: color(role),
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      stepped: 'after' as const,
    });

    return {
      datasets: [
        ...bandFor('survivor'),
        ...bandFor('killer'),
        actLine('survivor'),
        actLine('killer'),
        predLine('survivor'),
        predLine('killer'),
      ],
    };
  }, [now, points, past, actual, t]);

  const nowLine = useMemo<Plugin<'line'>>(
    () => ({
      id: 'nowLine',
      afterDraw(chart) {
        const x = chart.scales.x;
        if (!x) return;
        const px = x.getPixelForValue(now);
        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(px, top);
        ctx.lineTo(px, bottom);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.stroke();
        ctx.restore();
      },
    }),
    [now],
  );

  const options = useMemo<ChartOptions<'line'>>(() => {
    const tickFmt = new Intl.DateTimeFormat(lang, { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'linear',
          min: now - DAY_MS,
          max: now + DAY_MS,
          grid: { display: false },
          border: { color: CHART_AXIS },
          afterBuildTicks: (axis) => {
            const target = tickTargetForWidth(axis.chart.width);
            axis.ticks = timeTicks(axis.min, axis.max, target).values.map((value) => ({ value }));
          },
          ticks: {
            color: CHART_TICK,
            font: { size: 11 },
            maxRotation: 0,
            autoSkip: false,
            callback: (value) => tickFmt.format(new Date(Number(value))),
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
          filter: (item) => item.dataset.label !== '' && Number.isFinite(item.parsed.y),
          callbacks: {
            title: (items) => (items[0] ? tickFmt.format(new Date(Number(items[0].parsed.x))) : ''),
            label: (item) => {
              const raw = item.raw as { y: number; lo?: number; hi?: number };
              const value = formatPercent(Number(item.parsed.y));
              const range =
                raw.lo != null && raw.hi != null && raw.lo !== raw.hi
                  ? ` (${formatPercent(raw.lo)}–${formatPercent(raw.hi)})`
                  : '';
              return ` ${item.dataset.label}: ${value}${range}`;
            },
          },
        },
      },
    };
  }, [lang, now]);

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-bone-300">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLOR.survivor }} />
          {t('historySurvivorLine')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLOR.killer }} />
          {t('historyKillerLine')}
        </span>
        <span className="text-bone-500">{t('forecastLegendNote')}</span>
      </div>
      <div className="h-72 w-full sm:h-80">
        <Line data={data} options={options} plugins={[nowLine]} />
      </div>
    </div>
  );
}
