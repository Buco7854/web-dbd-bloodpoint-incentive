import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLogger } from '../../common/logger.js';
import { FatalAuthError } from '../auth/errors.js';
import type { BhvrClient, RegionRead } from '../bhvr/client.js';
import type { VersionResolver } from '../version/resolver.js';
import { Poller } from './poller.js';
import type { AgentStatus, PollSink } from './sink.js';

const log = createLogger('silent');
const version = { version: 'v', category: 'c', userAgent: 'ua', buildId: 1 };

class FakeSink implements PollSink {
  status: AgentStatus = 'initializing';
  readonly recorded: string[] = [];
  recordReal(read: RegionRead): void {
    this.recorded.push(read.region);
  }
  markStale(): void {}
  setStatus(status: AgentStatus): void {
    this.status = status;
  }
  setVersionInfo(): void {}
  markPassStarted(): void {}
  markPassCompleted(): void {}
}

const stubResolver = (): VersionResolver =>
  ({
    getActive: () => version,
    refreshFromDiscovery: async () => {},
    reportPassResult: () => {},
  }) as unknown as VersionResolver;

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

test('poller calls onFatal and stops on a fatal auth error', async () => {
  const sink = new FakeSink();
  const client = {
    fetchRegion: async () => {
      throw new FatalAuthError('InvalidPassword');
    },
  } as unknown as BhvrClient;

  let captured: unknown = null;
  const poller = new Poller(
    sink,
    client,
    stubResolver(),
    {
      region: 'eu-central-1',
      nextBaseWaitMs: () => 600_000,
      probeImmediately: true,
      versionRefreshMs: 3_600_000,
      onFatal: (err) => {
        captured = err;
      },
    },
    log,
  );

  poller.start();
  await wait(60);
  await poller.stop();

  assert.ok(captured instanceof FatalAuthError);
  assert.equal(sink.status, 'error');
});

test('poller queries its region each cycle', async () => {
  const sink = new FakeSink();
  const client = {
    fetchRegion: async (region: string) => ({
      region,
      survivor: 0,
      killer: 50,
      ratio: 1.5,
      isReal: true,
      refreshTime: null,
    }),
  } as unknown as BhvrClient;

  const poller = new Poller(
    sink,
    client,
    stubResolver(),
    { region: 'eu-central-1', nextBaseWaitMs: () => 5, probeImmediately: true, versionRefreshMs: 3_600_000 },
    log,
  );

  poller.start();
  await wait(40);
  await poller.stop();

  assert.ok(sink.recorded.includes('eu-central-1'));
  assert.equal(sink.status, 'ok');
});

test('poller keeps running on a transient error', async () => {
  const sink = new FakeSink();
  let calls = 0;
  const client = {
    fetchRegion: async () => {
      calls += 1;
      throw new Error('network blip');
    },
  } as unknown as BhvrClient;

  let captured: unknown = null;
  const poller = new Poller(
    sink,
    client,
    stubResolver(),
    {
      region: 'eu-central-1',
      nextBaseWaitMs: () => 600_000,
      probeImmediately: true,
      versionRefreshMs: 3_600_000,
      onFatal: (err) => {
        captured = err;
      },
    },
    log,
  );

  poller.start();
  await wait(60);
  await poller.stop();

  assert.equal(captured, null);
  assert.ok(calls >= 1);
});
