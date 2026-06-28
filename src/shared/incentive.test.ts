import assert from 'node:assert/strict';
import { test } from 'node:test';
import { headlinePercent, headlineRole, isRealResponse, multiplier } from './incentive.js';
import { formatMultiplier, formatPercent, relativeTime } from './format.js';

test('isRealResponse: only non-zero ratio is real', () => {
  assert.equal(isRealResponse(3.012), true);
  assert.equal(isRealResponse(0), false); // the fallback signature
  assert.equal(isRealResponse(Number.NaN), false);
});

test('multiplier math', () => {
  assert.equal(multiplier(0), 1);
  assert.equal(multiplier(75), 1.75);
  assert.equal(multiplier(100), 2);
});

test('headline picks the higher role', () => {
  assert.equal(headlineRole(75, 0), 'survivor');
  assert.equal(headlineRole(0, 50), 'killer');
  assert.equal(headlineRole(0, 0), null);
  assert.equal(headlinePercent(75, 0), 75);
  assert.equal(headlinePercent(0, 50), 50);
});

test('formatPercent always signed', () => {
  assert.equal(formatPercent(75), '+75%');
  assert.equal(formatPercent(0), '+0%');
});

test('formatMultiplier: two decimals, whole numbers collapse except x1.00', () => {
  assert.equal(formatMultiplier(0), '×1.00');
  assert.equal(formatMultiplier(75), '×1.75');
  assert.equal(formatMultiplier(50), '×1.50');
  assert.equal(formatMultiplier(100), '×2');
  assert.equal(formatMultiplier(200), '×3');
});

test('relativeTime buckets', () => {
  const now = Date.parse('2026-01-01T00:10:00.000Z');
  assert.equal(relativeTime(null, now), 'never');
  assert.equal(relativeTime('2026-01-01T00:09:58.000Z', now), 'just now');
  assert.equal(relativeTime('2026-01-01T00:09:30.000Z', now), '30s ago');
  assert.equal(relativeTime('2026-01-01T00:05:00.000Z', now), '5m ago');
  assert.equal(relativeTime('2025-12-31T22:10:00.000Z', now), '2h ago');
});
