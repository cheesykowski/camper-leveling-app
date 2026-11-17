import assert from 'node:assert/strict';
import test from 'node:test';
import { getSetupProgress, nextSetupStep } from './setupProgress.js';

test('points to the first incomplete setup step, including out-of-order completion', () => {
  const progress = getSetupProgress({ vehicleConfirmed: false, wedgesConfirmed: true, calibrated: false, sensorAvailable: true });
  assert.equal(progress.completed, 1);
  assert.equal(progress.next, 'vehicle');
  assert.deepEqual(progress.steps.map((step) => step.complete), [false, true, false]);
});

test('advances to calibration and finishes when all steps are complete', () => {
  assert.equal(getSetupProgress({ vehicleConfirmed: true, wedgesConfirmed: true, calibrated: false, sensorAvailable: true }).next, 'calibration');
  const finished = getSetupProgress({ vehicleConfirmed: true, wedgesConfirmed: true, calibrated: true, sensorAvailable: true });
  assert.equal(finished.completed, 3);
  assert.equal(finished.next, null);
});

test('does not count a saved calibration as ready while its sensor is unavailable', () => {
  const progress = getSetupProgress({ vehicleConfirmed: true, wedgesConfirmed: true, calibrated: true, sensorAvailable: false });
  assert.equal(progress.completed, 2);
  assert.equal(progress.next, 'calibration');
});

test('advances past completed steps without revisiting skipped steps', () => {
  const { steps } = getSetupProgress({ vehicleConfirmed: false, wedgesConfirmed: true, calibrated: false, sensorAvailable: true });
  assert.equal(nextSetupStep(steps, 'vehicle'), 'calibration');
  assert.equal(nextSetupStep(steps, 'calibration'), null);
  assert.throws(() => nextSetupStep(steps, 'unknown'), RangeError);
});
