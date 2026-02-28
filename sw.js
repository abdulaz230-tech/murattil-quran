const CACHE_NAME = 'murattil-v2';
const APP_SHELL = ['/', '/index.html', '/manifest.json'];

// Install: cache the app shell
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - App shell: cache first
// - Quran API (text): network first, fall back to cache (so it works offline after first load)
// - Audio files: cache first (once downloaded, always available offline)
// - Everything else: network first
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Quran audio — cache first (big files, don't re-download)
  if (url.hostname === 'cdn.islamic.network' || url.pathname.includes('/audio/')) {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(response => {
            if (response.ok) cache.put(e.request, response.clone());
            return response;
          }).catch(() => new Response('Audio unavailable offline', { status: 503 }));
        })
      )
    );
    return;
  }

  // Quran text API — network first, cache fallback
  if (url.hostname === 'api.alquran.cloud') {
    e.respondWith(
      fetch(e.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Google Fonts — cache first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(e.request).then(cached => {
          if (cached) return cached;
          return fetch(e.request).then(response => {
            cache.put(e.request, response.clone());
            return response;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  // App shell and other local files — cache first, network fallback
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request))
    );
    return;
  }

  // Default: network first
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
