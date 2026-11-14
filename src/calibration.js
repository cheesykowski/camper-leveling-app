export const defaultCalibration = {
  pitch: 0,
  roll: 0,
};

export const defaultCalibrations = {
  simulation: defaultCalibration,
  phone: defaultCalibration,
  external: defaultCalibration,
};

export const calibrationSlotIds = ['slot-1', 'slot-2', 'slot-3'];

const calibrationTrimFraction = 0.1;

export const defaultCalibrationSlots = {
  simulation: createEmptySlots(),
  phone: createEmptySlots(),
  external: createEmptySlots(),
};

export const defaultCalibrationSlotIds = {
  simulation: calibrationSlotIds[0],
  phone: calibrationSlotIds[0],
  external: calibrationSlotIds[0],
};

const calibrationSources = ['simulation', 'phone', 'external'];

export function getTrimmedMean(values) {
  const sortedValues = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sortedValues.length === 0) {
    throw new RangeError('Cannot calculate a mean without finite samples.');
  }

  // Excluding both tails limits the effect of brief sensor spikes.
  const trimCount = Math.floor(sortedValues.length * calibrationTrimFraction);
  const retainedValues = sortedValues.slice(trimCount, sortedValues.length - trimCount);
  return retainedValues.reduce((sum, value) => sum + value, 0) / retainedValues.length;
}

function createEmptySlots() {
  return calibrationSlotIds.map((id) => ({
    id,
    name: '',
    pitch: null,
    roll: null,
  }));
}

function normalizeSlot(slot, index) {
  const pitch = Number(slot?.pitch);
  const roll = Number(slot?.roll);
  const hasCalibration =
    slot?.pitch !== null &&
    slot?.pitch !== undefined &&
    slot?.roll !== null &&
    slot?.roll !== undefined &&
    Number.isFinite(pitch) &&
    Number.isFinite(roll);

  return {
    id: calibrationSlotIds[index],
    name: typeof slot?.name === 'string' ? slot.name.trim().slice(0, 60) : '',
    pitch: hasCalibration ? pitch : null,
    roll: hasCalibration ? roll : null,
  };
}

function isCalibration(value) {
  return (
    value &&
    value.pitch !== null &&
    value.pitch !== undefined &&
    value.roll !== null &&
    value.roll !== undefined &&
    Number.isFinite(Number(value.pitch)) &&
    Number.isFinite(Number(value.roll))
  );
}

function sameCalibration(first, second) {
  return (
    Number(first.pitch) === Number(second.pitch) &&
    Number(first.roll) === Number(second.roll)
  );
}

function migrateLegacySlots(source, calibrations, profiles, profileIds) {
  const legacyProfiles = Array.isArray(profiles?.[source])
    ? profiles[source]
        .filter((profile) => profile && isCalibration(profile))
        .sort((first, second) => Number(second.createdAt) - Number(first.createdAt))
    : [];
  const selectedProfile = legacyProfiles.find((profile) => profile.id === profileIds?.[source]);
  const candidates = selectedProfile ? [selectedProfile] : [];
  const latest = calibrations?.[source];
  const hasNonzeroLatest =
    isCalibration(latest) && (Number(latest.pitch) !== 0 || Number(latest.roll) !== 0);

  if (
    hasNonzeroLatest &&
    !legacyProfiles.some((profile) => sameCalibration(profile, latest))
  ) {
    candidates.push({ ...latest, name: '' });
  }

  for (const profile of legacyProfiles) {
    if (candidates.length >= calibrationSlotIds.length) break;
    if (profile.id !== selectedProfile?.id) {
      candidates.push(profile);
    }
  }

  return createEmptySlots().map((slot, index) => {
    const profile = candidates[index];
    return profile
      ? {
          ...slot,
          name: typeof profile.name === 'string' ? profile.name.trim().slice(0, 60) : '',
          pitch: Number(profile.pitch),
          roll: Number(profile.roll),
        }
      : slot;
  });
}

export function normalizeCalibrationSlots(value, calibrations, legacyProfiles, legacySlotIds) {
  return Object.fromEntries(
    calibrationSources.map((source) => {
      const slots = value?.[source];
      const normalized = Array.isArray(slots)
        ? calibrationSlotIds.map((_, index) => normalizeSlot(slots[index], index))
        : migrateLegacySlots(source, calibrations, legacyProfiles, legacySlotIds);

      return [source, normalized];
    }),
  );
}

export function normalizeCalibrationSlotIds(value) {
  return Object.fromEntries(
    calibrationSources.map((source) => [
      source,
      calibrationSlotIds.includes(value?.[source])
        ? value[source]
        : calibrationSlotIds[0],
    ]),
  );
}

export function getActiveCalibration(source, slots, slotIds) {
  const selectedSlot = slots[source].find((slot) => slot.id === slotIds[source]);
  return selectedSlot?.pitch !== null && selectedSlot?.roll !== null
    ? { pitch: selectedSlot.pitch, roll: selectedSlot.roll }
    : defaultCalibration;
}

export function replaceCalibrationSlotOffsets(slots, slotId, calibration) {
  return slots.map((slot) =>
    slot.id === slotId
      ? { ...slot, pitch: calibration.pitch, roll: calibration.roll }
      : slot,
  );
}
