const DEGREES = 180 / Math.PI;
const CORRECTION_TIME_SECONDS = 0.25;
const MAX_SAMPLE_GAP_SECONDS = 0.5;

function normalize(vector) {
  const length = Math.hypot(...vector);
  if (!Number.isFinite(length) || length < 1e-8) {
    throw new RangeError('Invalid motion sensor reading.');
  }
  return vector.map((value) => value / length);
}

export function updateMotionOrientation(previous, acceleration, rotationRate, timestamp) {
  const accelerationValues = [acceleration?.x, acceleration?.y, acceleration?.z];
  // DeviceMotionEvent rotation rates use alpha/beta/gamma for X/Y/Z, unlike orientation angles.
  const angularVelocity = [rotationRate?.alpha, rotationRate?.beta, rotationRate?.gamma];
  if (!accelerationValues.every(Number.isFinite) || !angularVelocity.every(Number.isFinite)
    || !Number.isFinite(timestamp)) {
    throw new RangeError('Invalid motion sensor reading.');
  }
  const magnitude = Math.hypot(...accelerationValues);
  if (magnitude < 2 || magnitude > 30) {
    throw new RangeError('Invalid motion sensor reading.');
  }
  const measured = normalize(accelerationValues);
  let gravity = measured;

  if (previous) {
    const dt = (timestamp - previous.timestamp) / 1000;
    if (dt < 0) throw new RangeError('Invalid motion sensor timestamp.');
    if (dt <= MAX_SAMPLE_GAP_SECONDS) {
      const speed = Math.hypot(...angularVelocity) / DEGREES;
      const angle = speed * dt;
      let predicted = previous.gravity;
      if (speed > 1e-10) {
        const [x, y, z] = angularVelocity.map((value) => value / DEGREES / speed);
        const [gx, gy, gz] = previous.gravity;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dot = x * gx + y * gy + z * gz;
        predicted = [
          gx * cos - (y * gz - z * gy) * sin + x * dot * (1 - cos),
          gy * cos - (z * gx - x * gz) * sin + y * dot * (1 - cos),
          gz * cos - (x * gy - y * gx) * sin + z * dot * (1 - cos),
        ];
      }
      const weight = Math.exp(-dt / CORRECTION_TIME_SECONDS);
      gravity = normalize(predicted.map((value, index) => weight * value + (1 - weight) * measured[index]));
    }
  }

  const [x, y, z] = gravity;
  const sign = z < 0 ? -1 : 1;
  return {
    gravity,
    timestamp,
    pitch: Math.atan2(y, sign * Math.hypot(x, z)) * DEGREES,
    roll: Math.atan2(-sign * x, sign * z) * DEGREES,
  };
}
