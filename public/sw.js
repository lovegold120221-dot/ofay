const CACHE_NAME = 'beatrice-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/icon-eburon.svg',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Ignore API calls and ngrok tunnels
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('ngrok') || 
      event.request.url.includes('localhost')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
