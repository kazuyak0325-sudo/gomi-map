// ステーション地図 サービスワーカー（アプリ本体はオフラインでも開ける。地図の背景は通信が必要）
// 開いたファイルは自動で保存され、次回からは電波がなくても開ける。オンラインのときは、常に最新を取りに行く
var CACHE = 'gomi-map-v7';
var ASSETS = ['./', './index.html', './course.html', './all.html', './courses.js', './base.js', './poi.js', './sig.js', './ver.js', './simple-style.js', './manifest.json', './icon-192.png', './icon-512.png',
  './lib/leaflet.js', './lib/leaflet.css', './lib/maplibre-gl.js', './lib/maplibre-gl.css', './lib/leaflet-maplibre-gl.js',
  './lib/images/layers.png', './lib/images/layers-2x.png', './lib/images/marker-icon.png', './lib/images/marker-shadow.png'];

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
  var key = url.origin + url.pathname;                  // 検索部分(?c=…, ?t=…)は保存の名前に含めない
  e.respondWith(
    fetch(e.request, {cache:'no-store'}).then(function(res){
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function(c){ c.put(key, copy); }); }
      return res;
    }).catch(function(){ return caches.match(key); })
  );
});
