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

export async function checkForNewWorker(registration, originalController, { timeout = 15000 } = {}) {
  const deadline = Date.now() + timeout;
  let updateTimer;
  try {
    await Promise.race([
      registration.update(),
      new Promise((_, reject) => {
        updateTimer = setTimeout(() => reject(new Error('The update check timed out.')), timeout);
      }),
    ]);
  } finally {
    clearTimeout(updateTimer);
  }
  const worker = registration.installing;
  if (worker && worker.state !== 'installed' && worker.state !== 'activated' && worker.state !== 'redundant') {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.removeEventListener('statechange', onStateChange);
        reject(new Error('The update download did not finish in time.'));
      }, Math.max(0, deadline - Date.now()));
      function onStateChange() {
        if (worker.state === 'installed' || worker.state === 'activated' || worker.state === 'redundant') {
          clearTimeout(timer);
          worker.removeEventListener('statechange', onStateChange);
          resolve();
        }
      }
      worker.addEventListener('statechange', onStateChange);
      onStateChange();
    });
  }
  if (registration.waiting || worker?.state === 'installed'
    || (registration.active && registration.active !== originalController)) return true;
  if (worker?.state === 'redundant') throw new Error('The update download failed.');
  return false;
}
