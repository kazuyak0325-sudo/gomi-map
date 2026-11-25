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
