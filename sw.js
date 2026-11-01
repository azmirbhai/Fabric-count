// Fabric Count — offline support service worker.
//
// Strategy: network-first, falling back to cache only when the network
// is unreachable.
//   - Online  → you always get the live, just-deployed version (no
//     "stuck on an old cached copy" problem after you push updates).
//   - Offline → whatever loaded successfully on your last online visit
//     (this page + the Firebase/PDF/Excel/font libraries it loads) is
//     served from cache instead of failing.
//
// Must live in the SAME folder as the HTML file it serves (its scope is
// that folder and everything under it).
//
// NOTE: bumping CACHE_NAME is NOT required for normal content updates —
// network-first already picks those up automatically whenever you're
// online. Only bump it if you ever need to force every visitor to throw
// away a bad cached entry.
const CACHE_NAME = 'fabric-count-v1';

// Best-effort pre-cache so offline works even before a second online
// visit. Each URL is cached independently — one failing (e.g. a path
// guess that doesn't match your exact deploy) doesn't block the rest.
const PRECACHE_URLS = [
  './',
  './fabric_count_v6_desktop-3-13-2.html',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Roboto+Mono:wght@400;500;600;700&display=swap',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.15.0/firebase-database-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // activate this version immediately, don't wait for old tabs to close
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(PRECACHE_URLS.map(url => cache.add(url).catch(() => {})))
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim()) // start controlling already-open tabs too
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  // Only plain GETs go through here. Firebase's realtime sync runs over
  // WebSocket/long-polling, which this never touches — the app's own
  // existing offline-safe sync logic (localStorage + pending flags)
  // already handles that layer.
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then(res => {
        // Keep the cache fresh with whatever just loaded successfully,
        // so the NEXT offline visit has the latest good copy.
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, resClone)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then(cached =>
          cached || (req.mode === 'navigate' ? caches.match('./fabric_count_v6_desktop-3-13-2.html') : undefined)
        )
      )
  );
});
