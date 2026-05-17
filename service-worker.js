/* ══════════════════════════════════════════════════════
   SERVICE-WORKER.JS  —  finZa PWA
   Estrategia: Cache First para assets estáticos
══════════════════════════════════════════════════════ */

const CACHE_NAME = 'finza-cache-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/css/master.css',
  './assets/js/main.js',
  './assets/js/app.js',
  './assets/js/auth.js',
  './assets/js/firebase-config.js',
  './assets/js/pwa.js',
  './assets/images/logo.png',
  './assets/images/favicon.png',
];

/* ── INSTALL: cachear archivos estáticos ─────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: limpiar caches anteriores ─────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: Cache First, fallback a Network ──────── */
self.addEventListener('fetch', event => {
  // Solo interceptar requests GET
  if (event.request.method !== 'GET') return;

  // No interceptar requests a Firebase ni CDNs (necesitan red)
  const url = new URL(event.request.url);
  if (
    url.origin !== location.origin ||
    url.pathname.includes('firebasejs') ||
    url.pathname.includes('googleapis') ||
    url.pathname.includes('gstatic')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          // Solo cachear respuestas válidas
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
      .catch(() => {
        // Si falla todo (sin red + sin cache), devolver la página principal
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      })
  );
});
