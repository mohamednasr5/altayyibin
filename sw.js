/**
 * sw.js — Service Worker for مطعم الطيبين
 * Strategy: Cache-First for assets, Network-First for HTML
 */

const APP_VERSION   = 'v1.0.0';
const CACHE_STATIC  = `taybeen-static-${APP_VERSION}`;
const CACHE_DYNAMIC = `taybeen-dynamic-${APP_VERSION}`;

// ── Assets to pre-cache on install ────────────────────────────────────────────
const PRECACHE_ASSETS = [
  './',
  './menu-pro.html',
  './manifest.json',
  './favicon.svg',
  './favicon.ico',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-maskable-192x192.png',
  './icons/icon-maskable-512x512.png',
  // External fonts (will be cached on first load)
  'https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Cairo:wght@300;400;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
];

// ── Install: pre-cache core assets ────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      return cache.addAll(PRECACHE_ASSETS.map(url => new Request(url, { cache: 'reload' })))
        .catch(err => console.warn('[SW] Pre-cache partial failure:', err));
    })
  );
  self.skipWaiting();
});

// ── Activate: clean old caches ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_DYNAMIC)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: smart routing ────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // ── HTML: Network-First (always fresh for navigation) ──
  if (request.mode === 'navigate' || request.headers.get('Accept')?.includes('text/html')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── Google Fonts CSS: Network-First with fallback ──
  if (url.hostname === 'fonts.googleapis.com') {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── Font files & CDN assets: Cache-First ──
  if (
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdnjs.cloudflare.com'
  ) {
    event.respondWith(cacheFirst(request, CACHE_DYNAMIC));
    return;
  }

  // ── Local assets (images, icons, etc.): Cache-First ──
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }

  // ── Everything else: Network with dynamic cache ──
  event.respondWith(networkFirst(request));
});

// ── Strategy: Cache-First ──────────────────────────────────────────────────────
async function cacheFirst(request, cacheName = CACHE_STATIC) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type !== 'opaque') {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const fallback = await caches.match('./');
    return fallback || new Response('Offline', { status: 503 });
  }
}

// ── Strategy: Network-First ─────────────────────────────────────────────────────
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_DYNAMIC);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback to app shell for navigation requests
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./menu-pro.html') || await caches.match('./');
      if (fallback) return fallback;
    }

    return new Response(
      `<!DOCTYPE html><html dir="rtl" lang="ar"><head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>غير متصل — مطعم الطيبين</title>
        <style>
          body { font-family: Cairo,sans-serif; background:#1a0f00; color:#e8b84b;
                 display:flex; flex-direction:column; align-items:center;
                 justify-content:center; min-height:100vh; margin:0; text-align:center; padding:20px; }
          h1 { font-size:2rem; margin-bottom:.5rem; }
          p  { color:rgba(230,217,194,.65); font-size:.9rem; line-height:1.7; }
          button { margin-top:1.5rem; background:#c9962b; color:#1a0f00; border:none;
                   border-radius:8px; padding:10px 24px; font-family:Cairo,sans-serif;
                   font-size:1rem; font-weight:800; cursor:pointer; }
        </style>
      </head><body>
        <div style="font-size:3rem">🍽️</div>
        <h1>أنت غير متصل</h1>
        <p>تحقق من اتصالك بالإنترنت<br>وحاول مرة أخرى</p>
        <button onclick="location.reload()">إعادة المحاولة</button>
      </body></html>`,
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

// ── Background Sync (optional, for future order submissions) ──────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncOrders());
  }
});

async function syncOrders() {
  // Future: sync pending orders when back online
  console.log('[SW] Background sync: orders');
}

// ── Push Notifications (optional) ─────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'مطعم الطيبين', {
      body:  data.body  || 'لديك إشعار جديد',
      icon:  './icons/icon-192x192.png',
      badge: './icons/icon-96x96.png',
      dir:   'rtl',
      lang:  'ar',
      data:  { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || './')
  );
});
