import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateWheelLiftPlan } from './leveling.js';

const dimensions = {
  wheelbaseCm: 300,
  trackWidthCm: 200,
  wedgeHeightsCm: [10, 20, 30],
};

test('pure pitch requires the full axle-to-axle height difference at both low wheels', () => {
  const plan = calculateWheelLiftPlan({
    ...dimensions,
    pitchDegrees: 5,
    rollDegrees: 0,
  });
  const fullDifference = dimensions.wheelbaseCm * Math.tan((5 * Math.PI) / 180);

  assert.equal(plan.wheelLifts[0].requiredLiftCm, 0);
  assert.equal(plan.wheelLifts[1].requiredLiftCm, 0);
  assert.ok(Math.abs(plan.wheelLifts[2].requiredLiftCm - fullDifference) < 1e-10);
  assert.equal(plan.wheelLifts[2].selectedHeightCm, 30);
  assert.equal(plan.wheelLifts[3].requiredLiftCm, plan.wheelLifts[2].requiredLiftCm);
});

test('combined pitch and roll produce different exact lifts at all four corners', () => {
  const plan = calculateWheelLiftPlan({
    ...dimensions,
    pitchDegrees: 5,
    rollDegrees: 3,
  });
  const pitchDifference = dimensions.wheelbaseCm * Math.tan((5 * Math.PI) / 180);
  const rollDifference = dimensions.trackWidthCm * Math.tan((3 * Math.PI) / 180);

  assert.equal(plan.wheelLifts[0].requiredLiftCm, 0);
  assert.ok(Math.abs(plan.wheelLifts[1].requiredLiftCm - rollDifference) < 1e-10);
  assert.ok(Math.abs(plan.wheelLifts[2].requiredLiftCm - pitchDifference) < 1e-10);
  assert.ok(
    Math.abs(plan.wheelLifts[3].requiredLiftCm - pitchDifference - rollDifference) < 1e-10,
  );
});

test('configured per-wheel heights can exactly level a combined tilt', () => {
  const pitchDifference = dimensions.wheelbaseCm * Math.tan((5 * Math.PI) / 180);
  const rollDifference = dimensions.trackWidthCm * Math.tan((3 * Math.PI) / 180);
  const plan = calculateWheelLiftPlan({
    ...dimensions,
    wedgeHeightsCm: [rollDifference, pitchDifference, pitchDifference + rollDifference],
    pitchDegrees: 5,
    rollDegrees: 3,
  });

  assert.equal(plan.wheelLifts[0].selectedHeightCm, 0);
  assert.equal(plan.wheelLifts[1].step, 1);
  assert.equal(plan.wheelLifts[2].step, 2);
  assert.equal(plan.wheelLifts[3].step, 3);
  assert.ok(Math.abs(plan.residualPitchDegrees) < 1e-10);
  assert.ok(Math.abs(plan.residualRollDegrees) < 1e-10);
});

test('uses no wedge when zero is closer than the first available step', () => {
  const plan = calculateWheelLiftPlan({
    ...dimensions,
    wedgeHeightsCm: [3, 6, 9],
    pitchDegrees: 0.1,
    rollDegrees: 0,
  });

  assert.equal(plan.wheelLifts[2].selectedHeightCm, 0);
  assert.equal(plan.wheelLifts[3].selectedHeightCm, 0);
});

test('negative pitch and roll select the opposite diagonal corners', () => {
  const plan = calculateWheelLiftPlan({
    ...dimensions,
    pitchDegrees: -5,
    rollDegrees: -3,
  });

  assert.ok(
    Math.abs(
      plan.wheelLifts[0].requiredLiftCm -
        plan.wheelLifts[1].requiredLiftCm -
        plan.wheelLifts[2].requiredLiftCm,
    ) < 1e-10,
  );
  assert.equal(plan.wheelLifts[3].requiredLiftCm, 0);
});
