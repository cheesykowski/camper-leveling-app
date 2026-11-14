import test from 'node:test';
import assert from 'node:assert/strict';
import { activateUpdate } from './pwaUpdate.js';

const fast = { timeout: 100, interval: 1 };

test('activates the waiting worker before completing', async () => {
  const old = { state: 'activated' };
  const registration = { active: old, waiting: null };
  const worker = {
    state: 'installed',
    postMessage(message) {
      assert.deepEqual(message, { type: 'SKIP_WAITING' });
      setTimeout(() => {
        worker.state = 'activated';
        registration.waiting = null;
        registration.active = worker;
      }, 2);
    },
  };
  registration.waiting = worker;
  await activateUpdate(registration, old, fast);
  assert.equal(registration.active, worker);
});

test('waits for an installing worker to become available', async () => {
  const old = { state: 'activated' };
  const registration = { active: old, waiting: null, installing: {} };
  const worker = {
    state: 'installed',
    postMessage() {
      registration.waiting = null;
      registration.active = worker;
      worker.state = 'activated';
    },
  };
  setTimeout(() => {
    registration.installing = null;
    registration.waiting = worker;
  }, 2);
  await activateUpdate(registration, old, fast);
  assert.equal(registration.active, worker);
});

test('accepts a version already activated by another client', async () => {
  const old = { state: 'activated' };
  await activateUpdate({ active: { state: 'activated' }, waiting: null }, old, fast);
});

test('waits for the requested worker even when another version is already active', async () => {
  const old = { state: 'activated' };
  const previousUpdate = { state: 'activated' };
  const registration = { active: previousUpdate, waiting: null };
  const worker = {
    state: 'installed',
    postMessage() {
      registration.waiting = null;
      worker.state = 'activating';
      setTimeout(() => {
        worker.state = 'activated';
        registration.active = worker;
      }, 2);
    },
  };
  registration.waiting = worker;
  await activateUpdate(registration, old, fast);
  assert.equal(registration.active, worker);
});

test('reports activation failure rather than claiming success', async () => {
  const old = { state: 'activated' };
  const registration = { active: old, waiting: { state: 'installed', postMessage() {} } };
  await assert.rejects(activateUpdate(registration, old, { timeout: 10, interval: 1 }), /did not activate/);
});
