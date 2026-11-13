import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultCalibration,
  getActiveCalibration,
  normalizeCalibrationProfileIds,
  normalizeCalibrationProfiles,
} from './calibration.js';

test('normalizes saved profiles and ignores invalid entries', () => {
  const profiles = normalizeCalibrationProfiles({
    phone: [
      { id: 'cab', name: '  Cab  ', pitch: '2.5', roll: -1, createdAt: 123 },
      { id: '', name: 'Missing ID', pitch: 0, roll: 0 },
      { id: 'bad-offset', pitch: 'not a number', roll: 0 },
    ],
  });

  assert.deepEqual(profiles.phone, [
    { id: 'cab', name: 'Cab', pitch: 2.5, roll: -1, createdAt: 123 },
  ]);
  assert.deepEqual(profiles.external, []);
});

test('uses the selected profile, otherwise falling back to the latest calibration', () => {
  const profiles = normalizeCalibrationProfiles({
    phone: [{ id: 'bed', name: 'Bed', pitch: 4, roll: -2, createdAt: 123 }],
  });
  const latest = { phone: { pitch: 1, roll: 0.5 }, external: defaultCalibration };
  const selected = normalizeCalibrationProfileIds({ phone: 'bed' }, profiles);
  const invalidSelection = normalizeCalibrationProfileIds({ phone: 'missing' }, profiles);

  assert.deepEqual(
    getActiveCalibration('phone', latest, profiles, selected),
    { pitch: 4, roll: -2, id: 'bed', name: 'Bed', createdAt: 123 },
  );
  assert.deepEqual(getActiveCalibration('phone', latest, profiles, invalidSelection), {
    pitch: 1,
    roll: 0.5,
  });
});

test('keeps phone and external profile selections independent', () => {
  const profiles = normalizeCalibrationProfiles({
    phone: [{ id: 'cab', pitch: 1, roll: 2 }],
    external: [{ id: 'sensor', pitch: -3, roll: 4 }],
  });
  const selections = normalizeCalibrationProfileIds(
    { phone: 'cab', external: 'sensor' },
    profiles,
  );
  const latest = {
    phone: { pitch: 0, roll: 0 },
    external: { pitch: 0, roll: 0 },
  };

  const phone = getActiveCalibration('phone', latest, profiles, selections);
  const external = getActiveCalibration('external', latest, profiles, selections);

  assert.deepEqual(
    { id: phone.id, pitch: phone.pitch, roll: phone.roll },
    { id: 'cab', pitch: 1, roll: 2 },
  );
  assert.deepEqual(
    { id: external.id, pitch: external.pitch, roll: external.roll },
    { id: 'sensor', pitch: -3, roll: 4 },
  );
});
