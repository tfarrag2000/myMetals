'use strict';

const CACHE_NAME = 'mymetals-pwa-v1';
const CORE_ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'favicon.png',
  'flutter_bootstrap.js',
  'main.dart.js',
  'icons/Icon-192.png',
  'icons/Icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.allSettled(
          CORE_ASSETS.map((asset) =>
            cache.add(new Request(asset, { cache: 'reload' })).catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('mymetals-pwa-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isBypassedUrl(url) {
  return url.pathname.endsWith('/latest.json') || url.pathname.endsWith('/version.json');
}

function isCodeOrDataAsset(url) {
  return /\.(js|mjs|wasm|json)(\?.*)?$/i.test(url.pathname);
}

async function networkFirstNavigate(request) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('text/html')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put('index.html', response.clone()).catch(() => {});
      return response;
    }
  } catch (_) {
    clearTimeout(timeoutId);
  }
  return (await caches.match('index.html')) || (await caches.match('./'));
}

async function cacheFirstAsset(request, url) {
  const cached = await caches.match(request, { ignoreSearch: true });
  const networkUpdate = fetch(request)
    .then(async (response) => {
      if (!response || !response.ok) return response;
      const contentType = response.headers.get('content-type') || '';
      if (isCodeOrDataAsset(url) && contentType.includes('text/html')) {
        return response;
      }
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }
  const fresh = await networkUpdate;
  return fresh || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isBypassedUrl(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigate(request));
    return;
  }

  event.respondWith(cacheFirstAsset(request, url));
});
