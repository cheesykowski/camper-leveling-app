import assert from 'node:assert/strict';
import test from 'node:test';
import { quaternionToTilt } from './orientation.js';

function quaternion(alpha, beta, gamma) {
  const [z, x, y] = [alpha, beta, gamma].map((angle) => angle * Math.PI / 360);
  const cz = Math.cos(z), sz = Math.sin(z);
  const cx = Math.cos(x), sx = Math.sin(x);
  const cy = Math.cos(y), sy = Math.sin(y);
  return [
    cz * sx * cy - sz * cx * sy,
    cz * cx * sy + sz * sx * cy,
    sz * cx * cy + cz * sx * sy,
    cz * cx * cy - sz * sx * sy,
  ];
}

test('converts device-coordinate quaternions to beta and gamma angles', () => {
  for (const [alpha, beta, gamma] of [
    [0, 0, 0], [0, 10, 0], [0, 0, -15], [72, -12, 8], [220, 130, -25],
  ]) {
    const tilt = quaternionToTilt(quaternion(alpha, beta, gamma));
    assert.ok(Math.abs(tilt.pitch - beta) < 1e-9);
    assert.ok(Math.abs(tilt.roll - gamma) < 1e-9);
  }
});

test('rejects missing and invalid sensor readings', () => {
  for (const value of [null, [0, 0, 0, 0], [0, 0, NaN, 1], [1e308, 1e308, 1e308, 1e308], [1, 2]]) {
    assert.throws(() => quaternionToTilt(value), RangeError);
  }
});
