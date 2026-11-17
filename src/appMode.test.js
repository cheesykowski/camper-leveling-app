import assert from 'node:assert/strict';
import test from 'node:test';
import { initialSensorSource, sensorDebugEnabled } from './appMode.js';

test('simulation requires the developer URL and a non-standalone window', () => {
  assert.equal(initialSensorSource('', false), 'phone');
  assert.equal(initialSensorSource('?simulation=1', false), 'simulation');
  assert.equal(initialSensorSource('?simulation=0', false), 'phone');
  assert.equal(initialSensorSource('?simulation=1', true), 'phone');
});

test('sensor comparison is only enabled by the debug URL in the web view', () => {
  assert.equal(sensorDebugEnabled('', false), false);
  assert.equal(sensorDebugEnabled('?sensorDebug=1', false), true);
  assert.equal(sensorDebugEnabled('?sensorDebug=1', true), false);
});
