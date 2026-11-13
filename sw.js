/*
 * Tung_LandTech – chạy offline khi cài lên iPhone / iPad (web app).
 * Lưu sẵn toàn bộ file của app; ảnh nền vệ tinh vẫn tải qua mạng.
 */
const CACHE = 'tlt-v2.19-202611130708';
const FILES = [
    './',
    'css/app.css',
    'icons/icon-180.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'index.html',
    'js/app.js',
    'js/attr.js',
    'js/cad.js',
    'js/crs.js',
    'js/dgn.js',
    'js/dgn8.js',
    'js/export.js',
    'js/fastlayer.js',
    'js/findnav.js',
    'js/gdb.js',
    'js/landuse.js',
    'js/license.js',
    'js/loaders.js',
    'js/ole.js',
    'js/polygonize.js',
    'js/textlayer.js',
    'js/wayback.js',
    'lib/dwg/dist/libredwg-web.js',
    'lib/dwg/wasm/libredwg-web.js',
    'lib/dwg/wasm/libredwg-web.wasm',
    'lib/dxf-parser.js',
    'lib/fflate.js',
    'lib/images/layers.png',
    'lib/images/layers-2x.png',
    'lib/images/marker-icon.png',
    'lib/images/marker-icon-2x.png',
    'lib/images/marker-shadow.png',
    'lib/leaflet.css',
    'lib/leaflet.js',
    'lib/proj4.js',
    'lib/shp.js',
    'manifest.webmanifest',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // ảnh vệ tinh: đi thẳng ra mạng
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); }
    return res;
  })));
});
