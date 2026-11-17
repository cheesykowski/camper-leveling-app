export function quaternionToTilt(quaternion) {
  if (!quaternion || quaternion.length !== 4 || !quaternion.every(Number.isFinite)) {
    throw new RangeError('Invalid orientation quaternion.');
  }
  const magnitude = Math.hypot(...quaternion);
  if (!Number.isFinite(magnitude) || magnitude < 1e-10) {
    throw new RangeError('Invalid orientation quaternion.');
  }
  const [x, y, z, w] = quaternion.map((value) => value / magnitude);
  const r31 = 2 * (x * z - y * w);
  const r32 = 2 * (y * z + x * w);
  const r33 = 1 - 2 * (x * x + y * y);
  const sign = r33 < 0 ? -1 : 1;
  const degrees = 180 / Math.PI;
  return {
    pitch: Math.atan2(r32, sign * Math.hypot(r31, r33)) * degrees,
    roll: Math.atan2(-sign * r31, sign * r33) * degrees,
  };
}
