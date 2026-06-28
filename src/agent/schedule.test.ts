import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgentAssignment } from '../shared/types.js';
import { Schedule } from './schedule.js';

const assignment = (over: Partial<AgentAssignment> = {}): AgentAssignment => ({
  region: 'eu-central-1',
  platform: 'Windows',
  pollMinSeconds: 300,
  pollMaxSeconds: 300, // no jitter, for deterministic assertions
  phaseOffsetSeconds: 0,
  probeImmediately: false,
  ...over,
});

test('aligns the wait to the wall-clock slot for its phase (no jitter)', () => {
  const s = new Schedule(assignment({ phaseOffsetSeconds: 0 }));
  // Exactly on a slot boundary -> waits a full period rather than firing twice.
  assert.equal(s.nextWaitMs(0), 300_000);
  // 100s into the period -> 200s left.
  assert.equal(s.nextWaitMs(100_000), 200_000);
});

test('a phase offset shifts the slot, spacing redundant agents', () => {
  const s = new Schedule(assignment({ phaseOffsetSeconds: 150 }));
  // At epoch, the phase-150 agent fires 150s in.
  assert.equal(s.nextWaitMs(0), 150_000);
});

test('apply() updates the cadence and phase live', () => {
  const s = new Schedule(assignment({ phaseOffsetSeconds: 0 }));
  s.apply(assignment({ pollMinSeconds: 600, pollMaxSeconds: 600, phaseOffsetSeconds: 0 }));
  assert.equal(s.nextWaitMs(0), 600_000);
});

test('the beat is the midpoint of [min, max] and jitter is half the width', () => {
  // min 300, max 360 -> period 330, jitter 30. At 100s in: 230s to the slot, + [0,30s).
  const s = new Schedule(assignment({ pollMinSeconds: 300, pollMaxSeconds: 360, phaseOffsetSeconds: 0 }));
  for (let i = 0; i < 50; i += 1) {
    const w = s.nextWaitMs(100_000);
    assert.ok(w >= 230_000 && w < 260_000, `wait ${w} out of range`);
  }
});
