import SunCalc from 'suncalc';

const degrees = 180 / Math.PI;

export function calculateSunEvents(date, latitude, longitude) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  const events = { sunrise: null, solarNoon: null, sunset: null };

  for (let offset = -2; offset <= 2; offset += 1) {
    const sample = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset, 12);
    const times = SunCalc.getTimes(sample, latitude, longitude);
    for (const name of Object.keys(events)) {
      const time = times[name];
      if (Number.isFinite(time.getTime()) && time >= start && time < end) {
        const position = SunCalc.getPosition(time, latitude, longitude);
        events[name] = {
          time,
          azimuth: (position.azimuth * degrees + 180 + 360) % 360,
          altitude: position.altitude * degrees,
        };
      }
    }
  }
  return events;
}

export function compassHeading(event, screenAngle = 0) {
  if (screenAngle !== 0) return null;
  if (Number.isFinite(event.webkitCompassHeading)) {
    if (Number.isFinite(event.webkitCompassAccuracy) && event.webkitCompassAccuracy < 0) return null;
    return (event.webkitCompassHeading + 360) % 360;
  }
  if (event.absolute && Number.isFinite(event.alpha)) return (360 - event.alpha) % 360;
  return null;
}

export function sunMarkerPosition(azimuth, heading) {
  const angle = (azimuth - heading) * Math.PI / 180;
  return { x: 180 + 160 * Math.sin(angle), y: 210 - 160 * Math.cos(angle) };
}
