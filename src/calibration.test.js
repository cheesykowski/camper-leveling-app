import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calibrationSlotIds,
  defaultCalibration,
  defaultCalibrations,
  defaultCalibrationSlotIds,
  getActiveCalibration,
  getTrimmedMean,
  normalizeCalibrationSlotIds,
  normalizeCalibrationSlots,
  replaceCalibrationSlotOffsets,
} from './calibration.js';

test('calculates the trimmed mean while excluding isolated low and high readings', () => {
  assert.equal(getTrimmedMean([-100, 8, 9, 10, 11, 12, 13, 14, 15, 100]), 11.5);
});

test('keeps small sample sets intact and ignores non-finite readings', () => {
  assert.equal(getTrimmedMean([2, Number.NaN, 4]), 3);
});

test('rejects a sample set without finite readings', () => {
  assert.throws(() => getTrimmedMean([Number.NaN, Number.POSITIVE_INFINITY]), {
    name: 'RangeError',
  });
});

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

test('keeps simulation, phone and external slot values and selections independent', () => {
  const slots = normalizeCalibrationSlots(
    {
      simulation: [{ name: 'Test', pitch: 8, roll: -6 }],
      phone: [{ name: 'Cab', pitch: 1, roll: 2 }],
      external: [{ name: 'Sensor', pitch: -3, roll: 4 }],
    },
    defaultCalibrations,
  );
  const selectedIds = normalizeCalibrationSlotIds({
    simulation: 'slot-1',
    phone: 'slot-1',
    external: 'slot-1',
  });

  assert.deepEqual(getActiveCalibration('simulation', slots, selectedIds), {
    pitch: 8,
    roll: -6,
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

test('adds empty simulation slots when loading settings from before simulation calibration', () => {
  const slots = normalizeCalibrationSlots(
    { phone: [{ name: 'Cab', pitch: 1, roll: 2 }] },
    defaultCalibrations,
  );

  assert.deepEqual(slots.simulation, [
    { id: 'slot-1', name: '', pitch: null, roll: null },
    { id: 'slot-2', name: '', pitch: null, roll: null },
    { id: 'slot-3', name: '', pitch: null, roll: null },
  ]);
  assert.equal(slots.phone[0].name, 'Cab');
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
