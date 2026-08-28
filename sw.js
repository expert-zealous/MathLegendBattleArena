// MATH LEGENDS — service worker (v0.8.2+)
// Halaman: NETWORK-FIRST agar pemain selalu dapat versi terbaru;
// aset lain: cache-first agar cepat & bisa offline.
const CACHE = 'math-legends-0.9.0';
const ASSETS = ['./', './index.html', './manifest.json', './favicon-64.png', './icon-192.png', './icon-512.png',
  './assets/audio/menu.mp3', './assets/audio/battle.mp3', './assets/audio/victory.mp3', './assets/audio/defeat.mp3',
  './assets/audio/atk-raka.mp3', './assets/audio/atk-lyra.mp3', './assets/audio/atk-sena.mp3', './assets/audio/atk-kage.mp3', './assets/audio/atk-morru.mp3'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf('math-legends-') === 0 && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }).then((list) => {
        // muat ulang tab yang terbuka agar tidak terjebak di versi lama
        list.forEach((c) => { try { c.navigate(c.url); } catch (err) {} });
      }))
  );
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Firestore/CDN lewat jaringan
  const isPage = e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  if (isPage) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then((h) => h || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
