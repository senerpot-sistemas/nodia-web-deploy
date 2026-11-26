// NODIA Campo — service worker: hace que la APP abra sin señal.
// Solo guarda los archivos de la app (pantallas, estilos, íconos). Las llamadas a NODIA y a Campo
// (…/exec) nunca pasan por aquí ni se guardan: los datos sin conexión los maneja la cola de la app.
const VERSION = 'campo-v20261126b';
const ARCHIVOS = [
  './', 'index.html', 'manifest.webmanifest',
  'css/app.css?v=20261126b',
  'js/config.js?v=20261126b', 'js/almacen.js?v=20261126b', 'js/api.js?v=20261126b', 'js/cola.js?v=20261126b', 'js/app.js?v=20261126b',
  'img/nodia-symbol.png', 'img/favicon-32.png', 'img/icono-180.png', 'img/icono-192.png', 'img/icono-512.png',
  'fonts/montserrat-600.woff2', 'fonts/montserrat-700.woff2', 'fonts/montserrat-800.woff2',
  'fonts/sourcesans3-400.woff2', 'fonts/sourcesans3-600.woff2', 'fonts/sourcesans3-700.woff2'
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/exec') || url.pathname.indexOf('/__sim/') !== -1) return;

  // Primero la red (para recibir versiones nuevas); si no hay señal o tarda más de 3 s, la copia guardada.
  ev.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const guardado = await cache.match(req) || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
    const deRed = fetch(req).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; });
    if (!guardado) return deRed;
    const limite = new Promise((res) => setTimeout(() => res(null), 3000));
    try { return (await Promise.race([deRed, limite])) || guardado; } catch (e) { return guardado; }
  })());
});
