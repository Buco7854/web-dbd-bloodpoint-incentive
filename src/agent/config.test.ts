import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadAgentConfig } from './config.js';

const env = (over: Record<string, string>): NodeJS.ProcessEnv =>
  ({ HUB_URL: 'http://hub:3000', AGENT_KEY: 'k', STEAM_USERNAME: 'u', STEAM_PASSWORD: 'p', ...over }) as NodeJS.ProcessEnv;

test('platform is derived from the auth provider (steam -> Windows)', () => {
  const c = loadAgentConfig(env({}));
  assert.equal(c.authProvider, 'steam');
  assert.equal(c.platform, 'Windows');
});

test('unsupported providers are rejected for now', () => {
  assert.throws(() => loadAgentConfig(env({ AUTH_PROVIDER: 'epic' })), /not supported yet/);
  assert.throws(() => loadAgentConfig(env({ AUTH_PROVIDER: 'nope' })), /not a known provider/);
});

test('HUB_URL and AGENT_KEY are required', () => {
  assert.throws(() => loadAgentConfig(env({ HUB_URL: '' })), /HUB_URL is required/);
  assert.throws(() => loadAgentConfig(env({ AGENT_KEY: '' })), /AGENT_KEY is required/);
});

test('steam credentials are required (depot discovery)', () => {
  assert.throws(
    () => loadAgentConfig({ HUB_URL: 'http://h', AGENT_KEY: 'k' } as NodeJS.ProcessEnv),
    /Steam credentials are required/,
  );
});

test('trailing slashes are trimmed from HUB_URL', () => {
  const c = loadAgentConfig(env({ HUB_URL: 'http://hub:3000/' }));
  assert.equal(c.hubUrl, 'http://hub:3000');
});

test('the accepted cadence range defaults to the hub-matching refreshTime bounds', () => {
  const def = loadAgentConfig(env({}));
  assert.equal(def.pollFloor, '%refreshTime%');
  assert.equal(def.pollCeiling, '%refreshTime% * 1.33');
});

test('explicit min/max override the defaults (number or expression)', () => {
  const c = loadAgentConfig(env({ AGENT_MIN_POLL_SECONDS: '%refreshTime%', AGENT_MAX_POLL_SECONDS: '600' }));
  assert.equal(c.pollFloor, '%refreshTime%');
  assert.equal(c.pollCeiling, '600');
});

test('a bound can be disabled with off/none', () => {
  const c = loadAgentConfig(env({ AGENT_MIN_POLL_SECONDS: 'off', AGENT_MAX_POLL_SECONDS: 'none' }));
  assert.equal(c.pollFloor, null);
  assert.equal(c.pollCeiling, null);
});

test('malformed AGENT_MIN/MAX_POLL_SECONDS expressions are rejected', () => {
  assert.throws(() => loadAgentConfig(env({ AGENT_MIN_POLL_SECONDS: '%refreshTime% *' })), /AGENT_MIN_POLL_SECONDS/);
  assert.throws(() => loadAgentConfig(env({ AGENT_MAX_POLL_SECONDS: '1 +' })), /AGENT_MAX_POLL_SECONDS/);
});
