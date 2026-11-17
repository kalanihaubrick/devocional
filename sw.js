/* Service worker: guarda os arquivos do app em cache para funcionar offline.
 * Ao publicar uma nova versão, aumente CACHE para forçar a atualização. */
var CACHE = 'devocional-v2';
var ASSETS = [
  './',
  'index.html',
  'styles.css',
  'config.js',
  'game.js',
  'store.js',
  'sync.js',
  'auth.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // nunca interceptar a API do Supabase
  if (url.hostname.indexOf('supabase.co') >= 0 || url.pathname.indexOf('/functions/') >= 0) return;

  var sameOrigin = url.origin === self.location.origin;
  if (sameOrigin) {
    // arquivos do app: rede primeiro (pega atualizações), cache se estiver offline
    e.respondWith(fetch(req).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match('index.html'); });
    }));
  } else {
    // bibliotecas da CDN (versões fixas): cache primeiro
    e.respondWith(caches.match(req).then(function (r) {
      return r || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      });
    }));
  }
});
