import assert from 'node:assert/strict';
import test from 'node:test';
import { initialSensorSource } from './appMode.js';

test('simulation requires the developer URL and a non-standalone window', () => {
  assert.equal(initialSensorSource('', false), 'phone');
  assert.equal(initialSensorSource('?simulation=1', false), 'simulation');
  assert.equal(initialSensorSource('?simulation=0', false), 'phone');
  assert.equal(initialSensorSource('?simulation=1', true), 'phone');
});
