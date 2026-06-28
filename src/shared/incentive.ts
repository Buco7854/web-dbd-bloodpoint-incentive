import type { Role } from './types.js';

/**
 * A matchIncentives response is real only when `ratio !== 0`. A wrong
 * category/platform or throttling doesn't error; it returns a constant
 * placeholder (typically survivor:200 / killer:0 / ratio:0) that must never be
 * shown as live data.
 */
export function isRealResponse(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio !== 0;
}

/** Bonus percent -> multiplier. 75 => 1.75, 0 => 1, 100 => 2. */
export function multiplier(percent: number): number {
  return 1 + percent / 100;
}

/** The role that currently carries the bonus, or null when neither does. */
export function headlineRole(survivor: number, killer: number): Role | null {
  if (survivor <= 0 && killer <= 0) return null;
  return killer > survivor ? 'killer' : 'survivor';
}

/** The headline number = the higher of the two roles' bonus percentages. */
export function headlinePercent(survivor: number, killer: number): number {
  return Math.max(survivor, killer);
}
