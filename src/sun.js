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

export function sunMarkerPosition(azimuth, heading, radius = 145) {
  const angle = (azimuth - heading) * Math.PI / 180;
  return { x: 240 + radius * Math.sin(angle), y: 240 - radius * Math.cos(angle) };
}

export function sunArcPoints(start, end, latitude, longitude, heading) {
  if (!start || !end || start.time >= end.time) return [];
  const duration = end.time - start.time;
  const steps = Math.ceil(duration / (5 * 60000));
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const time = new Date(start.time.getTime() + duration * index / steps);
    const position = SunCalc.getPosition(time, latitude, longitude);
    if (position.altitude < -2 * Math.PI / 180) return [];
    const azimuth = (position.azimuth * degrees + 180 + 360) % 360;
    points.push(sunMarkerPosition(azimuth, heading));
  }
  return points;
}

export function sunLabelPositions(markers) {
  return markers.reduce((labels, marker) => {
    const position = sunMarkerPosition(marker.azimuth, marker.heading, 185);
    const offsets = [0, 25, -25, 50, -50, 75, -75];
    const y = offsets.map((offset) => position.y + offset).find((candidate) =>
      candidate >= 25 && candidate <= 455 && labels.every((other) =>
        Math.abs(position.x - other.x) >= 90 || Math.abs(candidate - other.y) >= 25,
      ),
    );
    labels.push({ ...marker, x: position.x, y: y ?? position.y });
    return labels;
  }, []);
}
