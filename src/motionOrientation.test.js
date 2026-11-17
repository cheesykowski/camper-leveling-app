import assert from 'node:assert/strict';
import test from 'node:test';
import { updateMotionOrientation } from './motionOrientation.js';

const still = { alpha: 0, beta: 0, gamma: 0 };
const level = { x: 0, y: 0, z: 9.81 };

test('uses gravity for the same pitch and roll signs as device orientation', () => {
  const pitch = updateMotionOrientation(null, { x: 0, y: 4.905, z: 8.4957 }, still, 0);
  const roll = updateMotionOrientation(null, { x: -4.905, y: 0, z: 8.4957 }, still, 0);
  assert.ok(Math.abs(pitch.pitch - 30) < 0.01);
  assert.ok(Math.abs(roll.roll - 30) < 0.01);
});

test('tracks gyro rotation and quickly recovers after lateral acceleration stops', () => {
  let state = updateMotionOrientation(null, level, still, 0);
  state = updateMotionOrientation(state, { x: 0, y: 9.81, z: 0 }, { ...still, alpha: 900 }, 100);
  assert.ok(Math.abs(state.pitch - 90) < 0.01);
  state = updateMotionOrientation(null, level, still, 0);
  state = updateMotionOrientation(state, { x: -4.905, y: 0, z: 8.4957 }, { ...still, beta: 300 }, 100);
  assert.ok(Math.abs(state.roll - 30) < 0.01);

  state = updateMotionOrientation(null, level, still, 0);
  for (let ms = 10; ms <= 500; ms += 10) {
    state = updateMotionOrientation(state, { x: 2, y: 0, z: 9.81 }, still, ms);
  }
  assert.ok(Math.abs(state.roll) > 5);
  for (let ms = 510; ms <= 1500; ms += 10) {
    state = updateMotionOrientation(state, level, still, ms);
  }
  assert.ok(Math.abs(state.roll) < 0.3);
});

test('resets after a sample gap and rejects incomplete or invalid readings', () => {
  const state = updateMotionOrientation(null, level, still, 0);
  const reset = updateMotionOrientation(state, { x: 0, y: 9.81, z: 0 }, still, 1000);
  assert.ok(Math.abs(reset.pitch - 90) < 0.01);
  assert.throws(() => updateMotionOrientation(state, level, still, -1), RangeError);
  assert.throws(() => updateMotionOrientation(state, level, null, 10), RangeError);
  assert.throws(() => updateMotionOrientation(state, { x: 0, y: 0, z: 0 }, still, 10), RangeError);
});
