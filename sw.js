// Fabric Count — offline support service worker.
//
// This file is intentionally generic: it contains NO reference to the
// HTML file's name or path, and no list of CDN library URLs to keep in
// sync. You can rename, replace, or edit the main HTML file as often as
// you like and never need to touch this file again.
//
// Strategy: network-first, falling back to cache only when the network
// is unreachable.
//   - Online  → you always get the live, just-deployed version (no
//     "stuck on an old cached copy" problem after you push updates).
//   - Offline → whatever loaded successfully on your last online visit
//     (the page itself, plus every script/font/library it pulled in —
//     Firebase, PDF.js, html2canvas, jsPDF, xlsx, Google Fonts, or
//     anything you add later) is served from cache instead of failing.
//
// Must live in the SAME folder as the HTML file (its scope is that
// folder and everything under it) and be registered from the page with:
//   navigator.serviceWorker.register('./sw.js')
//
// The only reason to ever edit this file: bump CACHE_NAME below if you
// deliberately want to force every visitor to throw away their cache.
// That's a rare, optional reset button — not something content changes
// require.
const CACHE_NAME = 'fabric-count-v2';

// Synthetic cache key standing in for "whatever page the user last
// navigated to successfully" — this is what makes the offline fallback
// work without ever hard-coding the HTML file's name.
const NAV_FALLBACK_KEY = new Request('/__last-page__');

self.addEventListener('install', () => {
  self.skipWaiting(); // activate this version immediately, don't wait for old tabs to close
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
  // already handles that layer independently of this file.
  if (req.method !== 'GET') return;

  event.respondWith(
    fetch(req)
      .then(res => {
        // Cache whatever just loaded successfully, under its own URL —
        // so the NEXT offline visit has the latest good copy, whatever
        // the HTML file happens to be named today.
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(req, resClone.clone());
          // A full-page load (not a sub-resource like a script or font)
          // also gets remembered as "the page" under the fixed synthetic
          // key above, so the fallback below always has something to
          // serve, regardless of the real file's name or path.
          if (req.mode === 'navigate') cache.put(NAV_FALLBACK_KEY, resClone);
        }).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then(cached =>
          cached || (req.mode === 'navigate' ? caches.match(NAV_FALLBACK_KEY) : undefined)
        )
      )
  );
});
