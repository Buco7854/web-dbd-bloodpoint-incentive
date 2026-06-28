import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  VersionFormatError,
  buildUserAgent,
  deriveCategory,
  deriveVersionArtifacts,
  parseBuildId,
} from './category.js';

const SAMPLE = 'DBD_Sushi_REL_Steam_Shipping_9_3420587';

test('deriveCategory derives product-release-build-live', () => {
  assert.equal(deriveCategory(SAMPLE), 'sushi-rel-3420587-live');
  assert.equal(deriveCategory('DBD_Sushi_REL_EGS_Shipping_9_3500000'), 'sushi-rel-3500000-live');
});

test('deriveCategory rejects malformed input', () => {
  assert.throws(() => deriveCategory('garbage'), VersionFormatError);
  assert.throws(() => deriveCategory('DBD_Sushi'), VersionFormatError);
});

test('buildUserAgent format', () => {
  assert.equal(
    buildUserAgent(SAMPLE, '10.0.26100.1.768.64bit'),
    'DeadByDaylight/DBD_Sushi_REL_Steam_Shipping_9_3420587 (http-eventloop) Windows/10.0.26100.1.768.64bit',
  );
});

test('parseBuildId reads the trailing number', () => {
  assert.equal(parseBuildId(SAMPLE), 3420587);
  assert.equal(parseBuildId('weird'), 0);
});

test('deriveVersionArtifacts bundles everything', () => {
  const a = deriveVersionArtifacts(SAMPLE, '10.0.26100.1.768.64bit');
  assert.equal(a.category, 'sushi-rel-3420587-live');
  assert.equal(a.buildId, 3420587);
  assert.match(a.userAgent, /^DeadByDaylight\/DBD_Sushi/);
});
