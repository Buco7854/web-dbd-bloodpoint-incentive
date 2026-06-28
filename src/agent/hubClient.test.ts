import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAssignment } from './hubClient.js';

const base = {
  region: 'eu-central-1',
  platform: 'Windows',
  pollMinSeconds: 300,
  pollMaxSeconds: 360,
  phaseOffsetSeconds: 0,
  probeImmediately: false,
};

test('parses a well-formed assignment', () => {
  const a = parseAssignment(base);
  assert.equal(a.region, 'eu-central-1');
  assert.equal(a.pollMinSeconds, 300);
  assert.equal(a.pollMaxSeconds, 360);
  assert.equal(a.probeImmediately, false);
});

test('clamps pollMax below pollMin up to pollMin', () => {
  const a = parseAssignment({ ...base, pollMinSeconds: 300, pollMaxSeconds: 100 });
  assert.equal(a.pollMaxSeconds, 300);
});

test('defaults missing/invalid numeric fields instead of throwing', () => {
  const a = parseAssignment({ region: 'eu-central-1', platform: 'Windows' });
  assert.equal(a.pollMinSeconds, 300);
  assert.equal(a.pollMaxSeconds, 300);
  assert.equal(a.phaseOffsetSeconds, 0);
  assert.equal(a.probeImmediately, false);
});

test('coerces probeImmediately to a strict boolean', () => {
  assert.equal(parseAssignment({ ...base, probeImmediately: 'yes' }).probeImmediately, false);
  assert.equal(parseAssignment({ ...base, probeImmediately: true }).probeImmediately, true);
});

test('rejects an unknown region or platform', () => {
  assert.throws(() => parseAssignment({ ...base, region: 'mars-1' }), /invalid region/);
  assert.throws(() => parseAssignment({ ...base, platform: 'N64' }), /invalid platform/);
});
