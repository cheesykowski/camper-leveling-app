export function initialSensorSource(search, standalone) {
  return !standalone && new URLSearchParams(search).get('simulation') === '1'
    ? 'simulation'
    : 'phone';
}

export function sensorDebugEnabled(search, standalone) {
  return standalone || new URLSearchParams(search).get('sensorDebug') === '1';
}
