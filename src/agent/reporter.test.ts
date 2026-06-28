import assert from 'node:assert/strict';
import { test } from 'node:test';
import pino from 'pino';
import type { AgentAssignment } from '../shared/types.js';
import { CadenceRejectedError } from './auth/errors.js';
import type { RegionRead } from './bhvr/client.js';
import type { HubClient } from './hubClient.js';
import { HubReportingSink } from './reporter.js';
import { Schedule } from './schedule.js';

const silent = pino({ level: 'silent' });

const assignment = (over: Partial<AgentAssignment> = {}): AgentAssignment => ({
  region: 'eu-central-1',
  platform: 'Windows',
  pollMinSeconds: 300,
  pollMaxSeconds: 360,
  phaseOffsetSeconds: 0,
  probeImmediately: false,
  ...over,
});

// A stub hub whose report() always returns the assignment we want to test against.
const stubHub = (reply: AgentAssignment): HubClient =>
  ({ report: async () => reply }) as unknown as HubClient;

const read = (refreshTime: number | null): RegionRead => ({
  region: 'eu-central-1',
  survivor: 100,
  killer: 0,
  ratio: 2,
  isReal: true,
  refreshTime,
});

const sink = (hub: HubClient, floor: string | null, ceiling: string | null): HubReportingSink =>
  new HubReportingSink(hub, 'Windows', new Schedule(assignment()), floor, ceiling, silent);

test('refuses (fatally) when the hub min is below a static floor', async () => {
  const s = sink(stubHub(assignment({ pollMinSeconds: 200 })), '300', null);
  await assert.rejects(() => s.recordReal(read(null)), CadenceRejectedError);
});

test('refuses when the hub min is below a %refreshTime% floor, using the observed value', async () => {
  const s = sink(stubHub(assignment({ pollMinSeconds: 300 })), '%refreshTime%', null);
  await assert.rejects(() => s.recordReal(read(320)), CadenceRejectedError);
});

test('refuses when the hub max is above the ceiling', async () => {
  const s = sink(stubHub(assignment({ pollMinSeconds: 300, pollMaxSeconds: 700 })), null, '600');
  await assert.rejects(() => s.recordReal(read(null)), CadenceRejectedError);
});

test('accepts a cadence inside the range', async () => {
  const s = sink(stubHub(assignment({ pollMinSeconds: 400, pollMaxSeconds: 500 })), '%refreshTime%', '600');
  await assert.doesNotReject(() => s.recordReal(read(320))); // 400 >= 320 and 500 <= 600
});

test('a %refreshTime% floor is not enforced until refreshTime is observed', async () => {
  const s = sink(stubHub(assignment({ pollMinSeconds: 100 })), '%refreshTime%', null);
  await assert.doesNotReject(() => s.recordReal(read(null))); // no refreshTime yet -> skip the check
});
