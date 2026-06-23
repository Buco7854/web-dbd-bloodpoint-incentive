import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareSemver, parseLiveKeys, selectAnchor } from './loginAnchor.js';

test('compareSemver orders by numeric segments', () => {
  assert.ok(compareSemver('9.3.0', '9.2.9') > 0);
  assert.ok(compareSemver('10.0.0', '9.9.9') > 0);
  assert.equal(compareSemver('10.0.1', '10.0.1'), 0);
});

test('selectAnchor picks the highest common semver and its highest build', () => {
  const anchor = selectAnchor({
    availableVersions: {
      '10.0.0_3420915live': {},
      '10.0.1_3458605live': {},
      '10.0.1_3460394live': {},
      '9.9.9_100live': {},
    },
    liveKeys: { '10.0.0': 'k1000', '10.0.1': 'k1001' },
  });
  assert.equal(anchor.pattern, '10.0.1');
  assert.equal(anchor.contentVersionId, '10.0.1_3460394live'); // highest build for 10.0.1
  assert.equal(anchor.secretKey, 'k1001');
});

test('selectAnchor ignores semvers that have no live key', () => {
  const anchor = selectAnchor({
    availableVersions: { '10.0.1_3460394live': {}, '10.0.0_3420915live': {} },
    liveKeys: { '10.0.0': 'k1000' },
  });
  assert.equal(anchor.pattern, '10.0.0');
  assert.equal(anchor.contentVersionId, '10.0.0_3420915live');
});

test('selectAnchor throws when there is no common semver', () => {
  assert.throws(() =>
    selectAnchor({ availableVersions: { '9.0.0_1live': {} }, liveKeys: { '8.0.0': 'k' } }),
  );
});

test('parseLiveKeys keeps only *_live and strips the suffix (JSON)', () => {
  const keys = parseLiveKeys(
    JSON.stringify({ '10.0.1_live': 'abc', '10.0.1_ptb': 'xyz', '10.0.0_live': 'def' }),
  );
  assert.deepEqual(keys, { '10.0.1': 'abc', '10.0.0': 'def' });
});
