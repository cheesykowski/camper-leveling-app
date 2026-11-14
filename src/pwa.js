import { useSyncExternalStore } from 'react';
import { hasCachedAssets } from './pwaCache.js';
import { activateUpdate } from './pwaUpdate.js';

const standaloneDisplay = window.matchMedia('(display-mode: standalone)');
let state = {
  offline: 'checking',
  online: navigator.onLine,
  canInstall: false,
  installed: standaloneDisplay.matches,
  standalone: standaloneDisplay.matches,
  updateAvailable: false,
  updating: false,
  error: '',
};
const listeners = new Set();
let installPrompt;
let registration;
let originalController;

function updateState(changes) {
  state = { ...state, ...changes };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => state;

async function checkOfflineCache() {
  if (!registration?.active || !('caches' in window)) return;
  try {
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
    const manifestResponse = await fetch(new URL('offline-assets.json', baseUrl));
    if (!manifestResponse.ok) throw new Error(`Offline asset list HTTP ${manifestResponse.status}`);
    const assets = await manifestResponse.json();
    if (!Array.isArray(assets) || !assets.every((asset) => typeof asset === 'string')) {
      throw new Error('Invalid offline asset list');
    }
    const required = [
      ...assets.map((asset) => new URL(asset, baseUrl).pathname),
      ...Array.from(document.querySelectorAll('script[type="module"][src], link[rel="stylesheet"][href]'))
        .map((element) => new URL(element.src || element.href))
        .filter((url) => url.origin === window.location.origin)
        .map((url) => url.pathname),
    ];
    const ready = await hasCachedAssets(caches, required);
    updateState({
      offline: ready ? 'ready' : 'unavailable',
      ...(state.error === 'Could not verify offline availability.' ? { error: '' } : {}),
    });
  } catch (error) {
    console.error('Unable to verify offline cache:', error);
    updateState({ offline: 'unavailable', error: 'Could not verify offline availability.' });
  }
}

window.addEventListener('online', () => {
  updateState({ online: true });
  checkOfflineCache();
  checkForUpdate();
});
window.addEventListener('offline', () => {
  updateState({ online: false });
  checkOfflineCache();
});
standaloneDisplay.addEventListener('change', (event) => {
  updateState({ standalone: event.matches });
});
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  updateState({ canInstall: true });
});
window.addEventListener('appinstalled', () => {
  installPrompt = undefined;
  updateState({ installed: true, canInstall: false });
});

function checkForUpdate() {
  if (navigator.onLine && registration) {
    registration.update().catch((error) => console.error('Service worker update check failed:', error));
  }
}

if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  originalController = navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (originalController && navigator.serviceWorker.controller !== originalController) {
      updateState({ updateAvailable: true });
    }
  });

  navigator.serviceWorker.register(new URL('sw.js', baseUrl), { scope: baseUrl.pathname }).then((workerRegistration) => {
    registration = workerRegistration;
    if (!originalController) originalController = registration.active;
    const watchInstalling = () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && (originalController || registration.active)) {
          updateState({ updateAvailable: true });
        } else if (worker.state === 'activated') {
          checkOfflineCache();
        } else if (worker.state === 'redundant' && !registration.active) {
          updateState({ offline: 'unavailable', error: 'Offline support could not be started.' });
        }
      });
    };
    registration.addEventListener('updatefound', watchInstalling);
    watchInstalling();
    if (registration.waiting) updateState({ updateAvailable: true });
    if (registration.active) checkOfflineCache();
    navigator.serviceWorker.ready.then(() => checkOfflineCache()).catch((error) => {
      console.error('Service worker did not become ready:', error);
      updateState({ offline: 'unavailable', error: 'Offline support could not be started.' });
    });
  }).catch((error) => {
    console.error('Service worker registration failed:', error);
    updateState({ offline: 'unavailable', error: 'Offline support could not be started.' });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
} else {
  updateState({ offline: 'unavailable' });
}

export function usePwa() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function refreshOfflineStatus() {
  return checkOfflineCache();
}

export async function installApp() {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = undefined;
  updateState({ canInstall: false, error: '' });
  try {
    await prompt.prompt();
  } catch (error) {
    console.error('App installation failed:', error);
    updateState({ error: 'The installation dialog could not be opened.' });
  }
}

export async function applyUpdate() {
  if (state.updating) return;
  updateState({ updating: true, error: '' });
  try {
    if (!registration) throw new Error('Service worker is not registered.');
    await activateUpdate(registration, originalController);
    window.location.reload();
  } catch (error) {
    console.error('App update failed:', error);
    updateState({ updating: false, error: 'The update could not be installed.' });
  }
}
