export const wheelCorners = [
  { id: 'front-left', label: 'Front left', axle: 'front', side: 'left', longitudinalSign: 1, lateralSign: 1 },
  { id: 'front-right', label: 'Front right', axle: 'front', side: 'right', longitudinalSign: 1, lateralSign: -1 },
  { id: 'rear-left', label: 'Rear left', axle: 'rear', side: 'left', longitudinalSign: -1, lateralSign: 1 },
  { id: 'rear-right', label: 'Rear right', axle: 'rear', side: 'right', longitudinalSign: -1, lateralSign: -1 },
];

const nearestAvailableHeight = (heights, target) =>
  heights.reduce((nearest, height) => {
    const difference = Math.abs(height - target);
    const nearestDifference = Math.abs(nearest - target);
    return difference < nearestDifference || (difference === nearestDifference && height < nearest)
      ? height
      : nearest;
  }, 0);

export function calculateWheelLiftPlan({
  pitchDegrees,
  rollDegrees,
  wheelbaseCm,
  trackWidthCm,
  wedgeHeightsCm,
}) {
  // Each axis contributes half its full rise at either side of the vehicle center.
  const pitchHalfRiseCm = (wheelbaseCm / 2) * Math.tan((pitchDegrees * Math.PI) / 180);
  const rollHalfRiseCm = (trackWidthCm / 2) * Math.tan((rollDegrees * Math.PI) / 180);
  const availableHeights = [...new Set([0, ...wedgeHeightsCm])]
    .filter((height) => Number.isFinite(height) && height >= 0)
    .sort((a, b) => a - b);
  const relativeHeights = wheelCorners.map(
    (wheel) =>
      wheel.longitudinalSign * pitchHalfRiseCm + wheel.lateralSign * rollHalfRiseCm,
  );
  const highestCorner = Math.max(...relativeHeights);
  const wheelLifts = wheelCorners.map((wheel, index) => {
    const requiredLiftCm = Math.max(0, highestCorner - relativeHeights[index]);
    const selectedHeightCm = nearestAvailableHeight(availableHeights, requiredLiftCm);

    return {
      id: wheel.id,
      label: wheel.label,
      requiredLiftCm,
      selectedHeightCm,
      step: selectedHeightCm > 0 ? wedgeHeightsCm.indexOf(selectedHeightCm) + 1 : 0,
    };
  });
  const finalHeights = wheelLifts.map(
    (wheelLift, index) => relativeHeights[index] + wheelLift.selectedHeightCm,
  );
  const meanHeight = (indices) =>
    indices.reduce((sum, index) => sum + finalHeights[index], 0) / indices.length;
  const residualPitchDegrees =
    (Math.atan2(meanHeight([0, 1]) - meanHeight([2, 3]), wheelbaseCm) * 180) / Math.PI;
  const residualRollDegrees =
    (Math.atan2(meanHeight([0, 2]) - meanHeight([1, 3]), trackWidthCm) * 180) / Math.PI;

  return { wheelLifts, residualPitchDegrees, residualRollDegrees };
}
