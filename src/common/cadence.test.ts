import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CadenceError, needsRefreshTime, resolveCadence } from './cadence.js';

test('a plain number resolves to itself regardless of refreshTime', () => {
  assert.equal(resolveCadence(300, null), 300);
  assert.equal(resolveCadence(300, 250), 300);
});

test('%refreshTime% / %auto% resolve to the live value', () => {
  assert.equal(resolveCadence('%refreshTime%', 250), 250);
  assert.equal(resolveCadence('%auto%', 250), 250);
});

test('arithmetic on the placeholder is evaluated with precedence', () => {
  assert.equal(resolveCadence('%refreshTime% * 1.2', 300), 360);
  assert.equal(resolveCadence('%refreshTime% + 30', 300), 330);
  assert.equal(resolveCadence('(%refreshTime% + 100) / 2', 300), 200);
  assert.equal(resolveCadence('%refreshTime% * 2 + 10', 100), 210); // * before +
});

test('an expression needing refreshTime resolves to null when none is known', () => {
  assert.equal(resolveCadence('%refreshTime% * 1.1', null), null);
  assert.equal(needsRefreshTime('%auto%'), true);
  assert.equal(needsRefreshTime('300'), false);
  assert.equal(needsRefreshTime(300), false);
});

test('malformed or unsafe expressions throw rather than evaluate code', () => {
  assert.throws(() => resolveCadence('300; rm -rf', 300), CadenceError);
  assert.throws(() => resolveCadence('%refreshTime% / 0', 300), CadenceError);
  assert.throws(() => resolveCadence('', 300), CadenceError);
  assert.throws(() => resolveCadence('1 + ', 300), CadenceError);
});
