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
