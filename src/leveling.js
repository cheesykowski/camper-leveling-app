export const wheelCorners = [
  {
    id: 'front-left',
    label: 'Front left',
    axle: 'front',
    side: 'left',
  },
  {
    id: 'front-right',
    label: 'Front right',
    axle: 'front',
    side: 'right',
  },
  {
    id: 'rear-left',
    label: 'Rear left',
    axle: 'rear',
    side: 'left',
  },
  {
    id: 'rear-right',
    label: 'Rear right',
    axle: 'rear',
    side: 'right',
  },
];

const getStepForHeight = (requiredHeightCm, stepHeightsCm) => {
  let step = 0;
  stepHeightsCm.forEach((height, index) => {
    if (height <= requiredHeightCm) step = index + 1;
  });
  return step;
};

export function calculateTwoWedgePlan({
  pitchDegrees,
  rollDegrees,
  wheelbaseCm,
  trackWidthCm,
  wedgeHeightsCm,
  maximumHeightCm,
  levelToleranceCm = 0,
}) {
  const pitchHalfRiseCm = (wheelbaseCm / 2) * Math.tan((pitchDegrees * Math.PI) / 180);
  const rollHalfRiseCm = (trackWidthCm / 2) * Math.tan((rollDegrees * Math.PI) / 180);
  const pitchRiseCm = Math.abs(pitchHalfRiseCm) * 2;
  const rollRiseCm = Math.abs(rollHalfRiseCm) * 2;
  const dominantAxis =
    Math.abs(pitchHalfRiseCm) >= Math.abs(rollHalfRiseCm) ? 'pitch' : 'roll';
  const lowAxle = pitchHalfRiseCm >= 0 ? 'rear' : 'front';
  const lowSide = rollHalfRiseCm >= 0 ? 'right' : 'left';
  const highAxle = lowAxle === 'front' ? 'rear' : 'front';
  const highSide = lowSide === 'left' ? 'right' : 'left';
  const lowCornerId = `${lowAxle}-${lowSide}`;
  const secondWheel =
    dominantAxis === 'pitch'
      ? `${lowAxle}-${lowSide === 'left' ? 'right' : 'left'}`
      : `${lowAxle === 'front' ? 'rear' : 'front'}-${lowSide}`;
  const dominantRiseCm = dominantAxis === 'pitch' ? pitchRiseCm : rollRiseCm;
  const combinedRiseCm = pitchRiseCm + rollRiseCm;
  const sortedWedgeHeightsCm = [...wedgeHeightsCm].sort((a, b) => a - b);
  const wheelById = new Map(wheelCorners.map((wheel) => [wheel.id, wheel]));
  const placements = [
    { id: lowCornerId, requiredHeightCm: combinedRiseCm },
    { id: secondWheel, requiredHeightCm: dominantRiseCm },
  ];
  const maximumWedgeHeightCm = maximumHeightCm ?? sortedWedgeHeightsCm[sortedWedgeHeightsCm.length - 1] ?? 0;
  const wedgeCapacityExceeded = placements.some(
    ({ requiredHeightCm }) => requiredHeightCm > maximumWedgeHeightCm,
  );

  return {
    dominantAxis,
    highAxle,
    highSide,
    wedgeCapacityExceeded,
    isLevel: combinedRiseCm < levelToleranceCm && !wedgeCapacityExceeded,
    wedgePlacements: placements.map(({ id, requiredHeightCm }) => {
      const wheel = wheelById.get(id);
      const step = getStepForHeight(requiredHeightCm, sortedWedgeHeightsCm);

      return {
        id,
        label: wheel.label,
        requiredHeightCm,
        wedgeCapacityExceeded: requiredHeightCm > maximumWedgeHeightCm,
        step,
        selectedHeightCm: step > 0 ? sortedWedgeHeightsCm[step - 1] : 0,
      };
    }),
  };
}
