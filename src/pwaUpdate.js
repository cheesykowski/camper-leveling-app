export async function activateUpdate(registration, originalController, { timeout = 15000, interval = 50 } = {}) {
  const deadline = Date.now() + timeout;
  let requestedWorker;

  while (Date.now() < deadline) {
    const waiting = registration.waiting;
    if (waiting && waiting !== requestedWorker) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      requestedWorker = waiting;
    }

    const active = registration.active;
    if (!waiting && active && active !== originalController && active.state === 'activated'
      && (!requestedWorker || active === requestedWorker || requestedWorker.state === 'redundant')) return;

    if (requestedWorker?.state === 'redundant' && !registration.installing && !registration.waiting) {
      throw new Error('The update worker became redundant.');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw new Error('The update worker did not activate in time.');
}
