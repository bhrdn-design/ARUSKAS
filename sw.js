const CACHE_NAME = 'aruskas-static-v1';
const STATIC_FILES = [
  './', './index.html', './manifest.webmanifest', './assets/css/style.css',
  './assets/js/config.js', './assets/js/api.js', './assets/js/auth.js', './assets/js/app.js',
  './assets/js/dashboard.js', './assets/js/transactions.js', './assets/js/reports.js',
  './assets/js/settings.js', './assets/js/telegram.js', './assets/icons/icon.svg'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.includes('/api/') || url.pathname.includes('/telegram/')) return;
  if (url.origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === 'navigate') return caches.match('./index.html');
    return new Response('Offline', { status: 503 });
  }));
});
