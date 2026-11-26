// 道を外れたときの、道順の引き直し（端末の中だけで計算する。現在地は、外に送らない）
// 道路データ: roads-v1.json（© OpenStreetMap contributors, ODbL）
//   { r: [[手前の点, 交差点, 進んではいけない先の点], …]（右左折禁止など）, c: [緯度・経度を1e5倍して、前の点との差にした数の列], s: [道の種類ごとの目安の速さ km/h], w: [[速さの番号, 一方通行(0/1), 点の番号, 次の点との差, …], …] }
var GomiRoute = (function(){
  var CELL = 200;            // 道を探すための区切り（1e5倍の単位。約200m）
  var MY = 1.11, MX = 0.89;  // 1e5倍の単位1あたりの長さ（m）。大田原市あたりの値
  var MAXV = 45 / 3.6;       // いちばん速い道の速さ（m/秒）

  function build(d){
    var n = d.c.length / 2, y = new Int32Array(n), x = new Int32Array(n), i, j, la = 0, ln = 0;
    for (i = 0; i < n; i++) { la += d.c[2*i]; ln += d.c[2*i+1]; y[i] = la; x[i] = ln; }
    var segA = [], segB = [], segV = [], segO = [], deg = new Int32Array(n);
    d.w.forEach(function(w){
      var v = d.s[w[0]] / 3.6, o = w[1], a = w[2], b;
      for (j = 3; j < w.length; j++) { b = a + w[j]; segA.push(a); segB.push(b); segV.push(v); segO.push(o); deg[a]++; if (!o) deg[b]++; a = b; }
    });
    var head = new Int32Array(n + 1); for (i = 0; i < n; i++) head[i+1] = head[i] + deg[i];
    // 道の1区間を、通れる向きごとに1本（to: 行き先の点、from: 出発の点、seg: どの区間か）
    var to = new Int32Array(head[n]), from = new Int32Array(head[n]), seg = new Int32Array(head[n]), sec = new Float32Array(head[n]), fill = head.slice(0, n), cells = new Map(), segF = new Int32Array(segA.length), segR = new Int32Array(segA.length).fill(-1);
    for (i = 0; i < segA.length; i++) {
      var p = segA[i], q = segB[i], m = Math.hypot((y[q]-y[p]) * MY, (x[q]-x[p]) * MX), t = m / segV[i];
      j = segF[i] = fill[p]++; from[j] = p; to[j] = q; seg[j] = i; sec[j] = t;
      if (!segO[i]) { j = segR[i] = fill[q]++; from[j] = q; to[j] = p; seg[j] = i; sec[j] = t; }
      var y0 = Math.floor(Math.min(y[p], y[q]) / CELL), y1 = Math.floor(Math.max(y[p], y[q]) / CELL), x0 = Math.floor(Math.min(x[p], x[q]) / CELL), x1 = Math.floor(Math.max(x[p], x[q]) / CELL);
      for (var cy = y0; cy <= y1; cy++) for (var cx = x0; cx <= x1; cx++) { var k = cy * 100000 + cx, l = cells.get(k); if (!l) cells.set(k, l = []); l.push(i); }
    }
    var ban = new Map(); (d.r || []).forEach(function(r){ var m = ban.get(r[1]); if (!m) ban.set(r[1], m = {}); m[r[0] + ':' + r[2]] = 1; });
    return { ban:ban, n:n, y:y, x:x, head:head, to:to, from:from, seg:seg, sec:sec, segF:segF, segR:segR, segA:segA, segB:segB, segV:segV, segO:segO, cells:cells };
  }

  // 点の近くの道（max m 以内）を、近い順に返す
  function near(g, ll, max){
    var py = ll[0] * 1e5, px = ll[1] * 1e5, r = Math.ceil(max / (CELL * MX)), cy = Math.floor(py / CELL), cx = Math.floor(px / CELL), seen = {}, out = [];
    for (var a = cy - r; a <= cy + r; a++) for (var b = cx - r; b <= cx + r; b++) {
      var l = g.cells.get(a * 100000 + b); if (!l) continue;
      for (var i = 0; i < l.length; i++) {
        var s = l[i]; if (seen[s]) continue; seen[s] = 1;
        var p = g.segA[s], q = g.segB[s], ay = (g.y[p] - py) * MY, ax = (g.x[p] - px) * MX, dy = (g.y[q] - g.y[p]) * MY, dx = (g.x[q] - g.x[p]) * MX, len2 = dy*dy + dx*dx;
        var f = len2 ? Math.max(0, Math.min(1, -(ay*dy + ax*dx) / len2)) : 0, d = Math.hypot(ay + dy*f, ax + dx*f);
        if (d <= max) out.push({s:s, f:f, d:d, len:Math.sqrt(len2), brg:(Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360, pt:[(g.y[p] + (g.y[q]-g.y[p])*f) / 1e5, (g.x[p] + (g.x[q]-g.x[p])*f) / 1e5]});
      }
    }
    return out.sort(function(u, v){ return u.d - v.d; });
  }
  function angle(a, b){ return Math.abs(((a - b) % 360 + 540) % 360 - 180); }

  // from から to までの道順。heading は進んでいる向き（度。分からなければ null）。見つからなければ null
  function find(g, from, dest, heading, startMax){   // startMax: 出発点から道を探す距離（m。ふだんは60）
    var sc = near(g, from, startMax || 60), gc = near(g, dest, 400);
    if (!sc.length || !gc.length) return null;
    sc = sc.filter(function(c){ return c.d <= sc[0].d + 20; });
    gc = gc.filter(function(c){ return c.d <= gc[0].d + 8; });
    // 進んでいる向きが分かるときは、向きの合う道から出発する（交差する道に吸い付いて、曲がってはいけない先から始まらないように）
    if (heading !== null && heading !== undefined) { var ok = sc.filter(function(c){ return angle(heading, c.brg) <= 45 || angle(heading, (c.brg + 180) % 360) <= 45; }); if (ok.length) sc = ok; }
    var UTURN = 90;   // 進んでいる向きと逆に出発するのは、後回しにする（秒）
    function turn(brg){ return (heading !== null && heading !== undefined && angle(heading, brg) > 110) ? UTURN : 0; }

    // 「どの区間を、どちら向きに走っているか」ごとに調べる（途中の交差点で、すぐ折り返す道順は作らない）
    var M = g.to.length, cost = new Float64Array(M).fill(Infinity), prev = new Int32Array(M).fill(-1), src = new Array(M), done = new Uint8Array(M);
    var hk = [], hv = [];
    function push(k, v){ var i = hk.length; hk.push(k); hv.push(v); while (i) { var p = (i-1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; }
    function pop(){ var v = hv[0], k = hk.pop(), w = hv.pop(), n = hk.length; if (n) { var i = 0; while (true) { var c = 2*i+1; if (c >= n) break; if (c+1 < n && hk[c+1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = k; hv[i] = w; } return v; }
    var gy = dest[0] * 1e5, gx = dest[1] * 1e5;
    function h(i){ return Math.hypot((g.y[i] - gy) * MY, (g.x[i] - gx) * MX) / MAXV - 20; }
    var goal = {}, best = Infinity, bestEdge = -1, bestGoal = null, direct = null;
    gc.forEach(function(c){ goal[c.s] = c; });
    function reach(e, c, start){ if (c < cost[e]) { cost[e] = c; prev[e] = -1; src[e] = start; push(c + h(g.to[e]), e); } }

    var X = g.xedge, anyOpen = !X || sc.some(function(c){ return !X[g.segF[c.s]] || (g.segR[c.s] >= 0 && !X[g.segR[c.s]]); });
    sc.forEach(function(c){
      var v = g.segV[c.s], extra = (c.d - sc[0].d) * 0.5, F = g.segF[c.s], B = g.segR[c.s];
      if (!anyOpen || !X || !X[F]) reach(F, c.len * (1 - c.f) / v + extra + turn(c.brg), c);
      if (B >= 0 && (!anyOpen || !X || !X[B])) reach(B, c.len * c.f / v + extra + turn((c.brg + 180) % 360), c);
    });
    gc.forEach(function(c){
      sc.forEach(function(a){   // 出発と目的地が、同じ道の同じ区間にある場合
        if (a.s !== c.s) return;
        var fwd = c.f >= a.f; if (!fwd && g.segO[c.s]) return;
        if (g.xedge && g.xedge[fwd ? g.segF[c.s] : g.segR[c.s]]) return;
        var t = Math.abs(c.f - a.f) * c.len / g.segV[c.s] + (c.d - gc[0].d) * 0.5 + (a.d - sc[0].d) * 0.5 + turn(fwd ? a.brg : (a.brg + 180) % 360);
        if (t < best) { best = t; direct = [a, c]; }
      });
    });

    while (hk.length) {
      if (hk[0] >= best) break;
      var u = pop(); if (done[u]) continue; done[u] = 1;
      var v = g.to[u], back = g.from[u], first = g.head[v], last = g.head[v+1], deadEnd = true, e;
      for (e = first; e < last; e++) if (g.to[e] !== back && !(g.xedge && g.xedge[e])) { deadEnd = false; break; }
      var no = g.ban.get(v), xno = g.xban && g.xban.get(v);
      for (e = first; e < last; e++) {
        if (no && no[back + ':' + g.to[e]]) continue;   // 右左折禁止
        if ((xno && xno[back + ':' + g.to[e]]) || (g.xedge && g.xedge[e])) continue;   // 会社で登録した禁止
        var uturn = g.to[e] === back; if (uturn && !deadEnd) continue;   // 折り返すのは、行き止まりだけ
        var base = cost[u] + (uturn ? UTURN : 0), s = g.seg[e], gl = goal[s];
        if (gl) {   // 目的地のある区間に入るとき：目的地の所まで走って、終わり
          var part = (e === g.segF[s] ? gl.f : 1 - gl.f) * gl.len / g.segV[s], total = base + part + (gl.d - gc[0].d) * 0.5;
          if (total < best) { best = total; bestEdge = u; bestGoal = gl; direct = null; }
        }
        var nc = base + g.sec[e];
        if (nc < cost[e]) { cost[e] = nc; prev[e] = u; src[e] = src[u]; push(nc + h(g.to[e]), e); }
      }
    }
    var line, endC;
    if (direct) { line = [direct[0].pt, direct[1].pt]; endC = direct[1]; }
    else if (bestEdge >= 0) {
      var path = []; for (var k = bestEdge; k >= 0; k = prev[k]) path.push(g.to[k]);
      path.reverse();
      line = [src[bestEdge].pt].concat(path.map(function(i){ return [g.y[i] / 1e5, g.x[i] / 1e5]; }), [bestGoal.pt]);
      endC = bestGoal;
    } else return null;
    var m = 0;
    for (var j = 1; j < line.length; j++) m += Math.hypot((line[j][0] - line[j-1][0]) * 1e5 * MY, (line[j][1] - line[j-1][1]) * 1e5 * MX);
    if (endC.d > 3) line.push(dest);
    return { line:line, km:Math.round(m / 10) / 100, min:Math.max(1, Math.round(m / (35 / 3.6) / 60)) };
  }

  // 点から折れ線までの距離（m）と、いちばん近い所の線の向き（度）
  function distToLine(ll, line){
    var best = Infinity, brg = null, kx = 111320 * Math.cos(ll[0] * Math.PI / 180), ky = 111000;
    for (var i = 1; i < line.length; i++) {
      var ay = (line[i-1][0] - ll[0]) * ky, ax = (line[i-1][1] - ll[1]) * kx, dy = (line[i][0] - line[i-1][0]) * ky, dx = (line[i][1] - line[i-1][1]) * kx, len2 = dy*dy + dx*dx;
      var f = len2 ? Math.max(0, Math.min(1, -(ay*dy + ax*dx) / len2)) : 0, d = Math.hypot(ay + dy*f, ax + dx*f);
      if (d < best) { best = d; brg = len2 ? (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360 : brg; }
    }
    return { d:best, brg:brg };
  }

  // ---- 会社で登録した禁止（kinsi.json）----
  //   { t:'turn', v:[交差点], a:[交差点から手前の道], b:[交差点から進めない先の道] }
  //   { t:'road', lines:[[道の点…], …], one:true なら線の向きだけ通れない }
  //   どちらも time:{s:'07:30', e:'08:30', wd:平日のみ} があれば、その時間帯だけ（始まりの10分前から）
  function active(rules, date){
    var m = date.getHours() * 60 + date.getMinutes(), day = date.getDay(), mins = function(t){ var p = String(t).split(':'); return +p[0] * 60 + +p[1]; };
    return (rules || []).filter(function(r){ var t = r.time; if (!t) return true; if (t.wd && (day === 0 || day === 6)) return false; return m >= mins(t.s) - 10 && m < mins(t.e); });
  }
  function meter(a, b){ return Math.hypot((a[0] - b[0]) * 111000, (a[1] - b[1]) * 111320 * Math.cos(a[0] * Math.PI / 180)); }
  function bearing(a, b){ return (Math.atan2((b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), b[0] - a[0]) * 180 / Math.PI + 360) % 360; }
  function nodeLL(g, i){ return [g.y[i] / 1e5, g.x[i] / 1e5]; }
  function setRules(g, rules){
    g.xban = new Map(); g.xedge = new Uint8Array(g.to.length);
    (rules || []).forEach(function(r){
      if (r.t === 'turn') {
        var via = -1, vd = 10, others = [];
        near(g, r.v, 15).forEach(function(c){ [g.segA[c.s], g.segB[c.s]].forEach(function(n){ var d = meter(nodeLL(g, n), r.v); if (d < vd) { vd = d; via = n; } }); });
        if (via < 0) return;
        near(g, nodeLL(g, via), 3).forEach(function(c){ var p = g.segA[c.s], q = g.segB[c.s]; if (p === via) others.push(q); else if (q === via) others.push(p); });
        var pick = function(line){ var best = -1, bd = 8; others.forEach(function(n){ var d = distToLine(nodeLL(g, n), line).d; if (d < bd) { bd = d; best = n; } }); return best; };
        var a = pick(r.a), b = pick(r.b); if (a < 0 || b < 0) return;
        var m = g.xban.get(via); if (!m) g.xban.set(via, m = {}); m[a + ':' + b] = 1;
      } else if (r.t === 'road') (r.lines || []).forEach(function(line){
        for (var i = 1; i < line.length; i++) {
          var len = meter(line[i-1], line[i]), steps = Math.max(1, Math.ceil(len / 20));
          for (var k = 0; k <= steps; k++) near(g, [line[i-1][0] + (line[i][0] - line[i-1][0]) * k / steps, line[i-1][1] + (line[i][1] - line[i-1][1]) * k / steps], 6).forEach(function(c){
            var A = nodeLL(g, g.segA[c.s]), B = nodeLL(g, g.segB[c.s]), mid = distToLine([(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], line);
            if (mid.d > 5 || distToLine(A, line).d > 5 || distToLine(B, line).d > 5 || mid.brg === null) return;
            var diff = angle(bearing(A, B), mid.brg); if (diff > 35 && diff < 145) return;
            if (!r.one || diff <= 35) g.xedge[g.segF[c.s]] = 1;
            if (g.segR[c.s] >= 0 && (!r.one || diff >= 145)) g.xedge[g.segR[c.s]] = 1;
          });
        }
      });
    });
  }
  // 点が、線の端より外（手前・先）にあるか。端の先へ続くまっすぐな道は、当たりにしない
  function beyond(p, l){ var out = function(e, n){ var k = Math.cos(e[0] * Math.PI / 180); return (p[0] - e[0]) * (n[0] - e[0]) + (p[1] - e[1]) * (n[1] - e[1]) * k * k < 0; }; return out(l[0], l[1]) || out(l[l.length-1], l[l.length-2]); }
  // 道順（折れ線）が、禁止に当たるかを調べる。当たる禁止の一覧を返す
  function violates(line, rules){
    if (!rules || !rules.length || !line || line.length < 2) return [];
    var box = function(l){ var b = [90, 180, -90, -180]; l.forEach(function(p){ b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); return b; };
    var lb = box(line), pts = null, E = 0.0002;
    return rules.filter(function(r){
      var rb = box(r.t === 'turn' ? r.a.concat(r.b) : [].concat.apply([], r.lines || []));
      if (rb[0] > lb[2] + E || rb[2] < lb[0] - E || rb[1] > lb[3] + E || rb[3] < lb[1] - E) return false;
      if (!pts) { pts = [line[0]]; for (var i = 1; i < line.length; i++) { var n = Math.max(1, Math.ceil(meter(line[i-1], line[i]) / 3)); for (var k = 1; k <= n; k++) pts.push([line[i-1][0] + (line[i][0] - line[i-1][0]) * k / n, line[i-1][1] + (line[i][1] - line[i-1][1]) * k / n]); } }
      if (r.t === 'turn') {
        var reach = function(l){ var t = 0; for (var i = 1; i < l.length; i++) t += meter(l[i-1], l[i]); return Math.max(3, Math.min(12, t - 0.5)); };
        for (var j = 0; j < pts.length; j++) {
          if (meter(pts[j], r.v) > 4) continue;
          // 道が短いとき（すぐ次の交差点があるとき）は、その長さの所で比べる
          var da = reach(r.a), db = reach(r.b), p = j, q = j; while (p > 0 && meter(pts[p], r.v) < da) p--; while (q < pts.length - 1 && meter(pts[q], r.v) < db) q++;
          if (meter(pts[p], r.v) > da * 0.7 && meter(pts[q], r.v) > db * 0.7 && distToLine(pts[p], r.a).d < Math.min(5, da * 0.6) && distToLine(pts[q], r.b).d < Math.min(5, db * 0.6)) return true;
        }
        return false;
      }
      return (r.lines || []).some(function(rl){
        var total = 0, run = 0; for (var i = 1; i < rl.length; i++) total += meter(rl[i-1], rl[i]);
        var need = Math.min(12, total * 0.6);
        for (var j = 1; j < pts.length; j++) {
          var o = distToLine(pts[j], rl), diff = o.brg === null ? 90 : angle(bearing(pts[j-1], pts[j]), o.brg);
          if (o.d <= 4 && !beyond(pts[j], rl) && (diff <= 30 || (!r.one && diff >= 150))) { run += meter(pts[j-1], pts[j]); if (run >= need) return true; } else run = 0;
        }
        return false;
      });
    });
  }

  var loading = null;
  function load(){   // 道路データを読み込む（最初の1回だけ。失敗したら、次にもう一度試す）
    if (!loading) loading = fetch('roads-v1.json').then(function(r){ if (!r.ok) throw new Error('roads ' + r.status); return r.json(); }).then(build).catch(function(e){ loading = null; throw e; });
    return loading;
  }
  return { build:build, find:find, near:near, distToLine:distToLine, angle:angle, load:load, active:active, setRules:setRules, violates:violates, meter:meter, bearing:bearing };
})();
if (typeof module !== 'undefined') module.exports = GomiRoute;
