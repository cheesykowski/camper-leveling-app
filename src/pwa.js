import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { hasCachedAssets } from './pwaCache.js';

const standaloneDisplay = window.matchMedia('(display-mode: standalone)');
let state = {
  offline: 'checking',
  online: navigator.onLine,
  canInstall: false,
  installed: standaloneDisplay.matches,
  standalone: standaloneDisplay.matches,
  updateAvailable: false,
  error: '',
};
const listeners = new Set();
let installPrompt;
let registration;

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

let updateServiceWorker;
if (import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator) {
  updateServiceWorker = registerSW({
    immediate: true,
    onOfflineReady: () => checkOfflineCache(),
    onNeedRefresh: () => updateState({ updateAvailable: true }),
    onRegisteredSW: (_url, workerRegistration) => {
      registration = workerRegistration;
      if (!registration) {
        updateState({ offline: 'unavailable', error: 'Offline support could not be started.' });
        return;
      }
      if (registration.active) checkOfflineCache();
      else if (registration.installing) {
        const installing = registration.installing;
        installing.addEventListener('statechange', () => {
          if (registration.active) checkOfflineCache();
          else if (installing.state === 'redundant') {
            updateState({ offline: 'unavailable', error: 'Offline support could not be started.' });
          }
        });
      }
      navigator.serviceWorker.ready.then(() => checkOfflineCache()).catch((error) => {
        console.error('Service worker did not become ready:', error);
        updateState({ offline: 'unavailable', error: 'Offline support could not be started.' });
      });
    },
    onRegisterError: (error) => {
      console.error('Service worker registration failed:', error);
      updateState({ offline: 'unavailable', error: 'Offline support could not be started.' });
    },
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
  try {
    await updateServiceWorker(true);
  } catch (error) {
    console.error('App update failed:', error);
    updateState({ error: 'The update could not be installed.' });
  }
}
