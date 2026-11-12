/*
 * Lớp vẽ nhanh bằng 1 canvas duy nhất + chỉ mục lưới không gian.
 * Thay cho việc tạo hàng trăm nghìn đối tượng Leaflet riêng lẻ: nạp nhanh, kéo/zoom mượt,
 * bật/tắt Layer/Level tức thì (không phải chiếu lại tọa độ).
 * Tung_LandTech – © Nguyễn Thanh Tùng
 */
(function () {
  'use strict';
  const R = 6378137, D2R = Math.PI / 180;
  const mercX = (lng) => R * lng * D2R;
  const mercY = (lat) => R * Math.log(Math.tan(Math.PI / 4 + lat * D2R / 2));
  const unX = (x) => x / R / D2R;
  const unY = (y) => (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / D2R;

  /**
   * Chuẩn bị dữ liệu.
   * features: [{kind, pts, holes, props}]; P: pt -> [lat,lng]; opt.colorOf(f) ; opt.lidOf(f)
   */
  function prepare(features, P, opt) {
    opt = opt || {};
    const n = features.length;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const f = features[i];
      if (f.kind === 'text') continue;
      total += f.pts.length;
      if (f.holes) for (const h of f.holes) total += h.length;
    }
    const mx = new Float64Array(total), my = new Float64Array(total);
    const fPart = new Int32Array(n + 1);
    const fBox = new Float64Array(n * 4);
    const fKind = new Uint8Array(n);   // 0 line, 1 polygon, 2 point, 3 bỏ qua
    const fStyle = new Uint16Array(n);
    const fLid = new Uint16Array(n);
    const parts = [];                  // [start, count]
    const styles = [], styleIdx = {};
    let w = 0, bad = 0;
    let latMin = 90, latMax = -90, lngMin = 180, lngMax = -180;
    function ring(pts) {
      const s = w;
      for (let i = 0; i < pts.length; i++) {
        const ll = P(pts[i]);
        if (!ll || !isFinite(ll[0]) || !isFinite(ll[1]) || Math.abs(ll[0]) > 85.05) continue;
        mx[w] = mercX(ll[1]); my[w] = mercY(ll[0]); w++;
        if (ll[0] < latMin) latMin = ll[0]; if (ll[0] > latMax) latMax = ll[0];
        if (ll[1] < lngMin) lngMin = ll[1]; if (ll[1] > lngMax) lngMax = ll[1];
      }
      return w - s;
    }
    for (let i = 0; i < n; i++) {
      const f = features[i];
      fPart[i] = parts.length;
      if (f.kind === 'text' || (opt.skip && opt.skip(f))) { fKind[i] = 3; continue; }
      const cv = (opt.colorOf && opt.colorOf(f)) || '#ffeb3b';
      const col = typeof cv === 'string' ? cv : cv.c, fill = typeof cv === 'string' ? '' : (cv.fill || '');
      const dash = f.props && f.props.style ? 1 : 0;
      const sk = col + '|' + dash + '|' + fill;
      let si = styleIdx[sk];
      if (si === undefined) { si = styles.length; styleIdx[sk] = si; styles.push({ color: col, dash, fill }); }
      fStyle[i] = si;
      fLid[i] = opt.lidOf ? opt.lidOf(f) : 0;
      const start0 = w;
      const c = ring(f.pts);
      if (!c) { fKind[i] = 3; bad++; continue; }
      parts.push([start0, c]);
      if (f.kind === 'polygon') {
        fKind[i] = 1;
        if (f.holes) for (const h of f.holes) { const s = w; const k = ring(h); if (k > 2) parts.push([s, k]); }
      } else fKind[i] = f.kind === 'point' ? 2 : 0;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = start0; k < start0 + c; k++) {
        if (mx[k] < x0) x0 = mx[k]; if (mx[k] > x1) x1 = mx[k];
        if (my[k] < y0) y0 = my[k]; if (my[k] > y1) y1 = my[k];
      }
      fBox[i * 4] = x0; fBox[i * 4 + 1] = y0; fBox[i * 4 + 2] = x1; fBox[i * 4 + 3] = y1;
    }
    fPart[n] = parts.length;
    const pStart = new Int32Array(parts.length + 1);
    parts.forEach((p, i) => { pStart[i] = p[0]; });
    pStart[parts.length] = w;
    const pLen = new Int32Array(parts.length);
    parts.forEach((p, i) => { pLen[i] = p[1]; });

    // Lưới không gian
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, cnt = 0;
    for (let i = 0; i < n; i++) {
      if (fKind[i] === 3) continue; cnt++;
      if (fBox[i * 4] < bx0) bx0 = fBox[i * 4]; if (fBox[i * 4 + 1] < by0) by0 = fBox[i * 4 + 1];
      if (fBox[i * 4 + 2] > bx1) bx1 = fBox[i * 4 + 2]; if (fBox[i * 4 + 3] > by1) by1 = fBox[i * 4 + 3];
    }
    const d = { n, mx, my, fPart, fBox, fKind, fStyle, fLid, styles, pStart, pLen, count: cnt, bad, grid: null,
      bounds: cnt ? L.latLngBounds([latMin, lngMin], [latMax, lngMax]) : null };
    if (cnt) {
      const gw = Math.max(bx1 - bx0, 1e-6), gh = Math.max(by1 - by0, 1e-6);
      const target = Math.max(1, cnt / 4);
      const nx = Math.min(256, Math.max(1, Math.round(Math.sqrt(target * gw / gh))));
      const ny = Math.min(256, Math.max(1, Math.round(Math.sqrt(target * gh / gw))));
      const cw = gw / nx * 1.000001, ch = gh / ny * 1.000001;
      const cells = new Array(nx * ny);
      const big = [];
      for (let i = 0; i < n; i++) {
        if (fKind[i] === 3) continue;
        const ix0 = Math.floor((fBox[i * 4] - bx0) / cw), ix1 = Math.floor((fBox[i * 4 + 2] - bx0) / cw);
        const iy0 = Math.floor((fBox[i * 4 + 1] - by0) / ch), iy1 = Math.floor((fBox[i * 4 + 3] - by0) / ch);
        if ((ix1 - ix0 + 1) * (iy1 - iy0 + 1) > 64) { big.push(i); continue; }
        for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) {
          const k = y * nx + x; (cells[k] || (cells[k] = [])).push(i);
        }
      }
      d.grid = { x0: bx0, y0: by0, cw, ch, nx, ny, cells, big };
    }
    d.stamp = new Int32Array(n);
    d.frame = 0;
    return d;
  }

  // Duyệt các đối tượng có thể nằm trong khung [x0,y0,x1,y1] (mét Mercator)
  function query(d, x0, y0, x1, y1, cb) {
    const g = d.grid; if (!g) return;
    d.frame++;
    const f = d.frame, st = d.stamp, fb = d.fBox;
    const visit = (i) => {
      if (st[i] === f) return; st[i] = f;
      if (fb[i * 4] > x1 || fb[i * 4 + 2] < x0 || fb[i * 4 + 1] > y1 || fb[i * 4 + 3] < y0) return;
      cb(i);
    };
    for (const i of g.big) visit(i);
    const ix0 = Math.max(0, Math.floor((x0 - g.x0) / g.cw)), ix1 = Math.min(g.nx - 1, Math.floor((x1 - g.x0) / g.cw));
    const iy0 = Math.max(0, Math.floor((y0 - g.y0) / g.ch)), iy1 = Math.min(g.ny - 1, Math.floor((y1 - g.y0) / g.ch));
    for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) {
      const c = g.cells[y * g.nx + x];
      if (c) for (let k = 0; k < c.length; k++) visit(c[k]);
    }
  }

  L.FastLayer = L.Layer.extend({
    initialize: function (opts) {
      L.setOptions(this, opts);
      this.d = null; this.hiddenLid = null; this.sel = null; this.weight = 1.5; this.fillOn = true;
    },
    setData: function (d) { this.d = d; this.redraw(); },
    setHiddenLids: function (set) { this.hiddenLid = set; this.redraw(); },
    setWeight: function (w) { this.weight = w; this.redraw(); },
    setSelection: function (arr) { this.sel = arr && arr.length ? arr : null; this.redraw(); },
    getBounds: function () { return this.d && this.d.bounds; },
    onAdd: function (map) {
      if (!map.getPane('fastPane')) { const p = map.createPane('fastPane'); p.style.zIndex = 420; p.style.pointerEvents = 'none'; }
      this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide');
      map.getPane('fastPane').appendChild(this._canvas);
      map.on('moveend zoomend resize viewreset', this._sched, this);
      map.on('move', this._onMove, this);
      this.redraw();
    },
    onRemove: function (map) {
      map.off('moveend zoomend resize viewreset', this._sched, this);
      map.off('move', this._onMove, this);
      L.DomUtil.remove(this._canvas);
      this._canvas = null;
    },
    _sched: function () {
      if (this._pending) return;
      this._pending = setTimeout(() => { this._pending = null; this.redraw(); }, 0);
    },
    _onMove: function () { // vẽ lại có giới hạn tần suất khi đang kéo
      const now = performance.now();
      if (now - (this._last || 0) < 90 || this._busy) return;
      this.redraw();
    },
    redraw: function () {
      const map = this._map, c = this._canvas;
      if (!map || !c) return;
      this._busy = true;
      const t0 = performance.now();
      const size = map.getSize(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const pad = Math.round(Math.max(size.x, size.y) * 0.25);
      const W = size.x + pad * 2, H = size.y + pad * 2;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      c.style.width = W + 'px'; c.style.height = H + 'px';
      L.DomUtil.setPosition(c, map.containerPointToLayerPoint([-pad, -pad]));
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const d = this.d;
      if (d && d.grid) {
        const tl = map.containerPointToLatLng([-pad, -pad]), br = map.containerPointToLatLng([size.x + pad, size.y + pad]);
        const X0 = mercX(tl.lng), Y1 = mercY(tl.lat), X1 = mercX(br.lng), Y0 = mercY(br.lat);
        const res = (X1 - X0) / W;      // mét Mercator / pixel
        const k = 1 / res;
        this._draw(ctx, d, X0, Y0, X1, Y1, k);
      }
      this._last = performance.now();
      this._busy = false;
      this._ms = this._last - t0;
    },
    _draw: function (ctx, d, X0, Y0, X1, Y1, k) {
      const hid = this.hiddenLid, ns = d.styles.length;
      const groups = new Array(ns);
      let count = 0;
      const minSize = 2.5 / k;
      query(d, X0, Y0, X1, Y1, (i) => {
        if (hid && hid.has(d.fLid[i])) return;
        const s = d.fStyle[i];
        (groups[s] || (groups[s] = [])).push(i);
        count++;
      });
      ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
      const mx = d.mx, my = d.my, pStart = d.pStart, pLen = d.pLen, fPart = d.fPart, fBox = d.fBox, fKind = d.fKind;
      const w = this.weight;
      const trace = (ctx, p) => {
        const s = pStart[p], n = pLen[p];
        let lx = (mx[s] - X0) * k, ly = (Y1 - my[s]) * k;
        ctx.moveTo(lx, ly);
        for (let j = 1; j < n; j++) {
          const x = (mx[s + j] - X0) * k, y = (Y1 - my[s + j]) * k;
          if (Math.abs(x - lx) >= 0.6 || Math.abs(y - ly) >= 0.6 || j === n - 1) { ctx.lineTo(x, y); lx = x; ly = y; }
        }
      };
      // vẽ nền màu loại đất trước, nét ranh (Level 10…) sau để nét không bị màu nền che mờ
      const order = [];
      for (let si = 0; si < ns; si++) if (d.styles[si].fill) order.push(si);
      for (let si = 0; si < ns; si++) if (!d.styles[si].fill) order.push(si);
      for (const si of order) {
        const g = groups[si]; if (!g) continue;
        const st = d.styles[si];
        if (st.color === 'transparent' && !st.fill) continue; // thửa tự khép: không vẽ nét, chỉ để chạm chọn (có thể tô màu loại đất)
        ctx.strokeStyle = st.color; ctx.fillStyle = st.color; ctx.lineWidth = w;
        ctx.setLineDash(st.dash ? [6, 4] : []);
        // đối tượng nhỏ hơn 1px -> chấm
        ctx.beginPath();
        let polyN = 0, lineN = 0;
        const polys = [], lines = [], pts = [];
        for (let a = 0; a < g.length; a++) {
          const i = g[a];
          const kind = fKind[i];
          if (kind === 2) { pts.push(i); continue; }
          const bw = fBox[i * 4 + 2] - fBox[i * 4], bh = fBox[i * 4 + 3] - fBox[i * 4 + 1];
          if (bw < minSize && bh < minSize) {
            ctx.rect((fBox[i * 4] - X0) * k, (Y1 - fBox[i * 4 + 3]) * k, 2, 2); continue;
          }
          (kind === 1 ? polys : lines).push(i);
        }
        ctx.fill();
        const CH = 1500;
        if (polys.length) {
          const doFill = this.fillOn && (st.fill ? polys.length < 60000 && this.fillAlpha !== 0 : polys.length < 8000);
          for (let c0 = 0; c0 < polys.length; c0 += CH) {
            ctx.beginPath();
            const e = Math.min(polys.length, c0 + CH);
            for (let a = c0; a < e; a++) { const i = polys[a]; for (let p = fPart[i]; p < fPart[i + 1]; p++) { trace(ctx, p); ctx.closePath(); } }
            if (doFill) {
              // tô màu loại đất (theo bảng màu Thông tư) hoặc phủ mờ màu nét
              if (st.fill) { ctx.fillStyle = st.fill; ctx.globalAlpha = this.fillAlpha != null ? this.fillAlpha : 0.55; } else ctx.globalAlpha = 0.07;
              ctx.fill('evenodd'); ctx.globalAlpha = 1; ctx.fillStyle = st.color;
            }
            ctx.stroke();
          }
        }
        if (lines.length) {
          for (let c0 = 0; c0 < lines.length; c0 += CH) {
            ctx.beginPath();
            const e = Math.min(lines.length, c0 + CH);
            for (let a = c0; a < e; a++) trace(ctx, fPart[lines[a]]);
            ctx.stroke();
          }
        }
        if (pts.length) {
          ctx.setLineDash([]);
          ctx.beginPath();
          for (const i of pts) { const x = (mx[pStart[fPart[i]]] - X0) * k, y = (Y1 - my[pStart[fPart[i]]]) * k; ctx.moveTo(x + 3, y); ctx.arc(x, y, 3, 0, 6.2832); }
          ctx.fill();
        }
      }
      // đối tượng đang chọn
      if (this.sel) {
        ctx.setLineDash([]);
        ctx.lineWidth = 2; ctx.strokeStyle = '#ff1744'; ctx.fillStyle = 'rgba(255,23,68,.08)'; ctx.lineJoin = 'round';
        for (const i of this.sel) {
          if (i < 0 || i >= d.n || fKind[i] === 3) continue;
          ctx.beginPath();
          if (fKind[i] === 2) { const p = pStart[fPart[i]]; const x = (mx[p] - X0) * k, y = (Y1 - my[p]) * k; ctx.arc(x, y, 7, 0, 6.2832); ctx.fill(); ctx.stroke(); continue; }
          for (let p = fPart[i]; p < fPart[i + 1]; p++) { trace(ctx, p); if (fKind[i] === 1) ctx.closePath(); }
          if (fKind[i] === 1) ctx.fill('evenodd');
          ctx.stroke();
        }
      }
    },

    /** Tìm đối tượng tại điểm chạm. Trả về chỉ số hoặc -1. */
    hit: function (latlng, tolPx) {
      const d = this.d, map = this._map;
      if (!d || !d.grid) return -1;
      const z = map.getZoom();
      const res = 40075016.686 / (256 * Math.pow(2, z));
      const tol = (tolPx || 10) * res;
      const x = mercX(latlng.lng), y = mercY(latlng.lat);
      const hid = this.hiddenLid;
      let bestLine = -1, bestLd = Infinity, bestPoly = -1, bestArea = Infinity;
      const mx = d.mx, my = d.my;
      query(d, x - tol, y - tol, x + tol, y + tol, (i) => {
        if (hid && hid.has(d.fLid[i])) return;
        const kind = d.fKind[i];
        if (kind === 2) {
          const s = d.pStart[d.fPart[i]];
          const dd = Math.hypot(mx[s] - x, my[s] - y);
          if (dd < tol * 1.2 && dd < bestLd) { bestLd = dd; bestLine = i; }
          return;
        }
        let inside = false, minD = Infinity;
        for (let p = d.fPart[i]; p < d.fPart[i + 1]; p++) {
          const s = d.pStart[p], n = d.pLen[p];
          let ins = false;
          for (let a = 0, b = n - 1; a < n; b = a++) {
            const ax = mx[s + a], ay = my[s + a], bx = mx[s + b], by = my[s + b];
            if (kind === 1 && ((ay > y) !== (by > y)) && (x < (bx - ax) * (y - ay) / (by - ay) + ax)) ins = !ins;
            if (a > 0 || kind === 1) {
              const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
              let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
              const dist = Math.hypot(ax + t * dx - x, ay + t * dy - y);
              if (dist < minD) minD = dist;
            }
          }
          if (ins) inside = !inside;
        }
        if (kind === 1 && inside && !(this.edgeOnlyLid && this.edgeOnlyLid.has(d.fLid[i]))) {
          const area = (d.fBox[i * 4 + 2] - d.fBox[i * 4]) * (d.fBox[i * 4 + 3] - d.fBox[i * 4 + 1]) * (this.preferLid && this.preferLid.has(d.fLid[i]) ? 0.97 : 1);
          if (area < bestArea) { bestArea = area; bestPoly = i; }
        }
        if (minD < tol && minD < bestLd) { bestLd = minD; bestLine = i; }
      });
      if (bestLine >= 0 && bestLd < tol * 0.45) return bestLine;
      if (bestPoly >= 0) return bestPoly;
      return bestLine;
    }
  });

  /** Đổi màu/nét mà không phải chiếu lại tọa độ. */
  function restyle(d, features, colorOf) {
    const styles = [], idx = {};
    for (let i = 0; i < d.n; i++) {
      if (d.fKind[i] === 3) continue;
      const f = features[i];
      const cv = (colorOf && colorOf(f)) || '#ffeb3b';
      const col = typeof cv === 'string' ? cv : cv.c, fill = typeof cv === 'string' ? '' : (cv.fill || '');
      const dash = f.props && f.props.style ? 1 : 0;
      const k = col + '|' + dash + '|' + fill;
      let si = idx[k];
      if (si === undefined) { si = styles.length; idx[k] = si; styles.push({ color: col, dash, fill }); }
      d.fStyle[i] = si;
    }
    d.styles = styles;
  }

  L.FastLayer.prepare = prepare;
  L.FastLayer.restyle = restyle;
  L.FastLayer.mercX = mercX; L.FastLayer.mercY = mercY; L.FastLayer.unX = unX; L.FastLayer.unY = unY;
})();
