import { multiplier } from './incentive.js';

/** Bonus percent as a signed label, e.g. +75%, +0%. */
export function formatPercent(percent: number): string {
  return `+${Math.round(percent)}%`;
}

/**
 * Bonus percent as a multiplier label: two decimals by default (x1.75, x1.50),
 * whole numbers collapse to x2 / x3, except x1.00 which stays explicit.
 */
export function formatMultiplier(percent: number): string {
  const m = multiplier(percent);
  if (Number.isInteger(m) && m !== 1) return `×${m}`;
  return `×${m.toFixed(2)}`;
}

/** Human "x ago" string from an ISO timestamp relative to `nowMs`. */
export function relativeTime(iso: string | null, nowMs: number = Date.now()): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'unknown';
  const seconds = Math.max(0, Math.round((nowMs - then) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
