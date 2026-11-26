// アプリのバージョンと「最新版に更新」。大きな変更のときだけ、番号を上げる。
var APP_VERSION = 'v1.4';
function appForceUpdate() {
  if (!confirm('最新版に更新します（保存されている画面のデータを消して、読み込み直します）。\n電波のある場所で行ってください。\n\nよろしいですか？')) return;
  var jobs = [];
  try { if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) jobs.push(navigator.serviceWorker.getRegistrations().then(function (rs) { return Promise.all(rs.map(function (r) { return r.unregister(); })); })); } catch (e) {}
  try { if (window.caches && caches.keys) jobs.push(caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); })); } catch (e) {}
  Promise.all(jobs).catch(function () {}).then(function () {
    var u = location.href.split('#')[0].replace(/([?&])_u=\d+&?/, '$1').replace(/[?&]$/, '');
    location.href = u + (u.indexOf('?') >= 0 ? '&' : '?') + '_u=' + Date.now() + (location.hash || '');
  });
}
// 全画面ボタン（タブレット・パソコンだけ。☰の左に出す）。下のタスクバーや上の時計の帯を隠して、地図を広くする。対応していない端末(iPhone)では出さない
(function () {
  var menu = document.getElementById('bMenu'), root = document.documentElement;
  if (!menu || !document.fullscreenEnabled || !root.requestFullscreen) return;
  var path = function (d) { return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="' + d + '"/></svg>'; };
  var OPEN = path('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'), CLOSE = path('M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5');
  var st = document.createElement('style');
  st.textContent = '#bFs{display:none !important}'
    + '@media (min-width:600px) and (min-height:500px){#bFs{display:inline-flex !important;align-items:center;justify-content:center;flex:none;width:46px;height:35px;padding:0 !important}}'
    + '@media (orientation:landscape) and (min-width:640px){#hd #bFs{order:5}}';
  document.head.appendChild(st);
  var b = document.createElement('button'); b.id = 'bFs'; b.type = 'button';
  function draw() { var on = !!document.fullscreenElement; b.innerHTML = on ? CLOSE : OPEN; b.setAttribute('aria-label', on ? '全画面をやめる' : '全画面表示'); }
  b.onclick = function (e) {
    e.stopPropagation();
    var p = document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen({ navigationUI: 'hide' });
    if (p && p.catch) p.catch(function () {});
  };
  document.addEventListener('fullscreenchange', draw);
  draw(); menu.parentNode.insertBefore(b, menu);
  // 全画面中は上の帯（時計など）が隠れるので、時刻・電池残量・圏外を、⛶の左に出す（電波の本数は、ホームページからは分からない）
  st.textContent += '#fsStat{display:none;flex:none;align-items:center;gap:10px;font-size:16px;font-weight:bold;white-space:nowrap}'
    + '#fsStat .off{background:#d32f2f;color:#fff;border-radius:8px;padding:2px 8px}'
    + '@media (min-width:600px) and (min-height:500px){#fsStat.on{display:flex}}'
    + '@media (orientation:landscape) and (min-width:640px){#hd #fsStat{order:5}}';
  var info = document.createElement('span'); info.id = 'fsStat'; menu.parentNode.insertBefore(info, b);
  var battery = null, timer = null;
  function show() {
    var on = !!document.fullscreenElement; info.className = on ? 'on' : '';
    if (!on) return;
    var d = new Date(), h = '';
    if (navigator.onLine === false) h += '<span class="off">圏外</span>';
    h += '<span>' + d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2) + '</span>';
    if (battery) h += '<span>' + (battery.charging ? '⚡' : '🔋') + Math.round(battery.level * 100) + '%</span>';
    info.innerHTML = h;
  }
  if (navigator.getBattery) navigator.getBattery().then(function (bt) { battery = bt; bt.addEventListener('levelchange', show); bt.addEventListener('chargingchange', show); show(); }).catch(function () {});
  window.addEventListener('online', show); window.addEventListener('offline', show);
  document.addEventListener('visibilitychange', show);
  document.addEventListener('fullscreenchange', function () { clearInterval(timer); if (document.fullscreenElement) timer = setInterval(show, 5000); show(); });
})();
