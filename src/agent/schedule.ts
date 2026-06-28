import type { AgentAssignment } from '../shared/types.js';

/**
 * The agent's mutable polling schedule, set from the hub's assignment and updated
 * whenever a report response carries a new one. Firing is aligned to wall-clock
 * (`t mod period == phase`), so redundant agents the hub gave different phases to
 * stay evenly spaced regardless of when each started or restarted.
 *
 * The interval uses BOTH bounds: the period is the midpoint of `[min, max]` and
 * the jitter is half the width, so the gap between two polls lands within
 * `[min, max]` (min = closest, max = farthest, midpoint = average) and spreads
 * requests out instead of polling at a fixed rate.
 */
export class Schedule {
  private periodMs: number;
  private jitterMs: number;
  private phaseMs: number;

  constructor(assignment: AgentAssignment) {
    const s = Schedule.fromAssignment(assignment);
    this.periodMs = s.periodMs;
    this.jitterMs = s.jitterMs;
    this.phaseMs = s.phaseMs;
  }

  private static fromAssignment(a: AgentAssignment): { periodMs: number; jitterMs: number; phaseMs: number } {
    const minMs = a.pollMinSeconds * 1000;
    const maxMs = Math.max(a.pollMaxSeconds * 1000, minMs);
    // Centre the beat on the midpoint and swing by half the width, so a poll lands
    // every [min, max] seconds (avg = midpoint). One-sided jitter on a midpoint
    // grid: gaps span [period - jitter, period + jitter] = [min, max].
    const periodMs = Math.max(1000, Math.round((minMs + maxMs) / 2));
    const jitterMs = Math.max(0, Math.round((maxMs - minMs) / 2));
    const phaseMs = Math.max(0, Math.round(a.phaseOffsetSeconds * 1000)) % periodMs;
    return { periodMs, jitterMs, phaseMs };
  }

  apply(assignment: AgentAssignment): void {
    const s = Schedule.fromAssignment(assignment);
    this.periodMs = s.periodMs;
    this.jitterMs = s.jitterMs;
    this.phaseMs = s.phaseMs;
  }

  /** Milliseconds until the next wall-clock-aligned slot, plus jitter. */
  nextWaitMs(nowMs: number): number {
    const period = this.periodMs;
    const sinceSlot = (((nowMs - this.phaseMs) % period) + period) % period;
    const untilNext = period - sinceSlot; // in (0, period]
    const jitter = this.jitterMs > 0 ? Math.random() * this.jitterMs : 0;
    return untilNext + jitter;
  }
}
