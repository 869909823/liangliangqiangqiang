const APP_VERSION = '0.2.0-beta.1';
const CACHE_NAMESPACE = 'liangliangqiangqiang-pwa';
const SCOPE_URL = new URL(self.registration.scope);
const SCOPE_KEY = encodeURIComponent(SCOPE_URL.pathname);
const CACHE_PREFIX = `${CACHE_NAMESPACE}-${SCOPE_KEY}-`;
const CACHE_NAME = `${CACHE_PREFIX}${APP_VERSION}`;
const LEGACY_CACHE_NAME = 'liangliangqiangqiang-v1';
const IS_BETA_SCOPE = SCOPE_URL.pathname.endsWith('/beta/');

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './js/dialogues.js',
  './js/settings.js',
  './js/platform.js',
  './js/state-machine.js',
  './js/audio-manager.js',
  './js/scheduler.js',
  './js/quiz-bank.js',
  './js/story-bank.js',
  './css/tokens.css',
  './css/character.css',
  './css/animations.css',
  './css/controls.css',
  './css/responsive.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './assets/audio/mokugyo-soft.wav',
  './assets/audio/mokugyo-bright.wav'
];

function inCurrentScope(requestUrl) {
  const url = new URL(requestUrl);
  return url.origin === SCOPE_URL.origin && url.pathname.startsWith(SCOPE_URL.pathname);
}

function isNavigation(request) {
  return request.mode === 'navigate'
    || request.destination === 'document'
    || request.headers.get('accept')?.includes('text/html');
}

function canCache(response) {
  return response && response.ok && (response.type === 'basic' || response.type === 'default');
}

async function fetchAndCache(request, cache) {
  const response = await fetch(request);
  if (canCache(response)) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    return await fetchAndCache(request, cache);
  } catch {
    return await cache.match(request)
      || cache.match(new URL('./index.html', SCOPE_URL).href)
      || cache.match(new URL('./', SCOPE_URL).href)
      || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  return await cache.match(request) || fetchAndCache(request, cache);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);

    if (self.registration.active) {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      clients.forEach(client => client.postMessage({
        type: 'pwa:update-available',
        version: APP_VERSION
      }));
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const staleNames = names.filter(name => (
      name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME
    ) || (
      !IS_BETA_SCOPE && name === LEGACY_CACHE_NAME
    ));
    await Promise.all(staleNames.map(name => caches.delete(name)));
    await self.clients.claim();

  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || !inCurrentScope(request.url)) return;
  event.respondWith(isNavigation(request) ? networkFirst(request) : cacheFirst(request));
});
