import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createLogger } from '../../common/logger.js';
import { VersionResolver } from './resolver.js';
import { StateStore } from './store.js';

const log = createLogger('silent');
const v = (build: number) => `DBD_Sushi_REL_Steam_Shipping_9_${build}`;

class FakeDiscovery {
  next: string;
  constructor(initial: string) {
    this.next = initial;
  }
  async resolveLatestVersion(): Promise<string> {
    return this.next;
  }
}

function newStore(): StateStore {
  return new StateStore(mkdtempSync(path.join(os.tmpdir(), 'dbd-state-')), log);
}

test('pinned version ignores discovery', async () => {
  const resolver = new VersionResolver({
    gameVersion: v(100),
    clientOs: 'os',
    discovery: new FakeDiscovery(v(999)),
    store: newStore(),
    log,
  });
  await resolver.init();
  assert.equal(resolver.getActive()?.version, v(100));
  await resolver.refreshFromDiscovery();
  assert.equal(resolver.getActive()?.version, v(100));
});

test('cosmetic-patch guard reverts to last-working and waits for a newer build', async () => {
  const discovery = new FakeDiscovery(v(100));
  const resolver = new VersionResolver({
    gameVersion: 'auto',
    clientOs: 'os',
    discovery,
    store: newStore(),
    log,
  });

  await resolver.init();
  assert.equal(resolver.getActive()?.version, v(100));

  // v100 returns real data -> becomes last-working.
  resolver.reportPassResult(true);

  // A newer build appears; we try it.
  discovery.next = v(200);
  await resolver.refreshFromDiscovery();
  assert.equal(resolver.getActive()?.version, v(200));

  // v200 yields only fallbacks -> revert to the working v100.
  resolver.reportPassResult(false);
  assert.equal(resolver.getActive()?.version, v(100));

  // The same rejected build must not be re-adopted.
  discovery.next = v(200);
  await resolver.refreshFromDiscovery();
  assert.equal(resolver.getActive()?.version, v(100));

  // A still-newer build is worth trying again.
  discovery.next = v(300);
  await resolver.refreshFromDiscovery();
  assert.equal(resolver.getActive()?.version, v(300));
});
