import test from 'node:test';
import assert from 'node:assert/strict';
import { hasCachedAssets } from './pwaCache.js';

function fakeCaches(entries) {
  return {
    keys: async () => Object.keys(entries),
    open: async (name) => ({
      keys: async () => entries[name].map((path) => ({ url: `https://example.test${path}` })),
    }),
  };
}

test('requires every offline asset in the same precache', async () => {
  const required = ['/app/index.html', '/app/assets/main.js', '/app/assets/lazy.js'];
  assert.equal(await hasCachedAssets(fakeCaches({
    'workbox-precache-v2': ['/app/index.html?__WB_REVISION__=1', '/app/assets/main.js', '/app/assets/lazy.js'],
  }), required), true);
  assert.equal(await hasCachedAssets(fakeCaches({
    'workbox-precache-v2': ['/app/index.html', '/app/assets/main.js'],
    'other-cache': ['/app/assets/lazy.js'],
  }), required), false);
  assert.equal(await hasCachedAssets(fakeCaches({
    'workbox-precache-v1': ['/app/index.html', '/app/assets/main.js'],
    'workbox-precache-v2': ['/app/assets/lazy.js'],
  }), required), false);
});
