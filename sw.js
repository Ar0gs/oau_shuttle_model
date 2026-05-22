/**
 * OAU Transit — Service Worker v2
 * Strategy: Cache-first for static assets, Network-first for HTML,
 *            Always-network for Supabase API calls.
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE  = `oau-transit-static-${CACHE_VERSION}`;
const MAP_CACHE     = `oau-transit-maps-${CACHE_VERSION}`;
const ALL_CACHES    = [STATIC_CACHE, MAP_CACHE];

// Core app shell — always cache these
const APP_SHELL = [
  '/index.html',
  '/student.html',
  '/driver.html',
  '/admin.html',
  '/backend.js',
  '/sw.js',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
];

// External static assets
const EXTERNAL_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
];

// ─── INSTALL ─────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting(); // activate immediately

  event.waitUntil(
    caches.open(STATIC_CACHE).then(async cache => {
      // Cache local files — these must succeed
      try {
        await cache.addAll(APP_SHELL);
      } catch(e) {
        console.warn('[SW] Some app shell files not cached yet:', e.message);
        // Try one-by-one so one failure doesn't block the rest
        for (const url of APP_SHELL) {
          try { await cache.add(url); } catch {}
        }
      }

      // Cache external assets with no-cors (opaque responses are fine for these)
      for (const url of EXTERNAL_ASSETS) {
        try {
          await cache.add(new Request(url, { mode: 'no-cors' }));
        } catch {}
      }
    })
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !ALL_CACHES.includes(key))
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim()) // take control of all open tabs immediately
  );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. NEVER intercept Supabase API requests — always go to network
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in')) {
    return; // let browser handle it
  }

  // 2. NEVER intercept non-GET requests
  if (request.method !== 'GET') return;

  // 3. Leaflet map tiles — cache with longer TTL
  if (url.hostname.includes('tile.openstreetmap') || url.hostname.includes('tiles.')) {
    event.respondWith(mapTileStrategy(request));
    return;
  }

  // 4. Google Fonts — network first with cache fallback
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(networkFirstStrategy(request, STATIC_CACHE));
    return;
  }

  // 5. Navigation requests (HTML pages) — network first so updates propagate
  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request));
    return;
  }

  // 6. Everything else (JS, CSS, images, icons) — cache first
  event.respondWith(cacheFirstStrategy(request, STATIC_CACHE));
});

// ─── STRATEGIES ──────────────────────────────────────────────────────────────

async function navigationStrategy(request) {
  try {
    const networkResponse = await fetchWithTimeout(request, 4000);
    // Update cache in background
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, networkResponse.clone()).catch(() => {});
    return networkResponse;
  } catch {
    // Offline: serve from cache
    const cached = await caches.match(request);
    if (cached) return cached;
    // Ultimate fallback: serve index
    return caches.match('/index.html');
  }
}

async function cacheFirstStrategy(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone()).catch(() => {});
    }
    return networkResponse;
  } catch {
    return new Response('Offline — resource not cached', { status: 503 });
  }
}

async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetchWithTimeout(request, 3000);
    const cache = await caches.open(cacheName);
    cache.put(request, networkResponse.clone()).catch(() => {});
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function mapTileStrategy(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(MAP_CACHE);
      cache.put(request, networkResponse.clone()).catch(() => {});
    }
    return networkResponse;
  } catch {
    // Return a blank tile so the map still renders
    return new Response('', { status: 204 });
  }
}

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(
      res => { clearTimeout(timer); resolve(res); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

// ─── BACKGROUND SYNC ─────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-ride-requests') {
    event.waitUntil(syncOfflineRequests());
  }
});

async function syncOfflineRequests() {
  // The app layer handles this via localStorage → Supabase on reconnect
  // Notify all clients to trigger a sync
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({ type: 'SYNC_REQUESTED' }));
}

// ─── PUSH NOTIFICATIONS ──────────────────────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;

  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'OAU Transit', body: event.data.text() }; }

  const options = {
    body:    data.body || 'New update from OAU Transit',
    icon:    '/icon-192x192.png',
    badge:   '/icon-96x96.png',
    image:   data.image || undefined,
    vibrate: [200, 100, 200, 100, 400],
    tag:     data.tag || 'oau-transit',
    renotify: true,
    requireInteraction: data.urgent || false,
    data: { url: data.url || '/index.html', timestamp: Date.now() },
    actions: data.actions || [
      { action: 'open', title: 'Open App', icon: '/icon-96x96.png' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'OAU Transit', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing tab if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'NOTIFICATION_CLICK', url: targetUrl });
          return;
        }
      }
      // Otherwise open new tab
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// ─── MESSAGE HANDLER ─────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    caches.open(STATIC_CACHE).then(cache => cache.addAll(urls)).catch(() => {});
  }
});
