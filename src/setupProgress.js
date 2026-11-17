export function getSetupProgress({ vehicleConfirmed, wedgesConfirmed, calibrated, sensorAvailable }) {
  const steps = [
    { id: 'vehicle', complete: vehicleConfirmed },
    { id: 'wedges', complete: wedgesConfirmed },
    { id: 'calibration', complete: calibrated && sensorAvailable },
  ];
  return {
    steps,
    completed: steps.filter((step) => step.complete).length,
    next: steps.find((step) => !step.complete)?.id ?? null,
  };
}

export function nextSetupStep(steps, currentId) {
  const index = steps.findIndex((step) => step.id === currentId);
  if (index === -1) throw new RangeError(`Unknown setup step: ${currentId}`);
  return steps.slice(index + 1).find((step) => !step.complete)?.id ?? null;
}
