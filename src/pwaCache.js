export async function hasCachedAssets(cacheStorage, required) {
  const cacheNames = await cacheStorage.keys();
  for (const name of cacheNames.filter((key) => key.startsWith('workbox-precache-'))) {
    const cache = await cacheStorage.open(name);
    const cachedPaths = (await cache.keys()).map((request) => new URL(request.url).pathname);
    if (required.every((path) => cachedPaths.includes(path))) return true;
  }
  return false;
}
