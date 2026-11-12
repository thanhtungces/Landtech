/*
 * Tự khép ranh: ghép các đoạn ranh rời (line, line string) thành thửa khép kín.
 * Các bước: gộp đỉnh gần nhau (dung sai) → cắt nhau tại giao điểm và chỗ chạm chữ T
 * → bỏ đoạn thừa (đầu treo) → dò từng mặt kín của mạng lưới.
 * Tung_LandTech – © Nguyễn Thanh Tùng
 */
(function (global) {
  'use strict';

  /**
   * features: [{kind, pts, holes, props}]; use(f) -> true nếu lấy đối tượng làm ranh; tol: dung sai (đơn vị tọa độ, thường là m)
   * Trả về { polys: [{ring:[[x,y]...], holes:[[...]]}], stats }
   */
  function run(features, use, tol) {
    tol = tol > 0 ? tol : 0.1;
    const t0 = performance.now();
    // ---- 1. Đỉnh (gộp các đỉnh cách nhau < tol) ----
    const NX = [], NY = [];
    const ncell = new Map();
    const ck = (i, j) => i + ',' + j;
    function node(x, y) {
      const i = Math.floor(x / tol), j = Math.floor(y / tol);
      let best = -1, bd = tol * tol;
      for (let a = i - 1; a <= i + 1; a++) for (let b = j - 1; b <= j + 1; b++) {
        const c = ncell.get(ck(a, b)); if (!c) continue;
        for (const n of c) { const dx = NX[n] - x, dy = NY[n] - y, d = dx * dx + dy * dy; if (d <= bd) { bd = d; best = n; } }
      }
      if (best >= 0) return best;
      const id = NX.length; NX.push(x); NY.push(y);
      const k = ck(i, j); (ncell.get(k) || ncell.set(k, []).get(k)).push(id);
      return id;
    }
    // ---- 2. Đoạn thẳng ----
    const SA = [], SB = [];
    for (const f of features) {
      if (!f || (f.kind !== 'line' && f.kind !== 'polygon') || !f.pts || f.pts.length < 2 || !use(f)) continue;
      const rings = [f.pts].concat(f.kind === 'polygon' && f.holes ? f.holes : []);
      for (const r of rings) {
        let prev = -1, first = -1;
        for (const p of r) {
          if (!isFinite(p[0]) || !isFinite(p[1])) { prev = -1; continue; }
          const n = node(p[0], p[1]);
          if (first < 0) first = n;
          if (prev >= 0 && prev !== n) { SA.push(prev); SB.push(n); }
          prev = n;
        }
        if (f.kind === 'polygon' && prev >= 0 && first >= 0 && prev !== first) { SA.push(prev); SB.push(first); }
      }
    }
    const nSeg = SA.length;
    const stats = { segments: nSeg, nodes: 0, crossings: 0, snaps: 0, dangles: 0, parcels: 0, ms: 0 };
    if (!nSeg) { stats.ms = Math.round(performance.now() - t0); return { polys: [], stats }; }

    // ---- 3. Cắt nhau: lưới không gian cho đoạn thẳng ----
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity, sumL = 0;
    for (let s = 0; s < nSeg; s++) {
      const ax = NX[SA[s]], ay = NY[SA[s]], bx = NX[SB[s]], by = NY[SB[s]];
      gx0 = Math.min(gx0, ax, bx); gy0 = Math.min(gy0, ay, by); gx1 = Math.max(gx1, ax, bx); gy1 = Math.max(gy1, ay, by);
      sumL += Math.hypot(bx - ax, by - ay);
    }
    let cs = Math.max(tol * 4, sumL / nSeg * 1.5);
    // tránh lưới quá dày
    while (((gx1 - gx0) / cs) * ((gy1 - gy0) / cs) > 4e6) cs *= 2;
    const scell = new Map();
    const cx = (x) => Math.floor((x - gx0) / cs), cy = (y) => Math.floor((y - gy0) / cs);
    for (let s = 0; s < nSeg; s++) {
      const ax = NX[SA[s]], ay = NY[SA[s]], bx = NX[SB[s]], by = NY[SB[s]];
      const i0 = cx(Math.min(ax, bx) - tol), i1 = cx(Math.max(ax, bx) + tol), j0 = cy(Math.min(ay, by) - tol), j1 = cy(Math.max(ay, by) + tol);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = ck(i, j); (scell.get(k) || scell.set(k, []).get(k)).push(s); }
    }
    const splits = new Array(nSeg); // [[t, node], ...]
    const addSplit = (s, t, n) => { if (n === SA[s] || n === SB[s]) return; (splits[s] || (splits[s] = [])).push([t, n]); };
    // điểm n nằm sát đoạn s (chạm chữ T / hở nhỏ)
    function touch(s, n) {
      if (n === SA[s] || n === SB[s]) return;
      const ax = NX[SA[s]], ay = NY[SA[s]], dx = NX[SB[s]] - ax, dy = NY[SB[s]] - ay, l2 = dx * dx + dy * dy;
      if (!l2) return;
      const t = ((NX[n] - ax) * dx + (NY[n] - ay) * dy) / l2;
      if (t <= 0 || t >= 1) return;
      const px = ax + t * dx - NX[n], py = ay + t * dy - NY[n];
      if (px * px + py * py > tol * tol) return;
      addSplit(s, t, n); stats.snaps++;
    }
    for (const [k, list] of scell) {
      if (list.length < 2) continue;
      const ci = +k.slice(0, k.indexOf(',')), cj = +k.slice(k.indexOf(',') + 1);
      for (let a = 0; a < list.length; a++) {
        const s = list[a];
        const sa = SA[s], sb = SB[s];
        const ax = NX[sa], ay = NY[sa], bx = NX[sb], by = NY[sb];
        const sx0 = Math.min(ax, bx) - tol, sy0 = Math.min(ay, by) - tol, sx1 = Math.max(ax, bx) + tol, sy1 = Math.max(ay, by) + tol;
        for (let b = a + 1; b < list.length; b++) {
          const u = list[b];
          const ua = SA[u], ub = SB[u];
          const qx = NX[ua], qy = NY[ua], rx = NX[ub], ry = NY[ub];
          const ux0 = Math.min(qx, rx) - tol, uy0 = Math.min(qy, ry) - tol, ux1 = Math.max(qx, rx) + tol, uy1 = Math.max(qy, ry) + tol;
          if (ux0 > sx1 || ux1 < sx0 || uy0 > sy1 || uy1 < sy0) continue;
          // chỉ xét cặp ở ô đầu tiên chung của hai khung (tránh xét lặp)
          if (cx(Math.max(sx0, ux0)) !== ci || cy(Math.max(sy0, uy0)) !== cj) continue;
          touch(s, ua); touch(s, ub); touch(u, sa); touch(u, sb);
          if (sa === ua || sa === ub || sb === ua || sb === ub) continue;
          // cắt nhau thực sự
          const ex = bx - ax, ey = by - ay, fx = rx - qx, fy = ry - qy;
          const den = ex * fy - ey * fx;
          if (Math.abs(den) < 1e-12 * (ex * ex + ey * ey + fx * fx + fy * fy)) continue;
          const t = ((qx - ax) * fy - (qy - ay) * fx) / den, v = ((qx - ax) * ey - (qy - ay) * ex) / den;
          if (t <= 0 || t >= 1 || v <= 0 || v >= 1) continue;
          const n = node(ax + t * ex, ay + t * ey);
          addSplit(s, t, n); addSplit(u, v, n); stats.crossings++;
        }
      }
    }
    // ---- 4. Cạnh sau khi cắt (bỏ trùng) ----
    const EA = [], EB = [], seen = new Set();
    const pushEdge = (a, b) => {
      if (a === b) return;
      const k = a < b ? a * 1e7 + b : b * 1e7 + a;
      if (seen.has(k)) return; seen.add(k); EA.push(a); EB.push(b);
    };
    for (let s = 0; s < nSeg; s++) {
      const sp = splits[s];
      if (!sp) { pushEdge(SA[s], SB[s]); continue; }
      sp.sort((p, q) => p[0] - q[0]);
      let prev = SA[s];
      for (const [, n] of sp) { pushEdge(prev, n); prev = n; }
      pushEdge(prev, SB[s]);
    }
    const nN = NX.length, nE = EA.length;
    stats.nodes = nN;
    // ---- 5. Bỏ đoạn thừa (đầu treo) ----
    const inc = Array.from({ length: nN }, () => []);
    for (let e = 0; e < nE; e++) { inc[EA[e]].push(e); inc[EB[e]].push(e); }
    const alive = new Uint8Array(nE).fill(1), deg = new Int32Array(nN);
    for (let n = 0; n < nN; n++) deg[n] = inc[n].length;
    const q = [];
    for (let n = 0; n < nN; n++) if (deg[n] === 1) q.push(n);
    while (q.length) {
      const n = q.pop();
      if (deg[n] !== 1) continue;
      for (const e of inc[n]) {
        if (!alive[e]) continue;
        alive[e] = 0; stats.dangles++;
        const o = EA[e] === n ? EB[e] : EA[e];
        deg[n]--; deg[o]--;
        if (deg[o] === 1) q.push(o);
        break;
      }
    }
    // ---- 6. Nửa cạnh, sắp theo góc tại mỗi đỉnh ----
    const out = Array.from({ length: nN }, () => []);
    for (let e = 0; e < nE; e++) if (alive[e]) { out[EA[e]].push(2 * e); out[EB[e]].push(2 * e + 1); }
    const org = (h) => (h & 1) ? EB[h >> 1] : EA[h >> 1];
    const dst = (h) => (h & 1) ? EA[h >> 1] : EB[h >> 1];
    const pos = new Int32Array(2 * nE);
    for (let n = 0; n < nN; n++) {
      const l = out[n]; if (l.length < 2) continue;
      const ang = new Map(l.map(h => [h, Math.atan2(NY[dst(h)] - NY[n], NX[dst(h)] - NX[n])]));
      l.sort((a, b) => ang.get(a) - ang.get(b));
      l.forEach((h, k) => { pos[h] = k; });
    }
    // ---- 7. Dò mặt kín ----
    const visited = new Uint8Array(2 * nE);
    const ox = gx0, oy = gy0; // gốc tạm để tính diện tích chính xác
    const faces = [];
    for (let e = 0; e < nE; e++) {
      if (!alive[e]) continue;
      for (const h0 of [2 * e, 2 * e + 1]) {
        if (visited[h0]) continue;
        const ring = [];
        let h = h0, area = 0, guard = 0, ok = true;
        do {
          visited[h] = 1;
          const a = org(h), b = dst(h);
          ring.push(a);
          area += (NX[a] - ox) * (NY[b] - oy) - (NX[b] - ox) * (NY[a] - oy);
          const l = out[b], m = l.length;
          h = l[(pos[h ^ 1] - 1 + m) % m];
          if (++guard > 500000) { ok = false; break; }
        } while (h !== h0);
        if (!ok || ring.length < 3) continue;
        faces.push({ ring, area: area / 2 });
      }
    }
    // ---- 8. Thửa (mặt dương) + lỗ (biên ngoài của cụm nằm trong thửa) ----
    const comp = new Int32Array(nN).fill(-1);
    for (let n = 0; n < nN; n++) {
      if (comp[n] >= 0 || !out[n].length) continue;
      const st = [n]; comp[n] = n;
      while (st.length) { const v = st.pop(); for (const h of out[v]) { const w = dst(h); if (comp[w] < 0) { comp[w] = n; st.push(w); } } }
    }
    const minA = Math.max(tol * tol, 0.01);
    const bbox = (r) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const n of r) { if (NX[n] < x0) x0 = NX[n]; if (NX[n] > x1) x1 = NX[n]; if (NY[n] < y0) y0 = NY[n]; if (NY[n] > y1) y1 = NY[n]; } return [x0, y0, x1, y1]; };
    const pos_ = faces.filter(f => f.area > minA);
    pos_.forEach(f => { f.bb = bbox(f.ring); f.holes = []; f.comp = comp[f.ring[0]]; });
    const inRing = (r, x, y) => { let ins = false; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const ax = NX[r[a]], ay = NY[r[a]], bx = NX[r[b]], by = NY[r[b]]; if (((ay > y) !== (by > y)) && (x < (bx - ax) * (y - ay) / (by - ay) + ax)) ins = !ins; } return ins; };
    for (const f of faces) {
      if (f.area >= -minA) continue;
      const c = comp[f.ring[0]], x = NX[f.ring[0]], y = NY[f.ring[0]];
      let best = null;
      for (const p of pos_) {
        if (p.comp === c || x < p.bb[0] || x > p.bb[2] || y < p.bb[1] || y > p.bb[3]) continue;
        if (best && p.area >= best.area) continue;
        if (inRing(p.ring, x, y)) best = p;
      }
      if (best) best.holes.push(f.ring.slice().reverse());
    }
    const toXY = (r) => r.map(n => [NX[n], NY[n]]);
    const polys = pos_.map(f => ({ ring: toXY(f.ring), holes: f.holes.map(toXY), area: f.area }));
    stats.parcels = polys.length;
    stats.ms = Math.round(performance.now() - t0);
    return { polys, stats };
  }

  global.Polygonize = { run };
})(window);
