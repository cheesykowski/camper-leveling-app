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

test('reports the high axle and side opposite the low direction', () => {
  const positiveTilt = calculateTwoWedgePlan({
    ...dimensions,
    pitchDegrees: 5,
    rollDegrees: 3,
  });
  const negativeTilt = calculateTwoWedgePlan({
    ...dimensions,
    pitchDegrees: -5,
    rollDegrees: -3,
  });

  assert.equal(positiveTilt.highAxle, 'front');
  assert.equal(positiveTilt.highSide, 'left');
  assert.equal(positiveTilt.lowAxle, 'rear');
  assert.equal(positiveTilt.lowSide, 'right');
  assert.equal(negativeTilt.highAxle, 'rear');
  assert.equal(negativeTilt.highSide, 'right');
  assert.equal(negativeTilt.lowAxle, 'front');
  assert.equal(negativeTilt.lowSide, 'left');
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

test('accepts fractional wedge heights while returning integer step numbers', () => {
  const plan = calculateTwoWedgePlan({
    ...dimensions,
    wedgeHeightsCm: [2.5, 5.5, 8.5],
    pitchDegrees: 1.5,
    rollDegrees: 0,
  });

  assert.ok(plan.wedgePlacements.every(({ step }) => Number.isInteger(step) && step === 2));
  assert.ok(
    plan.wedgePlacements.every(({ selectedHeightCm }) => selectedHeightCm === 5.5),
  );
});

test('flags when the required lift exceeds the tallest configured wedge', () => {
  const steep = calculateTwoWedgePlan({
    ...dimensions,
    pitchDegrees: 10,
    rollDegrees: 0,
  });
  const withinCapacity = calculateTwoWedgePlan({
    ...dimensions,
    pitchDegrees: 1,
    rollDegrees: 0,
  });

  assert.equal(steep.wedgeCapacityExceeded, true);
  assert.equal(withinCapacity.wedgeCapacityExceeded, false);
});

test('marks only placements exceeding wedge capacity, with equality still in range', () => {
  const options = {
    ...dimensions,
    pitchDegrees: 1,
    rollDegrees: 1,
  };
  const baseline = calculateTwoWedgePlan(options);
  const dominantHeight = baseline.wedgePlacements[1].requiredHeightCm;
  const plan = calculateTwoWedgePlan({
    ...options,
    wedgeHeightsCm: [dominantHeight],
  });

  assert.equal(plan.wedgeCapacityExceeded, true);
  assert.deepEqual(
    plan.wedgePlacements.map(({ wedgeCapacityExceeded }) => wedgeCapacityExceeded),
    [true, false],
  );
  assert.equal(plan.wedgePlacements[1].step, 1);
});

test('marks level only below the configured lift tolerance', () => {
  const pitchDegrees = (Math.atan(3 / dimensions.wheelbaseCm) * 180) / Math.PI;
  const plan = (height) => calculateTwoWedgePlan({
    ...dimensions,
    pitchDegrees,
    rollDegrees: 0,
    levelToleranceCm: height,
  });

  assert.equal(plan(3.01).isLevel, true);
  assert.equal(plan(3).isLevel, false);
  assert.equal(plan(2.99).isLevel, false);
});

test('height mode compares capacity with its own maximum without clipping the required lift', () => {
  const plan = calculateTwoWedgePlan({
    ...dimensions,
    pitchDegrees: 5,
    rollDegrees: 1,
    maximumHeightCm: 10,
    levelToleranceCm: 3,
  });

  assert.equal(plan.isLevel, false);
  assert.equal(plan.wedgeCapacityExceeded, true);
  assert.ok(plan.wedgePlacements.every(({ requiredHeightCm }) => requiredHeightCm > 10));
});

test('exceeding the maximum is not hidden by a larger level tolerance', () => {
  const pitchDegrees = (Math.atan(2 / dimensions.wheelbaseCm) * 180) / Math.PI;
  const plan = calculateTwoWedgePlan({
    ...dimensions,
    pitchDegrees,
    rollDegrees: 0,
    maximumHeightCm: 1,
    levelToleranceCm: 3,
  });
  assert.equal(plan.wedgeCapacityExceeded, true);
  assert.equal(plan.isLevel, false);
});

test('combined lift can require a wedge even when each axis is below the first step', () => {
  const plan = calculateTwoWedgePlan({
    ...dimensions,
    pitchDegrees: (Math.atan(2 / dimensions.wheelbaseCm) * 180) / Math.PI,
    rollDegrees: (Math.atan(1.5 / dimensions.trackWidthCm) * 180) / Math.PI,
    levelToleranceCm: 3,
  });
  assert.equal(plan.isLevel, false);
  assert.deepEqual(plan.wedgePlacements.map(({ step }) => step), [1, 0]);
});

test('height mode treats a lift equal to the maximum as within capacity', () => {
  const options = { ...dimensions, pitchDegrees: 1, rollDegrees: 0 };
  const requiredHeight = calculateTwoWedgePlan(options).wedgePlacements[0].requiredHeightCm;
  const plan = calculateTwoWedgePlan({ ...options, maximumHeightCm: requiredHeight });
  assert.equal(plan.wedgeCapacityExceeded, false);
});
