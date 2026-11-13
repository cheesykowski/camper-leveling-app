export const defaultCalibration = {
  pitch: 0,
  roll: 0,
};

export const defaultCalibrations = {
  phone: defaultCalibration,
  external: defaultCalibration,
};

export const defaultCalibrationProfiles = {
  phone: [],
  external: [],
};

export const defaultCalibrationProfileIds = {
  phone: null,
  external: null,
};

const calibrationSources = ['phone', 'external'];

export function normalizeCalibrationProfiles(value) {
  return Object.fromEntries(
    calibrationSources.map((source) => {
      const profiles = Array.isArray(value?.[source]) ? value[source] : [];

      return [
        source,
        profiles.flatMap((profile) => {
          if (!profile || typeof profile.id !== 'string' || !profile.id) return [];

          const pitch = Number(profile.pitch);
          const roll = Number(profile.roll);
          if (!Number.isFinite(pitch) || !Number.isFinite(roll)) return [];

          const timestamp = Number(profile.createdAt);
          return [
            {
              id: profile.id,
              name: typeof profile.name === 'string' ? profile.name.trim().slice(0, 60) : '',
              pitch,
              roll,
              createdAt:
                Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now(),
            },
          ];
        }),
      ];
    }),
  );
}

export function normalizeCalibrationProfileIds(value, profiles) {
  return Object.fromEntries(
    calibrationSources.map((source) => {
      const id = typeof value?.[source] === 'string' ? value[source] : null;
      const exists = profiles[source].some((profile) => profile.id === id);
      return [source, exists ? id : null];
    }),
  );
}

export function getActiveCalibration(source, calibrations, profiles, profileIds) {
  const activeId = profileIds[source];
  const selectedProfile = profiles[source].find((profile) => profile.id === activeId);
  return selectedProfile ?? calibrations[source] ?? defaultCalibration;
}
