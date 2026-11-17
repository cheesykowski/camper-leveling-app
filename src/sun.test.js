import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateSunEvents, compassHeading, sunMarkerPosition } from './sun.js';

test('calculates seasonal event times and true-north azimuths for London', () => {
  const summer = calculateSunEvents(new Date('2024-06-21T12:00:00Z'), 51.5074, -0.1278);
  const winter = calculateSunEvents(new Date('2024-12-21T12:00:00Z'), 51.5074, -0.1278);
  assert.ok(Math.abs(summer.sunrise.time - new Date('2024-06-21T03:43:00Z')) < 5 * 60000);
  assert.ok(Math.abs(summer.solarNoon.time - new Date('2024-06-21T12:02:00Z')) < 5 * 60000);
  assert.ok(Math.abs(summer.sunset.time - new Date('2024-06-21T20:21:00Z')) < 5 * 60000);
  assert.ok(summer.sunrise.azimuth < 90 && summer.sunset.azimuth > 270);
  assert.ok(winter.sunrise.azimuth > 90 && winter.sunset.azimuth < 270);
});

test('reports absent polar sunrise and sunset without losing solar noon', () => {
  for (const date of ['2024-06-21T12:00:00Z', '2024-12-21T12:00:00Z']) {
    const events = calculateSunEvents(new Date(date), 78.2232, 15.6469);
    assert.equal(events.sunrise, null);
    assert.equal(events.sunset, null);
    assert.ok(events.solarNoon);
  }
});

test('selects each event on the device calendar day across a large time-zone difference', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'Pacific/Kiritimati';
  try {
    const events = calculateSunEvents(new Date(2024, 5, 21, 12), 51.5074, -0.1278);
    assert.ok(Math.abs(events.sunrise.time - new Date('2024-06-21T03:43:00Z')) < 5 * 60000);
    assert.ok(Math.abs(events.sunset.time - new Date('2024-06-20T20:21:00Z')) < 5 * 60000);
    for (const event of Object.values(events)) {
      assert.equal(event.time.getDate(), 21);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('uses only absolute compass readings and rotates markers relative to the phone', () => {
  assert.equal(compassHeading({ alpha: 30, absolute: false }), null);
  assert.equal(compassHeading({ alpha: 30, absolute: true }), 330);
  assert.equal(compassHeading({ webkitCompassHeading: 42, webkitCompassAccuracy: -1 }), null);
  assert.equal(compassHeading({ webkitCompassHeading: 42 }, 90), null);
  assert.equal(compassHeading({ webkitCompassHeading: 42 }), 42);
  const point = sunMarkerPosition(90, 90);
  assert.ok(Math.abs(point.x - 180) < 0.001);
  assert.ok(Math.abs(point.y - 50) < 0.001);
});
