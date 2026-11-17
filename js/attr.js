/*
 * Bảng thuộc tính (xem/sửa), tra cứu tờ – thửa – chủ, bảng tọa độ thửa đất, xuất CAD cắm mốc.
 * Tung_LandTech – © Nguyễn Thanh Tùng
 */
(function (global) {
  'use strict';
  let C = null; // ngữ cảnh do app.js cấp
  const INTERNAL = ['color', 'style', 'align', 'etype'];
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
  const key = (s) => norm(s).replace(/[^a-z0-9]/g, '');

  const GUESS = {
    to: ['shbando', 'sobando', 'soto', 'to', 'tobd', 'tobando', 'shto', 'mato', 'sheet', 'sheetno', 'sobd', 'sbd', 'shtobd', 'sotobd'],
    thua: ['shthua', 'sothua', 'thua', 'sothututhua', 'shtd', 'sotd', 'sht', 'lot', 'parcel', 'parcelno', 'sothututhuadat', 'thuadat', 'stt'],
    chu: ['tenchu', 'chusd', 'tenchusd', 'chu', 'chusudung', 'hoten', 'tennguoi', 'nguoisd', 'nguoisudung', 'owner', 'ownername', 'tenchusdd', 'tench', 'tenchu1', 'tennguoisd', 'tenchusudung'],
    loai: ['loaidat', 'khloaidat', 'mdsd', 'mucdichsudung', 'kyhieumdsd', 'loaidatht', 'ldd', 'landuse', 'mldd', 'maloaidat', 'kyhieuloaidat'],
    dt: ['dientich', 'dtpl', 'dientichphaply', 'dt', 'area', 'dientichtt', 'shapearea', 'dientichht', 'dientichthuc']
  };

  function init(ctx) { C = ctx; }

  // ---------- Tiện ích dữ liệu ----------
  function recordsOf(Ly, polyOnly) {
    if (Ly._recs && Ly._recsPoly === !!polyOnly && Ly._recsN === Ly.features.length) return Ly._recs;
    const out = [], seen = new Map();
    Ly.features.forEach((f, i) => {
      if (f.kind === 'text') return;
      if (polyOnly && f.kind !== 'polygon') return;
      if (f.rid != null) {
        const k = f.rid;
        if (seen.has(k)) { seen.get(k).fi.push(i); return; }
        const r = { fi: [i], first: i }; seen.set(k, r); out.push(r);
      } else out.push({ fi: [i], first: i });
    });
    Ly._recs = out; Ly._recsPoly = !!polyOnly; Ly._recsN = Ly.features.length;
    return out;
  }
  function fieldsOf(Ly) {
    if (Ly._fields) return Ly._fields.filter(k => k !== 'layer' || Ly.isCad);
    const set = [], seen = new Set();
    const lim = Math.min(Ly.features.length, 3000);
    for (let i = 0; i < Ly.features.length; i++) {
      const f = Ly.features[i];
      if (f.kind === 'text' || !f.props) continue;
      if (i > lim && seen.size) break;
      for (const k of Object.keys(f.props)) if (!seen.has(k) && !INTERNAL.includes(k)) { seen.add(k); set.push(k); }
    }
    Ly._fields = set;
    return set.filter(k => k !== 'layer' || Ly.isCad);
  }
  function guessFields(Ly) {
    if (Ly._guess) return Ly._guess;
    const fs = fieldsOf(Ly), g = {};
    for (const name of Object.keys(GUESS)) {
      g[name] = fs.find(f => GUESS[name].includes(key(f))) || '';
    }
    if (!g.chu) g.chu = fs.find(f => /chu|owner|hoten/.test(key(f))) || '';
    if (!g.thua) g.thua = fs.find(f => /thua|parcel/.test(key(f))) || '';
    if (!g.to) g.to = fs.find(f => /bando|^to$|sheet/.test(key(f))) || '';
    if (!g.loai) g.loai = fs.find(f => /loaidat|mdsd|landuse/.test(key(f))) || '';
    Ly._guess = g;
    return g;
  }

  // ---------- Ghép nhãn CAD (số thửa, diện tích, loại đất) vào thửa ----------
  function joinCadLabels(Ly) {
    if (Ly._joined) return;
    Ly._joined = true;
    const polys = [];
    Ly.features.forEach((f, i) => { if (f.kind === 'polygon' && f.pts.length >= 3) polys.push(i); });
    if (!polys.length) return;
    const bb = polys.map(i => { let x0 = 1e300, y0 = 1e300, x1 = -1e300, y1 = -1e300; for (const p of Ly.features[i].pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; });
    let gx0 = 1e300, gy0 = 1e300, gx1 = -1e300, gy1 = -1e300, area = 0;
    bb.forEach(b => { gx0 = Math.min(gx0, b[0]); gy0 = Math.min(gy0, b[1]); gx1 = Math.max(gx1, b[2]); gy1 = Math.max(gy1, b[3]); area += (b[2] - b[0]) * (b[3] - b[1]); });
    const cs = Math.max(Math.sqrt(area / polys.length) * 2, 1e-9);
    const nx = Math.max(1, Math.min(512, Math.ceil((gx1 - gx0) / cs))), ny = Math.max(1, Math.min(512, Math.ceil((gy1 - gy0) / cs)));
    const cw = (gx1 - gx0) / nx || 1, ch = (gy1 - gy0) / ny || 1;
    const cells = new Map();
    bb.forEach((b, k) => {
      const ix0 = Math.min(nx - 1, Math.floor((b[0] - gx0) / cw)), ix1 = Math.min(nx - 1, Math.floor((b[2] - gx0) / cw));
      const iy0 = Math.min(ny - 1, Math.floor((b[1] - gy0) / ch)), iy1 = Math.min(ny - 1, Math.floor((b[3] - gy0) / ch));
      if ((ix1 - ix0 + 1) * (iy1 - iy0 + 1) > 400) return;
      for (let y = iy0; y <= iy1; y++) for (let x = ix0; x <= ix1; x++) { const c = y * nx + x; (cells.get(c) || cells.set(c, []).get(c)).push(k); }
    });
    const inRing = (r, x, y) => { let ins = false; for (let a = 0, b = r.length - 1; a < r.length; b = a++) { const ax = r[a][0], ay = r[a][1], bx = r[b][0], by = r[b][1]; if (((ay > y) !== (by > y)) && (x < (bx - ax) * (y - ay) / (by - ay) + ax)) ins = !ins; } return ins; };
    let joined = 0;
    const nums = new Map();
    // Level quy ước: 3, 13 = số thửa; 2, 5 = loại đất; 4 = diện tích pháp lý.
    // File nào có chữ trên các Level này thì chỉ lấy từ đó (không đoán theo dạng chữ nữa).
    const LV = { SO_THUA: ['3', '13'], LOAI_DAT: ['2', '5'], DIEN_TICH: ['4'] };
    const lvOf = (t) => t.props && t.props.layer != null ? String(t.props.layer).replace(/^\s*level\s*/i, '').trim() : '';
    const has = {};
    for (const t of Ly.features) if (t.kind === 'text') { const l = lvOf(t); for (const k in LV) if (LV[k].includes(l)) has[k] = (has[k] || 0) + 1; }
    for (const t of Ly.features) {
      if (t.kind !== 'text' || !t.text) continue;
      const x = t.pts[0][0], y = t.pts[0][1];
      if (x < gx0 || x > gx1 || y < gy0 || y > gy1) continue;
      const cand = cells.get(Math.min(ny - 1, Math.floor((y - gy0) / ch)) * nx + Math.min(nx - 1, Math.floor((x - gx0) / cw)));
      if (!cand) continue;
      let best = -1, bestA = Infinity;
      for (const k of cand) {
        const b = bb[k]; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
        const f = Ly.features[polys[k]];
        if (!inRing(f.pts, x, y)) continue;
        if (f.holes && f.holes.some(h => inRing(h, x, y))) continue;
        const a = (b[2] - b[0]) * (b[3] - b[1]) * (f.auto ? 1 : 1e9); // ưu tiên thửa tự khép
        if (a < bestA) { bestA = a; best = k; }
      }
      if (best < 0) continue;
      const f = Ly.features[polys[best]];
      const txt = String(t.text).replace(/[\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
      const lvn = lvOf(t);
      let field = '';
      for (const k in LV) if (LV[k].includes(lvn)) field = k;
      if (!field) {
        if (/^\d{1,5}$/.test(txt)) field = 'SO_THUA';
        else if (/^\d+[.,]\d+$/.test(txt)) field = 'DIEN_TICH';
        else if (/^[A-ZĐ]{2,5}(\+[A-ZĐ]{2,5})*$/.test(txt)) field = 'LOAI_DAT';
        if (field && has[field] >= 5) field = '';
      }
      if (!field) continue;
      f.props = f.props || {};
      if (field === 'SO_THUA') { (nums.get(f) || nums.set(f, []).get(f)).push({ txt, x, y, h: +t.h || 0 }); continue; }
      if (f.props[field] == null || f.props[field] === '') { f.props[field] = txt; joined++; }
    }
    // Số nguyên trong thửa: 1 số = số thửa; 2 số xếp chồng sát nhau = số tờ (trên) + số thửa (dưới)
    for (const [f, list] of nums) {
      const uniq = list.filter((v, k) => list.findIndex(w => w.txt === v.txt) === k);
      if (uniq.length === 2) {
        const [u, d] = uniq[0].y >= uniq[1].y ? uniq : [uniq[1], uniq[0]];
        const h = Math.max(u.h, d.h) || Math.abs(u.y - d.y);
        if (u.y - d.y > 0 && u.y - d.y <= h * 4 && Math.abs(u.x - d.x) <= h * 4) { f.props.SO_TO = u.txt; f.props.SO_THUA = d.txt; joined++; continue; }
      }
      f.props.SO_THUA = uniq.map(v => v.txt).join(' '); joined++;
    }
    // Hình bao nhiều số thửa (khung bản đồ, địa giới…) không phải là thửa: bỏ nhãn đã ghép
    for (const i of polys) {
      const p = Ly.features[i].props;
      if (p && p.SO_THUA && String(p.SO_THUA).split(' ').length >= 3) { delete p.SO_THUA; delete p.SO_TO; delete p.DIEN_TICH; delete p.LOAI_DAT; joined--; }
    }
    Ly._fields = null; Ly._guess = null; Ly._recs = null;
    Ly.joinedCount = joined;
  }

  function prepareForSearch(Ly) {
    if (Ly.isCad) joinCadLabels(Ly);
  }

  // ---------- Tọa độ VN-2000 ----------
  function usesRawVN(Ly) { return Ly.crs && Ly.crs.mode === 'vn3'; }
  function vnLon0(Ly) { return usesRawVN(Ly) ? Ly.crs.lon0 : C.S.lon0; }
  function toVN(Ly, p) {
    if (usesRawVN(Ly)) return Ly.crs.swap ? { E: p[1], N: p[0] } : { E: p[0], N: p[1] };
    const ll = Ly.P(p);
    return CRS.toVN2000(ll[0], ll[1], C.S.lon0);
  }
  function stripClose(r) {
    if (r.length > 2 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) return r.slice(0, -1);
    return r;
  }
  function vnRings(Ly, f) {
    const conv = (r) => stripClose(r).map(p => toVN(Ly, p));
    return { outer: conv(f.pts), holes: (f.holes || []).map(conv) };
  }
  function ringArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.E * q.N - q.E * p.N; } return Math.abs(a) / 2; }
  function ringPer(r, closed) { let l = 0; for (let i = 0; i < r.length - (closed ? 0 : 1); i++) { const p = r[i], q = r[(i + 1) % r.length]; l += Math.hypot(q.E - p.E, q.N - p.N); } return l; }
  function areaOf(rg) { let a = ringArea(rg.outer); rg.holes.forEach(h => a -= ringArea(h)); return a; }

  function labelPoint(ring) { // điểm đặt nhãn nằm trong thửa
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; const f = p.E * q.N - q.E * p.N; a += f; cx += (p.E + q.E) * f; cy += (p.N + q.N) * f; }
    let c = a ? { E: cx / (3 * a), N: cy / (3 * a) } : { E: ring[0].E, N: ring[0].N };
    const inside = (x, y) => { let ins = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const A = ring[i], B = ring[j]; if (((A.N > y) !== (B.N > y)) && (x < (B.E - A.E) * (y - A.N) / (B.N - A.N) + A.E)) ins = !ins; } return ins; };
    if (inside(c.E, c.N)) return c;
    const xs = [];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const A = ring[i], B = ring[j]; if ((A.N > c.N) !== (B.N > c.N)) xs.push((B.E - A.E) * (c.N - A.N) / (B.N - A.N) + A.E); }
    xs.sort((m, n) => m - n);
    let bw = -1, bx = c.E;
    for (let k = 0; k + 1 < xs.length; k += 2) if (xs[k + 1] - xs[k] > bw) { bw = xs[k + 1] - xs[k]; bx = (xs[k] + xs[k + 1]) / 2; }
    return { E: bx, N: c.N };
  }

  function featLabel(Ly, f) {
    const g = guessFields(Ly), p = f.props || {};
    return { to: g.to ? p[g.to] : '', thua: g.thua ? p[g.thua] : '', chu: g.chu ? p[g.chu] : '', loai: g.loai ? p[g.loai] : '', dt: g.dt ? p[g.dt] : '' };
  }

  // ---------- Xuất DXF cắm mốc ----------
  function buildDxf(Ly, fis, opts) {
    opts = opts || {};
    const ents = [];
    const multi = fis.length > 1;
    const lon0 = vnLon0(Ly);
    const hText = opts.h || 1.0;
    for (const fi of fis) {
      const f = Ly.features[fi];
      if (f.kind === 'text') continue;
      const lb = featLabel(Ly, f);
      if (f.kind === 'polygon') {
        const rg = vnRings(Ly, f);
        const tag = lb.thua !== '' && lb.thua != null ? String(lb.thua) : String(fi + 1);
        const addRing = (r, hole) => {
          ents.push({ type: 'polyline', layer: 'L10_RANH_THUA', pts: r.map(p => [p.E, p.N]), closed: true });
          r.forEach((p, k) => {
            ents.push({ type: 'point', layer: 'MOC_CAM', p: [p.E, p.N] });
            ents.push({ type: 'text', layer: 'SO_MOC', p: [p.E + hText * 0.4, p.N + hText * 0.4], h: hText, text: multi ? tag + '.' + (k + 1) : String(k + 1) });
          });
        };
        addRing(rg.outer); rg.holes.forEach(h => addRing(h, true));
        if (opts.labels !== false) {
          const c = labelPoint(rg.outer);
          const dt = areaOf(rg);
          ents.push({ type: 'text', layer: 'L13_SO_THUA', p: [c.E, c.N + hText * 1.6], h: hText * 1.5, text: tag });
          ents.push({ type: 'text', layer: 'L04_DIEN_TICH', p: [c.E, c.N], h: hText * 1.2, text: dt.toFixed(1) });
          if (lb.loai) ents.push({ type: 'text', layer: 'L02_LOAI_DAT', p: [c.E, c.N - hText * 1.6], h: hText * 1.2, text: String(lb.loai).toUpperCase() });
        }
      } else if (f.kind === 'line') {
        ents.push({ type: 'polyline', layer: 'DUONG', pts: f.pts.map(p => { const v = toVN(Ly, p); return [v.E, v.N]; }), closed: false });
      } else {
        const v = toVN(Ly, f.pts[0]);
        ents.push({ type: 'point', layer: 'DIEM', p: [v.E, v.N] });
      }
    }
    return {
      lon0,
      text: Export.dxf({
        layers: [{ name: 'L10_RANH_THUA', color: 7 }, { name: 'L13_SO_THUA', color: 2 }, { name: 'L04_DIEN_TICH', color: 2 }, { name: 'L02_LOAI_DAT', color: 2 }, { name: 'MOC_CAM', color: 1 }, { name: 'SO_MOC', color: 3 }, { name: 'DUONG', color: 4 }, { name: 'DIEM', color: 1 }],
        entities: ents
      })
    };
  }

  function coordCsv(Ly, fis) {
    const rows = [['Thua', 'STT_moc', 'X_Bac(m)', 'Y_Dong(m)', 'Canh_toi_diem_ke(m)']];
    for (const fi of fis) {
      const f = Ly.features[fi];
      if (f.kind === 'text') continue;
      const lb = featLabel(Ly, f);
      const tag = lb.thua !== '' && lb.thua != null ? lb.thua : fi + 1;
      let ring;
      if (f.kind === 'polygon') ring = vnRings(Ly, f).outer; else ring = (f.kind === 'line' ? f.pts : [f.pts[0]]).map(p => toVN(Ly, p));
      ring.forEach((p, k) => {
        const q = ring[(k + 1) % ring.length];
        const d = f.kind === 'point' ? '' : (f.kind === 'line' && k === ring.length - 1 ? '' : Math.hypot(q.E - p.E, q.N - p.N).toFixed(2));
        rows.push([tag, k + 1, p.N.toFixed(3), p.E.toFixed(3), d]);
      });
    }
    return Export.csv(rows);
  }

  async function doSave(name, data, mime) {
    try {
      const msg = await Export.save(name, data, mime);
      C.toast(msg, false, 6000);
    } catch (e) { C.toast('Không lưu được: ' + e.message, true); }
  }
  const stamp = () => { const d = new Date(); const z = (n) => String(n).padStart(2, '0'); return d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes()); };
  const safeName = (s) => String(s).replace(/[^\w\-.]+/g, '_').slice(0, 40) || 'ban_do';

  // ---------- Bảng tọa độ thửa ----------
  function showCoords(Ly, fi) {
    prepareForSearch(Ly);
    const f = Ly.features[fi];
    if (!f) return;
    const box = document.createElement('div');
    const lb = featLabel(Ly, f);
    const lon0 = vnLon0(Ly);
    let html = '<div class="info"><b>' + C.esc(Ly.name) + '</b>' + (lb.thua !== '' && lb.thua != null ? ' · Thửa <b>' + C.esc(lb.thua) + '</b>' : '') + (lb.to !== '' && lb.to != null ? ' · Tờ <b>' + C.esc(lb.to) + '</b>' : '') +
      (lb.chu ? '<br>Chủ: ' + C.esc(lb.chu) : '') + '</div>';
    const tbl = (title, ring, closed) => {
      let t = '<div class="hint">' + title + '</div><div class="tw"><table class="grid"><tr><th>Mốc</th><th>X (Bắc) m</th><th>Y (Đông) m</th><th>Cạnh→ m</th></tr>';
      ring.forEach((p, k) => {
        const q = ring[(k + 1) % ring.length];
        const last = !closed && k === ring.length - 1;
        t += '<tr><td>' + (k + 1) + '</td><td>' + C.fmt(p.N, 3) + '</td><td>' + C.fmt(p.E, 3) + '</td><td>' + (last || f.kind === 'point' ? '' : C.fmt(Math.hypot(q.E - p.E, q.N - p.N), 2)) + '</td></tr>';
      });
      return t + '</table></div>';
    };
    if (f.kind === 'polygon') {
      const rg = vnRings(Ly, f);
      const a = areaOf(rg), per = ringPer(rg.outer, true);
      html += '<div class="info">Diện tích: <b class="big">' + C.fmt(a, 1) + ' m²</b> · Chu vi: ' + C.fmt(per, 2) + ' m · ' + rg.outer.length + ' mốc<br>VN-2000, KTT ' + CRS.fmtDeg(lon0) + ', múi 3°</div>';
      html += tbl('Ranh ngoài', rg.outer, true);
      rg.holes.forEach((h, k) => { html += tbl('Lỗ rỗng ' + (k + 1), h, true); });
    } else if (f.kind === 'line') {
      html += tbl('Các đỉnh', f.pts.map(p => toVN(Ly, p)), false);
    } else {
      html += tbl('Điểm', [toVN(Ly, f.pts[0])], false);
    }
    html += '<div class="btnrow"><button id="cvZoom">Xem trên bản đồ</button><button id="cvCsv">Lưu CSV</button><button class="primary" id="cvDxf">Xuất CAD (DXF) cắm mốc</button>' + (f.kind === 'polygon' && global.TrichLuc ? '<button id="cvTl">📄 Trích lục</button>' : '') + '<button id="cvCopy">Sao chép</button></div>';
    box.innerHTML = html;
    C.openSheet('Bảng tọa độ', box);
    const name = safeName(Ly.name) + '_thua' + (lb.thua !== '' && lb.thua != null ? safeName(lb.thua) : fi + 1);
    box.querySelector('#cvZoom').onclick = () => { C.closeSheet(); C.select(Ly, [fi], true); };
    box.querySelector('#cvCsv').onclick = () => doSave(name + '.csv', coordCsv(Ly, [fi]), 'text/csv');
    box.querySelector('#cvDxf').onclick = () => doSave(name + '.dxf', buildDxf(Ly, [fi]).text, 'application/dxf');
    const bTl = box.querySelector('#cvTl');
    if (bTl) bTl.onclick = () => global.TrichLuc.open(Ly, fi);
    box.querySelector('#cvCopy').onclick = () => {
      const txt = coordCsv(Ly, [fi]).replace(/^﻿/, '').replace(/,/g, '\t');
      try { navigator.clipboard.writeText(txt).then(() => C.toast('Đã sao chép bảng tọa độ'), () => C.toast('Không sao chép được', true)); } catch (e) { C.toast('Không sao chép được', true); }
    };
  }

  // ---------- Tra cứu ----------
  function showSearch(startLy) {
    const lys = C.layers().filter(L0 => L0.features.some(f => f.kind !== 'text'));
    if (!lys.length) { C.toast('Chưa có dữ liệu. Hãy mở file Shapefile/GeoJSON/GDB/DGN/DWG trước.', true); return; }
    const box = document.createElement('div');
    box.innerHTML =
      '<div class="seg"><button class="on">Tờ · thửa · chủ</button><button id="segB">Tìm chữ</button><button id="segK">Kiểm kê</button></div>' +
      '<label class="f">Lớp dữ liệu</label><select id="qLy">' + lys.map(L0 => '<option value="' + L0.id + '"' + (startLy && startLy.id === L0.id ? ' selected' : '') + '>' + C.esc(L0.name) + ' (' + L0.type + ')</option>').join('') + '</select>' +
      '<div class="two"><div><label class="f">Số tờ</label><input type="text" id="qTo" inputmode="numeric" placeholder="vd: 12"></div><div><label class="f">Số thửa</label><input type="text" id="qThua" inputmode="numeric" placeholder="vd: 345"></div></div>' +
      '<label class="f">Tên chủ sử dụng / từ khóa bất kỳ</label><input type="text" id="qChu" placeholder="vd: Nguyễn Văn A, ONT, ...">' +
      '<div class="btnrow"><button class="primary" id="qGo">Tra cứu</button><button id="qTable">Mở bảng thuộc tính</button><button id="qMap">Gán cột</button></div>' +
      '<div id="qMsg" class="hint"></div><div id="qRes"></div>';
    C.openSheet('Tra cứu tờ · thửa · chủ', box);
    const $ = (id) => box.querySelector(id);
    const cur = () => lys.find(L0 => L0.id == $('#qLy').value);
    function run() {
      const Ly = cur(); if (!Ly) return;
      prepareForSearch(Ly);
      const g = guessFields(Ly);
      const to = $('#qTo').value.trim(), thua = $('#qThua').value.trim(), q = norm($('#qChu').value.trim());
      const recs = recordsOf(Ly, Ly.isCad);
      const res = [];
      const eq = (a, b) => String(a == null ? '' : a).trim().replace(/\.0+$/, '') === b;
      for (const r of recs) {
        const f = Ly.features[r.first], p = f.props || {};
        if (to && (!g.to || !eq(p[g.to], to))) continue;
        if (thua && (!g.thua || !eq(p[g.thua], thua))) continue;
        if (q) {
          let hit = false;
          const fields = g.chu ? [g.chu] : [];
          for (const k of Object.keys(p)) { if (INTERNAL.includes(k) || (!fields.includes(k) && g.chu && !/ten|chu|dia|dc|ghi/.test(key(k)) && q.length < 3)) continue; if (norm(p[k]).indexOf(q) >= 0) { hit = true; break; } }
          if (!hit) continue;
        }
        res.push(r);
        if (res.length >= 200) break;
      }
      let msg = res.length + ' kết quả' + (res.length >= 200 ? ' (hiện 200 đầu)' : '');
      if ((to && !g.to) || (thua && !g.thua)) msg += '. ⚠ Chưa nhận ra cột ' + (to && !g.to ? 'Số tờ' : 'Số thửa') + ' — bấm "Gán cột".';
      if (Ly.isCad && Ly.joinedCount != null) msg += '. (Số thửa/diện tích/loại đất ghép tự động từ nhãn trong ranh thửa: ' + Ly.joinedCount + ' nhãn)';
      $('#qMsg').textContent = msg;
      const out = $('#qRes'); out.innerHTML = '';
      res.forEach(r => {
        const f = Ly.features[r.first], l = featLabel(Ly, f);
        const row = document.createElement('div'); row.className = 'resrow';
        row.innerHTML = '<div class="rt">' + (l.to !== '' && l.to != null ? 'Tờ ' + C.esc(l.to) + ' · ' : '') + 'Thửa <b>' + C.esc(l.thua !== '' && l.thua != null ? l.thua : '#' + (r.first + 1)) + '</b>' + (l.loai ? ' · ' + C.esc(l.loai) : '') +
          (l.dt !== '' && l.dt != null ? ' · ' + C.esc(l.dt) + ' m²' : '') + '</div>' + (l.chu ? '<div class="rs">' + C.esc(l.chu) + '</div>' : '') +
          '<div class="ra"><button class="z">Xem</button><button class="c">Tọa độ</button><button class="e">Thuộc tính</button><button class="n">🚗</button></div>';
        row.querySelector('.z').onclick = () => { C.closeSheet(); C.select(Ly, r.fi, true); };
        row.querySelector('.n').onclick = () => {
          const p = FindNav.featCenter(Ly, r.fi);
          if (p) FindNav.navTo(p.lat, p.lng, (l.to !== '' && l.to != null ? 'Tờ ' + l.to + ' · ' : '') + 'Thửa ' + (l.thua !== '' && l.thua != null ? l.thua : '#' + (r.first + 1)));
        };
        row.querySelector('.c').onclick = () => showCoords(Ly, r.first);
        row.querySelector('.e').onclick = () => showTable(Ly, { only: r.first });
        out.appendChild(row);
      });
      Ly._lastResult = res;
    }
    $('#segB').onclick = () => FindNav.showTextSearch();
    $('#segK').onclick = () => showInventory(cur());
    $('#qGo').onclick = run;
    box.querySelectorAll('input[type=text]').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') run(); }));
    $('#qTable').onclick = () => showTable(cur());
    $('#qMap').onclick = () => showMapping(cur(), () => showSearch(cur()));
  }

  // ---------- Kiểm kê thửa đất ----------
  function showInventory(startLy) {
    const lys = C.layers().filter(L0 => L0.features.some(f => f.kind !== 'text'));
    if (!lys.length) { C.toast('Chưa có dữ liệu. Hãy mở file Shapefile/GeoJSON/GDB/DGN/DWG trước.', true); return; }
    const box = document.createElement('div');
    let curFilter = 'all', qTxt = '';
    const $ = (id) => box.querySelector(id);
    box.innerHTML =
      '<div class="seg"><button id="segA">Tờ · thửa · chủ</button><button id="segB">Tìm chữ</button><button class="on">Kiểm kê</button></div>' +
      '<label class="f">Lớp dữ liệu</label><select id="kLy">' + lys.map(L0 => '<option value="' + L0.id + '"' + (startLy && startLy.id === L0.id ? ' selected' : '') + '>' + C.esc(L0.name) + ' (' + L0.type + ')</option>').join('') + '</select>' +
      '<div id="kStats" class="inv-stats"></div>' +
      '<div id="kChips" class="inv-chips"></div>' +
      '<div class="find-row" style="margin:6px 0"><input type="text" id="kQ" placeholder="Lọc số tờ, số thửa, tên chủ, ghi chú…"></div>' +
      '<div class="btnrow" style="margin:6px 0 8px"><button class="primary" id="kCsv">⬇ Xuất CSV kiểm kê</button><button id="kShp">⬇ Shapefile (.zip)</button><button id="kGj">⬇ GeoJSON</button></div>' +
      '<div id="kMsg" class="hint"></div><div id="kRes"></div>';
    C.openSheet('📋 Theo dõi kiểm kê', box);
    const cur = () => lys.find(L0 => L0.id == $('#kLy').value);
    function draw() {
      const Ly = cur(); if (!Ly) return;
      prepareForSearch(Ly);
      const recs = recordsOf(Ly, Ly.isCad);
      let done = 0, todo = 0;
      const byStatus = {};
      for (const r of recs) {
        const f = Ly.features[r.first], p = f.props || {};
        const st = (p.KIEM_KE || '').trim();
        const col = f.markColor || '';
        if (st || col) {
          done++;
          const keySt = st || col;
          if (!byStatus[keySt]) byStatus[keySt] = { n: 0, c: col || '#22c55e' };
          byStatus[keySt].n++;
        } else todo++;
      }
      const total = recs.length;
      const pct = total ? Math.round(done * 100 / total) : 0;
      $('#kStats').innerHTML = 'Tổng: <b>' + total + '</b> thửa · Đã kiểm kê: <b style="color:#22c55e">' + done + '</b> (' + pct + '%) · Chưa xong: <b style="color:#ffd54a">' + todo + '</b>';
      const chips = [
        { k: 'all', label: 'Tất cả (' + total + ')', c: '' },
        { k: 'todo', label: 'Chưa kiểm kê (' + todo + ')', c: '' }
      ];
      Object.keys(byStatus).forEach(k => chips.push({ k, label: k + ' (' + byStatus[k].n + ')', c: byStatus[k].c }));
      $('#kChips').innerHTML = chips.map(ch =>
        '<button class="inv-chip' + (curFilter === ch.k ? ' on' : '') + '" data-k="' + C.esc(ch.k) + '">' +
        (ch.c ? '<i style="background:' + C.esc(ch.c) + '"></i>' : '') + C.esc(ch.label) + '</button>'
      ).join('');
      $('#kChips').querySelectorAll('.inv-chip').forEach(b => b.onclick = () => { curFilter = b.dataset.k; draw(); });

      const nq = norm(qTxt);
      const list = [];
      for (const r of recs) {
        const f = Ly.features[r.first], p = f.props || {};
        const st = (p.KIEM_KE || '').trim(), col = f.markColor || '', note = (p.GHI_CHU_KK || '').trim();
        const keySt = st || col;
        if (curFilter === 'todo' && keySt) continue;
        if (curFilter !== 'all' && curFilter !== 'todo' && keySt !== curFilter) continue;
        if (nq) {
          const l = featLabel(Ly, f);
          const hay = norm([l.to, l.thua, l.chu, l.loai, st, note].join(' '));
          if (hay.indexOf(nq) < 0) continue;
        }
        list.push(r);
        if (list.length >= 200) break;
      }
      $('#kMsg').textContent = 'Hiển thị ' + list.length + ' thửa' + (list.length >= 200 ? ' (200 đầu)' : '') + ' · Cột tự động trong dữ liệu: KIEM_KE, GHI_CHU_KK';
      const out = $('#kRes'); out.innerHTML = '';
      list.forEach(r => {
        const f = Ly.features[r.first], p = f.props || {}, l = featLabel(Ly, f);
        const st = (p.KIEM_KE || '').trim(), col = f.markColor || '', note = (p.GHI_CHU_KK || '').trim();
        const row = document.createElement('div'); row.className = 'resrow';
        row.innerHTML =
          '<div class="rt">' + (l.to !== '' && l.to != null ? 'Tờ ' + C.esc(l.to) + ' · ' : '') + 'Thửa <b>' + C.esc(l.thua !== '' && l.thua != null ? l.thua : '#' + (r.first + 1)) + '</b>' +
          (l.loai ? ' · ' + C.esc(l.loai) : '') + (l.dt !== '' && l.dt != null ? ' · ' + C.esc(l.dt) + ' m²' : '') +
          (st || col ? ' <span class="inv-badge" style="background:' + C.esc(col || '#22c55e') + '">' + C.esc(st || 'Đã đánh dấu') + '</span>' : '') +
          '</div>' +
          (l.chu ? '<div class="rs">' + C.esc(l.chu) + '</div>' : '') +
          (note ? '<div class="rs" style="color:#ffd54a">📝 ' + C.esc(note) + '</div>' : '') +
          '<div class="ra"><button class="z">Xem</button><button class="e">Thuộc tính</button><button class="n">🚗</button></div>';
        row.querySelector('.z').onclick = () => { C.closeSheet(); C.select(Ly, r.fi, true); };
        row.querySelector('.e').onclick = () => showTable(Ly, { only: r.first });
        row.querySelector('.n').onclick = () => {
          const pt = FindNav.featCenter(Ly, r.fi);
          if (pt) FindNav.navTo(pt.lat, pt.lng, (l.to !== '' && l.to != null ? 'Tờ ' + l.to + ' · ' : '') + 'Thửa ' + (l.thua !== '' && l.thua != null ? l.thua : '#' + (r.first + 1)));
        };
        out.appendChild(row);
      });
    }
    $('#segA').onclick = () => showSearch(cur());
    $('#segB').onclick = () => FindNav.showTextSearch();
    $('#kLy').onchange = () => { curFilter = 'all'; draw(); };
    $('#kQ').oninput = (e) => { qTxt = e.target.value; draw(); };
    $('#kCsv').onclick = () => {
      const Ly = cur(); if (!Ly) return;
      const fields = fieldsOf(Ly);
      exportAction(Ly, 'csv', recordsOf(Ly, false), fields);
    };
    $('#kShp').onclick = () => { const Ly = cur(); if (Ly) exportAction(Ly, 'shp', [], fieldsOf(Ly)); };
    $('#kGj').onclick = () => { const Ly = cur(); if (Ly) exportAction(Ly, 'gj', [], fieldsOf(Ly)); };
    draw();
  }

  function showMapping(Ly, back) {
    prepareForSearch(Ly);
    const g = guessFields(Ly), fs = [''].concat(fieldsOf(Ly));
    const box = document.createElement('div');
    const sel = (id, lab, v) => '<label class="f">' + lab + '</label><select id="' + id + '">' + fs.map(f => '<option value="' + C.esc(f) + '"' + (f === v ? ' selected' : '') + '>' + (f ? C.esc(f) : '— không có —') + '</option>').join('') + '</select>';
    box.innerHTML = sel('mTo', 'Cột Số tờ bản đồ', g.to) + sel('mThua', 'Cột Số thửa', g.thua) + sel('mChu', 'Cột Tên chủ sử dụng', g.chu) + sel('mLoai', 'Cột Loại đất', g.loai) + sel('mDt', 'Cột Diện tích', g.dt) +
      '<div class="btnrow"><button class="primary" id="mOk">Áp dụng</button></div>';
    C.openSheet('Gán cột tra cứu — ' + Ly.name, box);
    box.querySelector('#mOk').onclick = () => {
      Ly._guess = { to: box.querySelector('#mTo').value, thua: box.querySelector('#mThua').value, chu: box.querySelector('#mChu').value, loai: box.querySelector('#mLoai').value, dt: box.querySelector('#mDt').value };
      back && back();
    };
  }

  // ---------- Bảng thuộc tính ----------
  function showTable(Ly, opts) {
    opts = opts || {};
    prepareForSearch(Ly);
    const st = Ly._tbl || (Ly._tbl = { page: 0, filter: '', poly: !!Ly.isCad });
    st.only = opts.only != null ? opts.only : null;
    const PAGE = 1;
    const box = document.createElement('div');
    function render() {
      const fields = fieldsOf(Ly);
      let recs = recordsOf(Ly, st.only != null ? false : st.poly);
      if (st.only != null) recs = recs.filter(r => r.fi.includes(st.only));
      const nf = norm(st.filter);
      if (nf) recs = recs.filter(r => { const p = Ly.features[r.first].props || {}; for (const k of fields) if (norm(p[k]).indexOf(nf) >= 0) return true; return false; });
      if (opts.focus != null) { const idx = recs.findIndex(r => r.fi.includes(opts.focus)); if (idx >= 0) st.page = Math.floor(idx / PAGE); opts.focus = null; }
      const pages = Math.max(1, Math.ceil(recs.length / PAGE));
      st.page = Math.min(st.page, pages - 1);
      const slice = recs.slice(st.page * PAGE, st.page * PAGE + PAGE);
      let h = st.only != null ? '<div class="btnrow" style="margin-top:0"><button id="tAll">Xem tất cả thuộc tính của lớp</button></div>' : '';
      if (st.only == null) h += '<div class="tools"><input type="text" id="tFilter" placeholder="Lọc theo nội dung…" value="' + C.esc(st.filter) + '">' +
        (Ly.isCad ? '<label class="chk"><input type="checkbox" id="tPoly"' + (st.poly ? ' checked' : '') + '> Chỉ thửa (vùng khép kín)</label>' : '') + '</div>';
      h += '<div class="hint">' + recs.length + ' đối tượng' + (Ly.dirty ? ' · <b style="color:#ffd54a">đã chỉnh sửa</b>' : '') + ' · đối tượng ' + (st.page + 1) + '/' + pages + '</div>';
      slice.forEach(r => {
        const f = Ly.features[r.first], p = f.props || {};
        h += '<div class="frm" data-f="' + r.first + '"><div class="act"><button class="mini z">◎ Xem trên bản đồ</button><button class="mini c">XY Tọa độ</button></div>' +
          fields.map(k => '<label class="vf"><span>' + C.esc(k === 'layer' ? (Ly.type === 'DGN' ? 'Level' : 'Layer') : k) + '</span>' + (k === 'layer' && Ly.isCad ? '<div class="ro">' + C.esc(p[k]) + '</div>' : '<input class="cell" data-k="' + C.esc(k) + '" value="' + C.esc(p[k] == null ? '' : p[k]) + '">') + '</label>').join('') + '</div>';
      });
      h += '<div class="btnrow"><button id="tPrev">‹ Trước</button><button id="tNext">Sau ›</button><button id="tAddCol">＋ Cột</button><button class="primary" id="tExport">Lưu / Xuất ▾</button></div>';
      h += '<div id="tMenu" class="menu hidden"></div><div id="tAdd" class="hidden"><label class="f">Tên cột mới</label><input type="text" id="tColName" placeholder="vd: GHI_CHU"><div class="btnrow"><button class="primary" id="tColOk">Thêm</button></div></div>';
      box.innerHTML = h;
      const ta = box.querySelector('#tAll'); if (ta) ta.onclick = () => { st.only = null; opts.focus = recs[0] && recs[0].first; render(); };
      const tf = box.querySelector('#tFilter'); if (tf) tf.onchange = (e) => { st.filter = e.target.value; st.page = 0; render(); };
      const cp = box.querySelector('#tPoly'); if (cp) cp.onchange = (e) => { st.poly = e.target.checked; st.page = 0; render(); };
      box.querySelector('#tPrev').onclick = () => { if (st.page > 0) { st.page--; render(); } };
      box.querySelector('#tNext').onclick = () => { if (st.page < pages - 1) { st.page++; render(); } };
      box.querySelectorAll('.frm[data-f]').forEach(tr => {
        const fi = +tr.dataset.f;
        tr.querySelector('.z').onclick = () => { C.closeSheet(); C.select(Ly, recs.find(r => r.first === fi).fi, true); };
        tr.querySelector('.c').onclick = () => showCoords(Ly, fi);
        tr.querySelectorAll('input.cell').forEach(inp => inp.onchange = () => {
          const rec = recs.find(r => r.first === fi);
          const k = inp.dataset.k;
          rec.fi.forEach(i => {
            const f = Ly.features[i]; f.props = f.props || {};
            const old = f.props[k]; let v = inp.value;
            if (typeof old === 'number' && v.trim() !== '' && isFinite(+v.replace(',', '.'))) v = +v.replace(',', '.');
            f.props[k] = v;
          });
          Ly.dirty = true;
        });
      });
      box.querySelector('#tAddCol').onclick = () => { box.querySelector('#tAdd').classList.toggle('hidden'); };
      box.querySelector('#tColOk').onclick = () => {
        const nm = box.querySelector('#tColName').value.trim();
        if (!nm) return;
        if (fields.includes(nm)) { C.toast('Cột đã tồn tại', true); return; }
        Ly.features.forEach(f => { if (f.kind !== 'text') { f.props = f.props || {}; f.props[nm] = ''; } });
        Ly._fields = null; Ly.dirty = true; render();
      };
      box.querySelector('#tExport').onclick = () => {
        const m = box.querySelector('#tMenu');
        if (!m.classList.contains('hidden')) { m.classList.add('hidden'); return; }
        m.innerHTML =
          '<button data-a="shp">Lưu Shapefile (.zip) – có bảng đã sửa</button>' +
          '<button data-a="gj">Lưu GeoJSON (đã sửa)</button>' +
          '<button data-a="csv">Lưu bảng thuộc tính (CSV)</button>' +
          '<button data-a="dxfall">Xuất TẤT CẢ thửa → CAD (DXF) cắm mốc</button>' +
          '<button data-a="dxfsel">Xuất các thửa đang lọc → CAD (DXF)</button>' +
          '<button data-a="coords">Bảng tọa độ TẤT CẢ thửa (CSV)</button>';
        m.classList.remove('hidden');
        m.querySelectorAll('button').forEach(b => b.onclick = () => exportAction(Ly, b.dataset.a, recs, fields));
      };
    }
    render();
    C.openSheet('Bảng thuộc tính — ' + Ly.name, box);
  }

  function exportAction(Ly, a, filtered, fields) {
    const base = safeName(Ly.name) + '_' + stamp();
    const polyIdx = (recs) => recs.filter(r => Ly.features[r.first].kind === 'polygon').map(r => r.first);
    const allRecs = recordsOf(Ly, false);
    try {
      if (a === 'shp') {
        const prj = Ly.prjText || (Ly.crs && Ly.crs.mode === 'vn3' ? CRS.vnWkt(Ly.crs.lon0) : (Ly.crs && Ly.crs.mode === 'wgs84' ? CRS.wgsWkt() : null));
        const feats = Ly.features.filter(f => f.kind !== 'text');
        const zip = Export.shapefileZip(safeName(Ly.name), feats, { prj });
        doSave(base + '_shp.zip', zip, 'application/zip');
      } else if (a === 'gj') {
        doSave(base + '.geojson', Export.geojson(Ly.features.filter(f => f.kind !== 'text'), Ly.P), 'application/geo+json');
      } else if (a === 'csv') {
        const rows = [fields];
        allRecs.forEach(r => { const p = Ly.features[r.first].props || {}; rows.push(fields.map(k => p[k])); });
        doSave(base + '.csv', Export.csv(rows), 'text/csv');
      } else if (a === 'dxfall' || a === 'dxfsel') {
        const idx = polyIdx(a === 'dxfall' ? allRecs : filtered);
        const use = idx.length ? idx : (a === 'dxfall' ? allRecs : filtered).map(r => r.first);
        if (!use.length) { C.toast('Không có thửa nào để xuất.', true); return; }
        C.loading(true, 'Đang tạo file CAD (' + use.length + ' đối tượng)…');
        setTimeout(() => {
          try { doSave(base + '_camMoc.dxf', buildDxf(Ly, use).text, 'application/dxf'); } finally { C.loading(false); }
        }, 30);
      } else if (a === 'coords') {
        const idx = polyIdx(allRecs);
        doSave(base + '_toado.csv', coordCsv(Ly, idx.length ? idx : allRecs.map(r => r.first)), 'text/csv');
      }
    } catch (e) { C.loading(false); C.toast('Lỗi xuất: ' + e.message, true); }
  }

  global.Attr = { fields: (Ly) => { prepareForSearch(Ly); return fieldsOf(Ly); }, guess: (Ly) => { prepareForSearch(Ly); return guessFields(Ly); }, labelPoint, init, showSearch, showInventory, showTable, showCoords, buildDxf, coordCsv, vnRings, toVN, vnLon0, featLabel, prepareForSearch, areaOf, ringPer, safeName, stamp, doSave, joinCadLabels, recordsOf };
})(window);
