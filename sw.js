// ステーション地図 サービスワーカー（アプリ本体のみオフライン対応。地図タイルは通信が必要）
var CACHE = 'gomi-map-v1';
var ASSETS = ['./', './index.html', './data.js', './route.js', './legs.js', './poi.js','./simple-style.js', './lib/maplibre-gl.js', './lib/maplibre-gl.css', './lib/leaflet-maplibre-gl.js', './manifest.json', './icon-192.png', './icon-512.png',
  './lib/leaflet.js', './lib/leaflet.css', './lib/images/layers.png', './lib/images/layers-2x.png',
  './lib/images/marker-icon.png', './lib/images/marker-shadow.png'];

self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(ASSETS.map(function(u){ return c.add(u).catch(function(){}); }));
  }));
  self.skipWaiting();
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }));
  self.clients.claim();
});
self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;           // 地図タイル等は通常通信
  e.respondWith(
    fetch(e.request, {cache:'no-store'}).then(function(res){
      var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(e.request, copy); }); return res;
    }).catch(function(){ return caches.match(e.request); })
  );
});
