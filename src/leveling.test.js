import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTwoWedgePlan } from './leveling.js';

const dimensions = {
  wheelbaseCm: 300,
  trackWidthCm: 200,
  wedgeHeightsCm: [3, 6, 9],
};

test('pure pitch places two equal steps on the low axle', () => {
  const plan = calculateTwoWedgePlan({
    ...dimensions,
    pitchDegrees: 5,
    rollDegrees: 0,
  });
  const fullDifference = dimensions.wheelbaseCm * Math.tan((5 * Math.PI) / 180);

  assert.equal(plan.dominantAxis, 'pitch');
  assert.deepEqual(
    plan.wedgePlacements.map(({ id }) => id),
    ['rear-right', 'rear-left'],
  );
  assert.ok(
    plan.wedgePlacements.every(
      ({ requiredHeightCm }) => Math.abs(requiredHeightCm - fullDifference) < 1e-10,
    ),
  );
  assert.ok(plan.wedgePlacements.every(({ step }) => step === 3));
});

test('combined tilt uses the combined height at the low corner and the dominant-axis height beside it', () => {
  const pitchDifference = dimensions.wheelbaseCm * Math.tan((5 * Math.PI) / 180);
  const rollDifference = dimensions.trackWidthCm * Math.tan((3 * Math.PI) / 180);
  const plan = calculateTwoWedgePlan({
    ...dimensions,
    wedgeHeightsCm: [10, 25, 35],
    pitchDegrees: 5,
    rollDegrees: 3,
  });

  assert.equal(plan.dominantAxis, 'pitch');
  assert.deepEqual(
    plan.wedgePlacements.map(({ id }) => id),
    ['rear-right', 'rear-left'],
  );
  assert.ok(
    Math.abs(plan.wedgePlacements[0].requiredHeightCm - pitchDifference - rollDifference) < 1e-10,
  );
  assert.ok(Math.abs(plan.wedgePlacements[1].requiredHeightCm - pitchDifference) < 1e-10);
  assert.deepEqual(
    plan.wedgePlacements.map(({ step }) => step),
    [3, 2],
  );
});

test('dominance compares geometry-scaled lift, not angle magnitude alone', () => {
  const plan = calculateTwoWedgePlan({
    ...dimensions,
    wheelbaseCm: 100,
    trackWidthCm: 400,
    pitchDegrees: 5,
    rollDegrees: 3,
  });

  assert.equal(plan.dominantAxis, 'roll');
  assert.deepEqual(
    plan.wedgePlacements.map(({ id }) => id),
    ['rear-right', 'front-right'],
  );
});

test('negative pitch and roll select the opposite low corner', () => {
  const plan = calculateTwoWedgePlan({
    ...dimensions,
    pitchDegrees: -5,
    rollDegrees: -3,
  });

  assert.deepEqual(
    plan.wedgePlacements.map(({ id }) => id),
    ['front-left', 'front-right'],
  );
});

test('does not recommend a fractional or higher step when lift is below the first tier', () => {
  const plan = calculateTwoWedgePlan({
    ...dimensions,
    pitchDegrees: 0.1,
    rollDegrees: 0,
  });

  assert.ok(
    plan.wedgePlacements.every(
      ({ step, selectedHeightCm }) => step === 0 && selectedHeightCm === 0,
    ),
  );
});
