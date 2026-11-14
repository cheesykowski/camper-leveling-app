export function initialSensorSource(search, standalone) {
  return !standalone && new URLSearchParams(search).get('simulation') === '1'
    ? 'simulation'
    : 'phone';
}
