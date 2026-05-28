const CACHE_NAME = 'altayyibin-v2';
const urlsToCache = [
  'https://altayyibin.com/',
  'https://altayyibin.com/index.html',
  'https://altayyibin.com/menu.html',
  'https://altayyibin.com/manifest.json',
  'https://altayyibin.com/altayyibinlogo.png',
  'https://altayyibin.com/altayyibin.jpeg',
  'https://altayyibin.com/favicon.svg'
];

// Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch(err => {
        console.warn('[SW] Cache addAll failed:', err);
      })
  );
  self.skipWaiting();
});

// Fetch requests — cache-first with network fallback
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
          return response;
        });
      })
  );
});

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});
