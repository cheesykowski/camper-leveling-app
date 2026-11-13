import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calibrationSlotIds,
  defaultCalibration,
  defaultCalibrations,
  defaultCalibrationSlotIds,
  getActiveCalibration,
  normalizeCalibrationSlotIds,
  normalizeCalibrationSlots,
  replaceCalibrationSlotOffsets,
} from './calibration.js';

test('normalizes three named slots and clears invalid offsets', () => {
  const slots = normalizeCalibrationSlots(
    {
      phone: [
        { name: '  Console  ', pitch: '2.5', roll: -1 },
        { name: 'Broken', pitch: 'bad', roll: 0 },
      ],
    },
    defaultCalibrations,
  );

  assert.deepEqual(slots.phone, [
    { id: 'slot-1', name: 'Console', pitch: 2.5, roll: -1 },
    { id: 'slot-2', name: 'Broken', pitch: null, roll: null },
    { id: 'slot-3', name: '', pitch: null, roll: null },
  ]);
  assert.deepEqual(slots.external, [
    { id: 'slot-1', name: '', pitch: null, roll: null },
    { id: 'slot-2', name: '', pitch: null, roll: null },
    { id: 'slot-3', name: '', pitch: null, roll: null },
  ]);
});

test('uses the selected slot offset and zero for an empty slot', () => {
  const slots = normalizeCalibrationSlots(
    {
      phone: [
        { name: 'Console', pitch: 4, roll: -2 },
        { name: 'Bed', pitch: null, roll: null },
      ],
    },
    defaultCalibrations,
  );
  const selectedIds = normalizeCalibrationSlotIds({
    phone: calibrationSlotIds[0],
    external: 'invalid',
  });

  assert.deepEqual(getActiveCalibration('phone', slots, selectedIds), {
    pitch: 4,
    roll: -2,
  });
  assert.deepEqual(getActiveCalibration('external', slots, selectedIds), defaultCalibration);
  assert.deepEqual(selectedIds, defaultCalibrationSlotIds);
});

test('keeps phone and external slot values and selections independent', () => {
  const slots = normalizeCalibrationSlots(
    {
      phone: [{ name: 'Cab', pitch: 1, roll: 2 }],
      external: [{ name: 'Sensor', pitch: -3, roll: 4 }],
    },
    defaultCalibrations,
  );
  const selectedIds = normalizeCalibrationSlotIds({
    phone: 'slot-1',
    external: 'slot-1',
  });

  assert.deepEqual(getActiveCalibration('phone', slots, selectedIds), {
    pitch: 1,
    roll: 2,
  });
  assert.deepEqual(getActiveCalibration('external', slots, selectedIds), {
    pitch: -3,
    roll: 4,
  });
});

test('recalibrates only the selected slot while preserving its name and other slots', () => {
  const slots = normalizeCalibrationSlots(
    {
      phone: [
        { name: 'Console', pitch: 1, roll: 2 },
        { name: 'Bed', pitch: 3, roll: 4 },
      ],
    },
    defaultCalibrations,
  );

  assert.deepEqual(
    replaceCalibrationSlotOffsets(slots.phone, 'slot-2', { pitch: -5, roll: 6 }),
    [
      { id: 'slot-1', name: 'Console', pitch: 1, roll: 2 },
      { id: 'slot-2', name: 'Bed', pitch: -5, roll: 6 },
      { id: 'slot-3', name: '', pitch: null, roll: null },
    ],
  );
});

test('migrates the selected legacy profile, latest offset, and recent profiles into slots', () => {
  const slots = normalizeCalibrationSlots(
    undefined,
    {
      phone: { pitch: 5, roll: -1 },
      external: defaultCalibration,
    },
    {
      phone: [
        { id: 'old', name: 'Old position', pitch: 1, roll: 0, createdAt: 10 },
        { id: 'new', name: 'New position', pitch: 2, roll: 0, createdAt: 20 },
      ],
    },
    { phone: 'old' },
  );

  assert.deepEqual(slots.phone, [
    { id: 'slot-1', name: 'Old position', pitch: 1, roll: 0 },
    { id: 'slot-2', name: '', pitch: 5, roll: -1 },
    { id: 'slot-3', name: 'New position', pitch: 2, roll: 0 },
  ]);
});

test('preserves legacy profiles with identical offsets as separate slots', () => {
  const slots = normalizeCalibrationSlots(
    undefined,
    defaultCalibrations,
    {
      phone: [
        { id: 'cab', name: 'Cab', pitch: 0, roll: 0, createdAt: 20 },
        { id: 'bed', name: 'Bed', pitch: 0, roll: 0, createdAt: 10 },
      ],
    },
    { phone: 'cab' },
  );

  assert.deepEqual(
    slots.phone.slice(0, 2).map(({ name, pitch, roll }) => ({ name, pitch, roll })),
    [
      { name: 'Cab', pitch: 0, roll: 0 },
      { name: 'Bed', pitch: 0, roll: 0 },
    ],
  );
});
