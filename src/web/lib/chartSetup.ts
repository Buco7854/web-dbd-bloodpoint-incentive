import {
  Chart as ChartJS,
  Filler,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';

// Register only the Chart.js pieces our charts use (tree-shaking friendly), plus
// the zoom/pan plugin. Side-effect import; lazy-loaded off the critical bundle.
ChartJS.register(LineController, LineElement, PointElement, LinearScale, Filler, Tooltip, zoomPlugin);

export const CHART_GRID = 'rgba(255,255,255,0.06)';
export const CHART_AXIS = 'rgba(255,255,255,0.1)';
export const CHART_TICK = '#9aa0aa';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Candidate tick widths, smallest first, all aligning to clock boundaries. */
const TICK_STEPS = [
  MINUTE,
  2 * MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
  DAY,
  2 * DAY,
  7 * DAY,
  14 * DAY,
  30 * DAY,
  90 * DAY,
  180 * DAY,
  365 * DAY,
];

/** How many x-axis ticks fit a chart of the given pixel width. ~90px per tick. */
export function tickTargetForWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 6;
  return Math.max(3, Math.min(8, Math.floor(width / 90)));
}

export function timeTicks(min: number, max: number, target = 7): { values: number[]; step: number } {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return { values: [], step: HOUR };
  }
  const ideal = (max - min) / target;
  const step = TICK_STEPS.find((s) => s >= ideal) ?? TICK_STEPS[TICK_STEPS.length - 1] ?? HOUR;
  // Align to local boundaries: shift into "local epoch", floor to the step, shift back.
  const tzOff = new Date(min).getTimezoneOffset() * MINUTE;
  const first = Math.ceil((min - tzOff) / step) * step + tzOff;
  const values: number[] = [];
  for (let t = first; t <= max && values.length < 1000; t += step) values.push(t);
  return { values, step };
}
