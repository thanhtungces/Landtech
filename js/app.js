/*
 * Tung_LandTech – Xem & biên tập bản đồ địa chính (SHP, GeoJSON, GDB, KML/KMZ, DGN V7/V8, DWG, DXF)
 * © Nguyễn Thanh Tùng – Đội đo đạc, Văn phòng đăng ký đất đai thành phố Đồng Nai – ĐT 0356198189
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const APP = { name: 'Tung_LandTech', author: 'Nguyễn Thanh Tùng', unit: 'Đội đo đạc – Văn phòng đăng ký đất đai thành phố Đồng Nai', phone: '0356198189', version: '2.21' };

  // ---------- Cài đặt (lưu cục bộ) ----------
  const DEF = { mode: 'auto', lon0: 107.75, swap: 'auto', usePrj: true, base: 'gsat', labels: true, textMinPx: 3, textScale: 1, dgnUor: 0, prov: 'Đồng Nai', closeLevels: '10,23,31,32', closeTol: 0.1, autoClose: true, autoSave: true, luAlpha: 0 };
  let S = Object.assign({}, DEF);
  try { Object.assign(S, JSON.parse(localStorage.getItem('settings') || '{}')); } catch (e) { }
  const save = () => { try { localStorage.setItem('settings', JSON.stringify(S)); } catch (e) { } };
  if (S.textMinPx === 5) S.textMinPx = 3;
  if (S.base === 'esri') S.base = 'gsat';
  if (!S.luDef0) { S.luAlpha = 0; S.luDef0 = 1; save(); } // bản 2.17: mặc định không tô màu nền (0%)
  window.__dgnUor = S.dgnUor || 0;

  // ---------- Bản đồ ----------
  const map = L.map('map', { zoomControl: false, preferCanvas: true, maxZoom: 22, attributionControl: true }).setView([11.0, 107.2], 9);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  map.attributionControl.setPrefix(APP.name + ' © ' + APP.author + ' · ĐT ' + APP.phone);

  const GO = (l) => 'https://mt{s}.google.com/vt/lyrs=' + l + '&x={x}&y={y}&z={z}&hl=vi';
  const BASES = {
    gsat: { name: 'Vệ tinh Google (nét nhất, zoom sâu)', url: GO('s'), o: { subdomains: '0123', maxNativeZoom: 21, maxZoom: 22, attribution: 'Imagery © Google' } },
    ghyb: { name: 'Vệ tinh + tên đường (Google)', url: GO('y'), o: { subdomains: '0123', maxNativeZoom: 21, maxZoom: 22, attribution: 'Imagery © Google' } },
    groad: { name: 'Bản đồ đường (Google)', url: GO('m'), o: { subdomains: '0123', maxNativeZoom: 20, maxZoom: 22, attribution: 'Map © Google' } },
    esri: { name: 'Vệ tinh Esri (zoom tới 18, sau đó phóng ảnh)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', o: { maxNativeZoom: 18, maxZoom: 22, attribution: 'Tiles © Esri, Maxar, Earthstar Geographics' } },
    esri17: { name: 'Vệ tinh Esri (vùng nông thôn ít chi tiết, zoom 17)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', o: { maxNativeZoom: 17, maxZoom: 22, attribution: 'Tiles © Esri' } },
    osm: { name: 'Bản đồ đường phố (OSM)', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', o: { maxNativeZoom: 19, maxZoom: 22, attribution: '© OpenStreetMap contributors' } },
    topo: { name: 'Địa hình (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', o: { maxNativeZoom: 18, maxZoom: 22, attribution: 'Tiles © Esri' } },
    none: { name: 'Không có nền (đen)', url: null }
  };
  const LABELS = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 19, maxZoom: 22, pane: 'overlayPane', opacity: 0.9 });
  let baseLayer = null;
  function setBase(k) {
    if (!BASES[k]) k = 'gsat';
    S.base = k; save();
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = BASES[k].url ? L.tileLayer(BASES[k].url, BASES[k].o).addTo(map) : null;
    if (baseLayer) baseLayer.bringToBack();
    if (S.labels && (k === 'esri' || k === 'esri17')) LABELS.addTo(map); else map.removeLayer(LABELS);
  }
  setBase(S.base);

  // ---------- Tiện ích UI ----------
  let toastTimer;
  function toast(msg, err, ms) {
    const t = $('toast'); t.textContent = msg; t.className = err ? 'err' : '';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms || (err ? 8000 : 3500));
  }
  function loading(on, msg) { $('loading').classList.toggle('hidden', !on); if (msg) $('loadingText').textContent = msg; }
  function openSheet(title, html) { $('sheetTitle').textContent = title; $('sheetBody').innerHTML = ''; if (typeof html === 'string') $('sheetBody').innerHTML = html; else $('sheetBody').appendChild(html); $('sheet').classList.remove('hidden'); }
  function closeSheet() { $('sheet').classList.add('hidden'); }
  $('sheetClose').onclick = closeSheet;
  if (window.Wayback) Wayback.init({ map, toast });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n, d) => Number(n).toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });

  // ---------- Lớp dữ liệu ----------
  const layers = [];
  let seq = 0;

  function addDataset(ds) {
    if (!ds.features.length) { toast('"' + ds.name + '" không có đối tượng nào để hiển thị.', true); return null; }
    const Ly = {
      id: ++seq, name: ds.name, type: ds.type, features: ds.features, prj: ds.prj, prjText: ds.prjText || null, isCad: !!ds.isCad, note: ds.note || '',
      visible: true, colorMode: 'file', color: '#ffeb3b', weight: 1.5, hidden: new Set(), layerNames: {}, lidMap: {}, lidList: [], hiddenLids: new Set(),
      fieldOrder: ds.fieldOrder || null, marks: {}
    };
    if (Ly.fieldOrder) Ly._fields = null;
    const mem = kttMem()[ds.name];
    if (mem && S.autoLon0 !== false) { Ly.ktt = mem.lon0; Ly.kttProv = mem.prov; }
    if (Ly.isCad && S.autoClose !== false) { try { autoClose(Ly); } catch (e) { console.warn('autoClose', e); } }
    assignLids(Ly);
    ensureInventoryFields(Ly);
    if (!Ly.isCad && luField(Ly)) { Ly.colorMode = 'landuse'; Ly.weight = 2; } // SHP / GDB / GeoJSON có cột loại đất: tô màu theo Thông tư
    layers.push(Ly);
    build(Ly, true);
    refreshCount();
    return Ly;
  }

  function kttMem() { try { return JSON.parse(localStorage.getItem('kttByFile') || '{}'); } catch (e) { return {}; } }
  function setKttMem(name, v) { try { const m = kttMem(); if (v) m[name] = v; else delete m[name]; localStorage.setItem('kttByFile', JSON.stringify(m)); } catch (e) { } }

  // gán số hiệu cho từng Layer/Level
  function assignLids(Ly) {
    Ly.lidMap = {}; Ly.lidList = []; Ly.layerNames = {};
    for (const f of Ly.features) {
      const ln = f.props && f.props.layer != null ? String(f.props.layer) : null;
      f.lid = 0;
      if (ln != null) {
        if (!(ln in Ly.lidMap)) { Ly.lidMap[ln] = Ly.lidList.length + 1; Ly.lidList.push(ln); Ly.layerNames[ln] = f.auto ? '#ffb300' : (f.props.color || '#fff'); }
        f.lid = Ly.lidMap[ln];
      }
    }
  }

  // ---------- Tự khép ranh thành thửa ----------
  const AUTO_LV = 'Thửa tự khép';
  const lvNorm = (n) => String(n).replace(/^\s*level\s*/i, '').trim();
  function closeLevelSet() { return new Set(String(S.closeLevels || '').split(/[\s,;]+/).map(lvNorm).filter(Boolean)); }
  /** Ghép các đoạn ranh trên các Level đã chọn thành thửa khép kín (đối tượng đánh dấu f.auto, không vẽ nét, chỉ để chạm chọn). */
  function autoClose(Ly, levels, tol) {
    Ly.features = Ly.features.filter(f => !f.auto);
    const want = levels || closeLevelSet();
    if (!want.size || !window.Polygonize) { Ly.closeStats = null; Ly.closeUsed = null; return null; }
    const res = Polygonize.run(Ly.features, (f) => f.props && f.props.layer != null && want.has(lvNorm(f.props.layer)), tol || S.closeTol || 0.1);
    for (const p of res.polys) Ly.features.push({ kind: 'polygon', pts: orderRing(p.ring), holes: p.holes.length ? p.holes : undefined, props: { layer: AUTO_LV }, auto: true });
    Ly.closeStats = res.stats;
    Ly.closeUsed = { levels: Array.from(want), tol: tol || S.closeTol || 0.1 };
    Ly._joined = false; Ly._fields = null; Ly._recs = null; Ly._guess = null;
    if (res.polys.length && Ly.isCad && window.Attr) Attr.joinCadLabels(Ly);
    Ly.note = (Ly.note || '').split('\n').filter(s => s && s.indexOf('Tự khép ranh') !== 0).join('\n');
    if (res.polys.length) Ly.note = (Ly.note ? Ly.note + '\n' : '') + 'Tự khép ranh (Level ' + Array.from(want).join(', ') + '): ' + res.polys.length + ' thửa';
    return res;
  }
  /** Sắp đỉnh theo chiều kim đồng hồ, bắt đầu từ đỉnh góc Tây Bắc (như trích lục thửa đất). */
  function orderRing(r) {
    let a = 0;
    for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; }
    const ring = a > 0 ? r.slice().reverse() : r.slice();
    let k = 0, best = -Infinity;
    ring.forEach((p, i) => { const v = p[1] - p[0]; if (v > best) { best = v; k = i; } });
    return ring.slice(k).concat(ring.slice(0, k));
  }
  function rerunClose(Ly, levels, tol) {
    loading(true, 'Đang khép ranh thửa…');
    setTimeout(() => {
      try {
        const res = autoClose(Ly, levels, tol);
        assignLids(Ly);
        build(Ly, true);
        const st = res && res.stats;
        toast(st ? 'Đã khép ' + st.parcels + ' thửa từ ' + st.segments + ' đoạn ranh (cắt ' + st.crossings + ' giao điểm, nối ' + st.snaps + ' chỗ chạm/hở, bỏ ' + st.dangles + ' đoạn thừa) – ' + st.ms + ' ms' : 'Đã bỏ thửa tự khép');
      } catch (e) { toast('Lỗi khép ranh: ' + e.message, true); }
      loading(false);
    }, 30);
  }

  /** Cột chứa loại đất (LOAI_DAT, KHLOAIDAT, MDSD…) – rỗng nếu không có. */
  function luField(Ly) {
    if (Ly._luField !== undefined && Ly._luFieldFor === Ly._fields) return Ly._luField;
    let k = '';
    try {
      if (Ly.isCad) { if (window.Attr) Attr.joinCadLabels(Ly); k = Ly.features.some(f => f.kind === 'polygon' && f.props && f.props.LOAI_DAT) ? 'LOAI_DAT' : ''; }
      else if (window.Attr && Ly.features.some(f => f.kind === 'polygon')) k = Attr.guess(Ly).loai || '';
    } catch (e) { }
    Ly._luField = k; Ly._luFieldFor = Ly._fields;
    return k;
  }
  const luCodeOf = (Ly, f, k) => f.props && k && f.props[k] != null ? LandUse.codeOf(f.props[k]) : '';
  const MARK_COLORS = [
    { c: '#22c55e', l: 'Đã xong', n: 'Xanh lá (Đã xong)' },
    { c: '#eab308', l: 'Đang xử lý', n: 'Vàng (Đang xử lý)' },
    { c: '#f97316', l: 'Chờ bổ sung', n: 'Cam (Chờ bổ sung)' },
    { c: '#ef4444', l: 'Cần kiểm tra', n: 'Đỏ (Cần kiểm tra)' },
    { c: '#3b82f6', l: 'Đã đo đạc', n: 'Xanh dương (Đã đo đạc)' },
    { c: '#a855f7', l: 'Khác', n: 'Tím' },
    { c: '#ec4899', l: 'Lưu ý', n: 'Hồng' }
  ];
  const markLabelOf = (col) => {
    if (!col) return '';
    const m = MARK_COLORS.find(x => x.c.toLowerCase() === String(col).toLowerCase());
    return m ? m.l : String(col);
  };
  const markColorOfVal = (val) => {
    if (!val) return '';
    const s = String(val).trim();
    if (!s) return '';
    if (/^#[0-9a-f]{6}$/i.test(s)) return s;
    const low = s.toLowerCase();
    const m = MARK_COLORS.find(x => x.l.toLowerCase() === low || x.n.toLowerCase() === low);
    return m ? m.c : '#22c55e';
  };
  function ensureInventoryFields(Ly) {
    if (!Ly || !Ly.features) return;
    if (!Ly.marks) Ly.marks = {};
    let changed = false;
    for (let i = 0; i < Ly.features.length; i++) {
      const f = Ly.features[i];
      if (f.kind === 'text') continue;
      f.props = f.props || {};
      if (!('KIEM_KE' in f.props)) { f.props.KIEM_KE = f.markColor ? markLabelOf(f.markColor) : ''; changed = true; }
      if (!('GHI_CHU_KK' in f.props)) { f.props.GHI_CHU_KK = ''; changed = true; }
      if (!f.markColor && f.props.KIEM_KE) {
        const c = markColorOfVal(f.props.KIEM_KE);
        if (c) { f.markColor = c; Ly.marks[i] = c; }
      } else if (f.markColor && !f.props.KIEM_KE) {
        f.props.KIEM_KE = markLabelOf(f.markColor);
      }
    }
    if (changed) Ly._fields = null;
  }
  function setFeatureColor(Ly, fis, col) {
    if (!Ly.marks) Ly.marks = {};
    const label = markLabelOf(col);
    for (const idx of fis) {
      const feat = Ly.features[idx];
      if (!feat) continue;
      feat.props = feat.props || {};
      if (col) { feat.markColor = col; Ly.marks[idx] = col; feat.props.KIEM_KE = label; }
      else { delete feat.markColor; delete Ly.marks[idx]; feat.props.KIEM_KE = ''; }
    }
    Ly.dirty = true;
    L.FastLayer.restyle(Ly.data, Ly.features, colorOf(Ly));
    Ly.fast.redraw();
    autoSaveSoon(300);
  }
  const colorOf = (Ly) => {
    const one = Ly.colorMode === 'single' ? Ly.color : null;
    if (Ly.colorMode === 'landuse' && window.LandUse) {
      const k = luField(Ly);
      // ranh thửa: xanh đậm (CAD: các Level dùng để khép thửa, ví dụ Level 10)
      const RANH = Ly.ranhColor || S.ranhColor || '#2979ff';
      const ranhLv = new Set(Ly.closeUsed ? Ly.closeUsed.levels.map(String) : []);
      return (f) => {
        if (f.markColor) return { c: f.markColor, fill: f.markColor, mark: 1 };
        const isRanh = Ly.isCad ? !f.auto && f.props && f.props.layer != null && ranhLv.has(lvNorm(f.props.layer)) : f.kind === 'polygon';
        const base = f.auto ? 'transparent' : isRanh ? RANH : (f.props && f.props.color) || '#ffeb3b';
        if (f.kind !== 'polygon') return base;
        const code = luCodeOf(Ly, f, k);
        if (!code) return base;
        return { c: base, fill: LandUse.colorOf(code).fill };
      };
    }
    return (f) => f.markColor ? { c: f.markColor, fill: f.markColor, mark: 1 } : (f.auto ? 'transparent' : one || (f.props && f.props.color) || '#ffeb3b');
  };
  /** Thống kê loại đất của lớp: [{code, n, area?}] theo số thửa giảm dần. */
  function luStats(Ly) {
    const k = luField(Ly), cnt = {};
    if (!k) return [];
    for (const f of Ly.features) { if (f.kind !== 'polygon') continue; const c = luCodeOf(Ly, f, k); if (c) cnt[c] = (cnt[c] || 0) + 1; }
    return Object.keys(cnt).map(c => ({ code: c, n: cnt[c] })).sort((a, b) => b.n - a.n);
  }

  /** reproject = true: chiếu lại tọa độ (lần đầu hoặc khi đổi hệ tọa độ). */
  function build(Ly, reproject) {
    if (reproject) {
      // KTT riêng của lớp (người dùng chọn tỉnh cho file này) ưu tiên hơn cài đặt chung
      const st = Ly.ktt != null ? Object.assign({}, S, { lon0: Ly.ktt, autoLon0: false, mode: S.mode === 'auto' ? 'vn3' : S.mode }) : S;
      const tr = CRS.makeTransform(Ly.features, st, Ly.ktt != null ? null : Ly.prj);
      if (Ly.ktt != null) tr.info.label = CRS.describe(tr.info.mode, Ly.ktt) + ' (chọn riêng: ' + (Ly.kttProv || 'tùy chỉnh') + ')';
      Ly.crs = tr.info; Ly.P = tr.fn;
      Ly.data = L.FastLayer.prepare(Ly.features, Ly.P, { colorOf: colorOf(Ly), lidOf: (f) => f.lid });
      const texts = [];
      for (const f of Ly.features) {
        if (f.kind !== 'text') continue;
        try {
          const ll = Ly.P(f.pts[0]);
          if (isFinite(ll[0]) && isFinite(ll[1])) texts.push({ lat: ll[0], lng: ll[1], text: f.text, h: f.h, rot: f.rot, color: (f.props && f.props.color) || '#fff', align: f.props && f.props.align, lid: f.lid });
        } catch (e) { }
      }
      Ly.texts = texts; Ly.textCount = texts.length; Ly.bad = Ly.data.bad;
      if (!Ly.fast) { Ly.fast = new L.FastLayer(); Ly.text = new L.TextLayer(texts, { minPx: S.textMinPx }); Ly.text.scale = S.textScale || 1; }
      Ly.fast.setData(Ly.data);
      // Khung bản đồ (Level 63), địa giới (Level 40–49): chỉ chọn khi chạm vào nét, không chọn khi chạm bên trong
      const isFrame = (n) => Ly.type === 'DGN' ? (n === '63' || /^4\d$/.test(n)) : /khung|frame|border|dia.?gioi|ranh.?gioi.?hc/i.test(n);
      Ly.fast.edgeOnlyLid = new Set(Ly.lidList.filter(isFrame).map(n => Ly.lidMap[n]));
      Ly.fast.preferLid = new Set(Ly.lidMap[AUTO_LV] ? [Ly.lidMap[AUTO_LV]] : []); // thửa tự khép được ưu tiên khi trùng hình khác
      Ly.text.setItems(texts);
      rebuildExtra(Ly);
    } else {
      L.FastLayer.restyle(Ly.data, Ly.features, colorOf(Ly));
    }
    Ly.fast.setWeight(Ly.weight);
    Ly.fast.fillAlpha = luA();
    updateLuBar();
    applyHidden(Ly);
    if (Ly.visible) { if (!map.hasLayer(Ly.fast)) Ly.fast.addTo(map); if (S.labels !== false && !map.hasLayer(Ly.text)) Ly.text.addTo(map); }
    Ly.fast.redraw();
  }
  function applyHidden(Ly) {
    const set = new Set();
    Ly.hidden.forEach(n => { if (Ly.lidMap[n]) set.add(Ly.lidMap[n]); });
    Ly.hiddenLids = set;
    Ly.fast.hiddenLid = set; Ly.fast.redraw();
    Ly.text.setHiddenLids(set);
    if (Ly.extra) Ly.extra.setHiddenLids(set);
  }

  function boundsOf(Ly) {
    let b = Ly.fast && Ly.fast.getBounds();
    if (b && b.isValid()) return b;
    if (Ly.texts && Ly.texts.length) b = L.latLngBounds(Ly.texts.map(t => [t.lat, t.lng]));
    return b;
  }
  function zoomTo(Ly) {
    const b = boundsOf(Ly);
    if (b && b.isValid()) map.fitBounds(b, { padding: [30, 30], maxZoom: 20 });
    else toast('Không xác định được phạm vi lớp.', true);
  }
  function refreshCount() { $('layerCount').textContent = layers.length; }

  // Chọn (tô sáng) đối tượng và phóng tới
  let selLy = null;
  function select(Ly, fis, zoom) {
    layers.forEach(l => { if (l.fast && l !== Ly) l.fast.setSelection(null); });
    selLy = Ly;
    Ly.fast.setSelection(fis);
    setTimeout(() => Ly.fast.redraw(), 600);
    if (zoom && fis.length) {
      const d = Ly.data;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      fis.forEach(i => { if (d.fKind[i] === 3) return; x0 = Math.min(x0, d.fBox[i * 4]); y0 = Math.min(y0, d.fBox[i * 4 + 1]); x1 = Math.max(x1, d.fBox[i * 4 + 2]); y1 = Math.max(y1, d.fBox[i * 4 + 3]); });
      if (isFinite(x0)) {
        const b = L.latLngBounds([L.FastLayer.unY(y0), L.FastLayer.unX(x0)], [L.FastLayer.unY(y1), L.FastLayer.unX(x1)]);
        map.fitBounds(b, { padding: [60, 60], maxZoom: 21 });
      } else toast('Đối tượng không có hình học.', true);
    }
  }

  // ---------- Thông tin đối tượng ----------
  function planar(pts) {
    let a = 0, per = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
      per += Math.hypot(q[0] - p[0], q[1] - p[1]);
    }
    return { area: Math.abs(a) / 2, per };
  }
  function lineLen(pts) { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return l; }
  function metricPts(Ly, pts) {
    if (Ly.crs.mode !== 'wgs84' && Ly.crs.mode !== 'wkt' && Ly.crs.mode !== 'utm48' && Ly.crs.mode !== 'utm49') return pts;
    return pts.map(p => { const ll = Ly.P(p); const r = CRS.toVN2000(ll[0], ll[1], S.lon0); return [r.E, r.N]; });
  }

  Attr.init({ layers: () => layers, S, map, openSheet, closeSheet, toast, esc, fmt, loading, select, markColors: MARK_COLORS, markLabelOf });
  FindNav.init({ layers: () => layers, S, map, openSheet, closeSheet, toast, esc, fmt, select });
  if (window.TrichLuc) TrichLuc.init({ S, openSheet, closeSheet, toast, esc, fmt, loading });

  // Giữ tay (hoặc chuột phải) lên bản đồ: dẫn đường tới điểm đó
  map.on('contextmenu', (ev) => {
    if (measuring) return;
    const ll = ev.latlng;
    const box = document.createElement('div');
    box.innerHTML = '<div>' + ll.lat.toFixed(7) + ', ' + ll.lng.toFixed(7) + '</div><div class="pbtn"><button class="pn">🚗 Dẫn đường tới đây</button></div>';
    box.querySelector('.pn').onclick = () => { map.closePopup(); FindNav.navTo(ll.lat, ll.lng, 'Điểm đã chọn trên bản đồ'); };
    L.popup({ maxWidth: 260 }).setLatLng(ll).setContent(box).openOn(map);
  });

  map.on('click', (ev) => {
    if (measuring) return;
    for (let k = layers.length - 1; k >= 0; k--) {
      const Ly = layers[k];
      if (!Ly.visible || !Ly.fast) continue;
      const i = Ly.fast.hit(ev.latlng, 12);
      if (i >= 0) { showFeature(Ly, i, ev.latlng); return; }
    }
    layers.forEach(l => l.fast && l.fast.setSelection(null));
    closeInfo();
  });

  // ---------- Số đỉnh + chiều dài cạnh của đối tượng đang chọn ----------
  let geomLabels = null, geomSel = null;
  function clearGeomLabels() { if (geomLabels) { map.removeLayer(geomLabels); geomLabels = null; } geomSel = null; }
  function showGeomLabels(Ly, f) {
    if (geomLabels) { map.removeLayer(geomLabels); geomLabels = null; }
    geomSel = { Ly, f };
    if (f.kind !== 'polygon' && f.kind !== 'line') return;
    let pts = f.pts.slice();
    const closed = f.kind === 'polygon';
    if (closed && pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
    if (pts.length < 2 || pts.length > 400) return;
    const lls = pts.map(p => { const ll = Ly.P(p); return L.latLng(ll[0], ll[1]); });
    const pr = lls.map(ll => map.options.crs.project(ll)); // mét Mercator, y hướng Bắc
    const px = lls.map(ll => map.latLngToContainerPoint(ll));
    const mp = metricPts(Ly, pts);
    const n = pts.length;
    let cx = 0, cy = 0, sa = 0;
    pr.forEach((p, i) => { cx += p.x; cy += p.y; const q = pr[(i + 1) % n]; sa += p.x * q.y - q.x * p.y; });
    cx /= n; cy /= n;
    const g = L.layerGroup();
    const nE = closed ? n : n - 1;
    for (let i = 0; i < nE; i++) {
      const j = (i + 1) % n, p = pr[i], q = pr[j];
      const len = Math.hypot(mp[j][0] - mp[i][0], mp[j][1] - mp[i][1]);
      if (!(len > 0)) continue;
      const txt = fmt(len, 1) + ' m';
      // cạnh quá ngắn trên màn hình thì không ghi (tránh chồng chữ)
      if (px[i].distanceTo(px[j]) < txt.length * 5.5) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
      let ang = -Math.atan2(dy, dx) * 180 / Math.PI;
      if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
      // ghi chữ ra phía ngoài thửa
      const s = closed ? (sa > 0 ? -1 : 1) : 1;
      const ox = -dy / d * s * 11, oy = dx / d * s * 11;
      const mid = map.options.crs.unproject(L.point((p.x + q.x) / 2, (p.y + q.y) / 2));
      g.addLayer(L.marker(mid, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'gl-icon', iconSize: [0, 0], html: '<span class="ed-lab" style="transform:translate(-50%,-50%) translate(' + ox.toFixed(1) + 'px,' + (-oy).toFixed(1) + 'px) rotate(' + ang.toFixed(1) + 'deg)">' + txt + '</span>' }) }));
    }
    let lastPx = null;
    for (let i = 0; i < n; i++) {
      g.addLayer(L.circleMarker(lls[i], { radius: 3, color: '#ff1744', weight: 1.5, fillColor: '#fff', fillOpacity: 1, interactive: false }));
      if (lastPx && lastPx.distanceTo(px[i]) < 22) continue; // đỉnh sát nhau: bỏ bớt số
      lastPx = px[i];
      let ux = pr[i].x - cx, uy = pr[i].y - cy; const d = Math.hypot(ux, uy) || 1; ux /= d; uy /= d;
      g.addLayer(L.marker(lls[i], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'gl-icon', iconSize: [0, 0], html: '<span class="vx-lab" style="transform:translate(-50%,-50%) translate(' + (ux * 17).toFixed(1) + 'px,' + (-uy * 17).toFixed(1) + 'px)">' + (i + 1) + '</span>' }) }));
    }
    if (closed) {
      try { const c = Attr.labelPoint(pts.map(q => ({ E: q[0], N: q[1] }))); const ll = Ly.P([c.E, c.N]); g.addLayer(L.circleMarker(ll, { radius: 7, stroke: false, fillColor: '#ff1744', fillOpacity: 1, interactive: false })); } catch (e) { }
    }
    geomLabels = g.addTo(map);
  }
  map.on('zoomend', () => { if (geomSel) showGeomLabels(geomSel.Ly, geomSel.f); });

  // ---------- Khung thông tin thửa (dưới đáy màn hình) ----------
  const pick = (o, keys) => { for (const k of Object.keys(o)) { if (keys.includes(k.toLowerCase().replace(/[^a-z0-9]/g, ''))) { const v = o[k]; if (v != null && v !== '') return v; } } return ''; };
  function closeInfo() {
    $('fInfo').classList.add('hidden');
    clearGeomLabels();
    if (selLy && selLy.fast) selLy.fast.setSelection(null);
  }
  function showFeature(Ly, i, latlng) {
    const f = Ly.features[i];
    map.closePopup();
    const fis = f.rid != null ? Ly.features.map((g, j) => g.rid === f.rid && g.kind === f.kind ? j : -1).filter(j => j >= 0).slice(0, 50) : [i];
    select(Ly, fis, false);
    const props = f.props || {};
    const to = pick(props, ['soto', 'shbando', 'sobando', 'tobando', 'tobd', 'sotobd', 'shto']);
    const thua = pick(props, ['sothua', 'shthua', 'thua', 'sothututhua', 'parcel', 'parcelno']);
    const loai = pick(props, ['loaidat', 'mdsd', 'kyhieumdsd', 'maloaidat', 'loaidatht', 'kyhieuloaidat']);
    const dtGhi = pick(props, ['dientich', 'dtpl', 'dientichphaply', 'dt', 'dientichht']);
    const chu = pick(props, ['tenchu', 'chusd', 'tenchusd', 'chusudung', 'hoten']);
    let area = null, per = null, nv = 0, len = null;
    if (f.kind === 'polygon') {
      const r = planar(metricPts(Ly, f.pts)); area = r.area; per = r.per;
      (f.holes || []).forEach(h => { area -= planar(metricPts(Ly, h)).area; });
      nv = f.pts.length - (f.pts.length > 1 && f.pts[0][0] === f.pts[f.pts.length - 1][0] && f.pts[0][1] === f.pts[f.pts.length - 1][1] ? 1 : 0);
    } else if (f.kind === 'line') len = lineLen(metricPts(Ly, f.pts));
    const kv = (k, v) => (k ? '<span class="k">' + k + ':</span> ' : '') + '<span class="v">' + v + '</span>';
    const sep = ' <span class="sep">|</span> ';
    const head = [];
    if (to !== '') head.push(kv('Số tờ', esc(to)));
    if (thua !== '') head.push(kv('Số thửa', esc(thua)));
    if (area != null) head.push(kv('Diện tích', fmt(area, 1) + ' m²'));
    if (len != null) head.push(kv('Chiều dài', fmt(len, 2) + ' m'));
    const line2 = [];
    if (loai !== '') line2.push(kv('Loại đất', esc(loai)));
    if (dtGhi !== '' && area != null) line2.push(kv('DT pháp lý', esc(dtGhi) + ' m²'));
    if (per != null) line2.push(kv('Chu vi', fmt(per, 2) + ' m'));
    if (nv) line2.push(kv('Số đỉnh', nv));
    if (area != null && area > 10000) line2.push(kv('', fmt(area / 10000, 4) + ' ha'));
    let rows = '';
    Object.keys(props).forEach(k => {
      if (['color', 'style', 'align'].includes(k) || props[k] == null || props[k] === '') return;
      const label = k === 'layer' ? (Ly.type === 'DGN' ? 'Level' : 'Layer') : k === 'etype' ? 'Loại' : k;
      rows += '<tr><td>' + esc(label) + '</td><td>' + esc(props[k]) + '</td></tr>';
    });
    const curCol = f.markColor || '';
    const dots = MARK_COLORS.map(m => '<button class="fc-dot' + (curCol.toLowerCase() === m.c.toLowerCase() ? ' on' : '') + '" data-c="' + m.c + '" title="' + esc(m.n) + '" style="background:' + m.c + '"></button>').join('');
    const box = $('fInfo');
    box.innerHTML =
      '<div class="fi-grip"></div>' +
      '<div class="fi-head"><div class="fi-title">🧭 ' + (f.kind === 'polygon' ? 'Thông tin thửa đất' : 'Thông tin đối tượng') + '</div>' +
      '<button class="fi-nav"><span class="fi-car">🚗</span>Dẫn đường</button><button class="fi-x" aria-label="Đóng">✕</button></div>' +
      '<div class="fi-card"><div class="fi-l1">' + (head.join(sep) || esc(Ly.name)) + '</div>' + (line2.length ? '<div class="fi-l2">' + line2.join(sep) + '</div>' : '') +
      (chu ? '<div class="fi-l2">' + kv('Chủ sử dụng', esc(chu)) + '</div>' : '') +
      '<div class="fi-src">' + esc(Ly.name) + '</div></div>' +
      '<div class="fi-colors"><span class="fc-lab">Đổi màu:</span><div class="fc-list">' + dots +
      '<label class="fc-pick" title="Chọn màu khác"><input type="color" class="fc-inp" value="' + esc(curCol || '#22c55e') + '"><span>🎨</span></label>' +
      '<button class="fc-clr' + (curCol ? '' : ' hidden') + '" title="Bỏ màu (về mặc định)">↺ Bỏ</button></div></div>' +
      '<div class="fi-note"><input type="text" class="fn-inp" placeholder="Ghi chú kiểm kê (vd: đã ký giáp ranh, vắng chủ…)" value="' + esc(props.GHI_CHU_KK || '') + '"></div>' +
      '<div class="fi-btns"><button class="pc">📍 Tọa độ</button><button class="pt">☰ Thuộc tính</button><button class="pd">⬇ CAD</button>' + (f.kind === 'polygon' && window.TrichLuc ? '<button class="ptl">📄 Trích lục</button>' : '') + '</div>' +
      (rows ? '<details class="fi-more"><summary>Tất cả thuộc tính</summary><table>' + rows + '</table></details>' : '');
    box.classList.remove('hidden');
    const syncColorUI = (c) => {
      box.querySelectorAll('.fc-dot').forEach(b => b.classList.toggle('on', !!c && b.dataset.c.toLowerCase() === c.toLowerCase()));
      box.querySelector('.fc-clr').classList.toggle('hidden', !c);
      if (c) box.querySelector('.fc-inp').value = c;
    };
    box.querySelectorAll('.fc-dot').forEach(b => b.onclick = () => { setFeatureColor(Ly, fis, b.dataset.c); syncColorUI(b.dataset.c); });
    box.querySelector('.fc-inp').oninput = (e) => { setFeatureColor(Ly, fis, e.target.value); syncColorUI(e.target.value); };
    box.querySelector('.fc-clr').onclick = () => { setFeatureColor(Ly, fis, null); syncColorUI(null); };
    box.querySelector('.fn-inp').onchange = (e) => {
      const v = e.target.value;
      for (const idx of fis) { const feat = Ly.features[idx]; if (feat) { feat.props = feat.props || {}; feat.props.GHI_CHU_KK = v; } }
      Ly.dirty = true; autoSaveSoon(300);
    };
    box.querySelector('.fi-x').onclick = closeInfo;
    box.querySelector('.pc').onclick = () => { box.classList.add('hidden'); Attr.showCoords(Ly, i); };
    box.querySelector('.pt').onclick = () => { box.classList.add('hidden'); Attr.showTable(Ly, { only: i }); };
    box.querySelector('.pd').onclick = () => { const r = Attr.buildDxf(Ly, [i]); Attr.doSave(Attr.safeName(Ly.name) + '_' + (i + 1) + '.dxf', r.text, 'application/dxf'); };
    const bTl = box.querySelector('.ptl');
    if (bTl) bTl.onclick = () => { box.classList.add('hidden'); TrichLuc.open(Ly, i); };
    box.querySelector('.fi-nav').onclick = () => {
      let p = latlng;
      if (f.kind === 'polygon') { try { const c = Attr.labelPoint(f.pts.map(q => ({ E: q[0], N: q[1] }))); const ll = Ly.P([c.E, c.N]); p = L.latLng(ll[0], ll[1]); } catch (e) { } }
      FindNav.navTo(p.lat, p.lng, Ly.name + (thua !== '' ? ' · ' + (to !== '' ? 'tờ ' + to + ' ' : '') + 'thửa ' + thua : ''));
    };
    // đưa cả thửa vào khoảng trống phía trên khung thông tin
    if (f.kind === 'polygon' || f.kind === 'line') {
      const b = L.latLngBounds(f.pts.map(p => { const ll = Ly.P(p); return [ll[0], ll[1]]; }));
      const h = box.offsetHeight || 220;
      geomSel = { Ly, f };
      map.fitBounds(b, { paddingTopLeft: [46, 120], paddingBottomRight: [46, h + 40], maxZoom: 20 });
    }
    showGeomLabels(Ly, f);
  }
  map.on('popupclose', () => { if ($('fInfo').classList.contains('hidden') && selLy && selLy.fast) selLy.fast.setSelection(null); });

  // ---------- Mở file ----------
  $('btnOpen').onclick = () => $('fileInput').click();
  /** Nạp một lần mở file. Giữ lại nội dung file gốc (batch) để lưu dự án. */
  async function openFiles(files, opt) {
    opt = opt || {};
    const arr = Array.from(files);
    const batch = opt.batch || { files: await Promise.all(arr.map(async f => ({ name: f.name, data: await f.arrayBuffer() }))) };
    const sets = await Loaders.loadFiles(arr, (m) => { $('loadingText').textContent = m; });
    const added = [];
    for (let k = 0; k < sets.length; k++) {
      const ds = sets[k];
      if (opt.only && !opt.only.has(k)) continue;
      $('loadingText').textContent = 'Đang dựng ' + ds.name + ' (' + ds.features.length + ' đối tượng)…';
      await new Promise(r => setTimeout(r, 20));
      const Ly = addDataset(ds);
      if (Ly) { Ly.src = { batch, k }; added.push(Ly); }
    }
    return { added, sets, batch };
  }

  $('fileInput').onchange = async (ev) => {
    const files = ev.target.files;
    if (!files || !files.length) return;
    loading(true, 'Đang đọc file…');
    let ask = null;
    const pj = Array.from(files).filter(f => /\.tlproj$/i.test(f.name));
    if (pj.length) {
      loading(false); ev.target.value = '';
      for (const f of pj) await importProjectFile(f);
      return;
    }
    try {
      const { added } = await openFiles(files);
      if (added.length) autoSaveSoon(300);
      const warns = added.filter(Ly => Ly.crs.warn).map(Ly => Ly.name + ': ⚠ ' + Ly.crs.warn);
      if (added.length) zoomTo(added[added.length - 1]);
      if (warns.length) toast(warns.join('\n'), true, 8000);
      // KTT tự nhận theo vị trí nhưng còn mập mờ: hỏi người dùng
      ask = added.find(Ly => { const d = Ly.crs.detected; return Ly.ktt == null && d && d.why === 'theo vị trí' && d.cands.length > 1 && d.prov !== S.prov; }) || null;
    } catch (e) {
      console.error(e);
      toast(e.userMessage || ('Lỗi đọc file: ' + (e.message || e)), true, 12000);
    } finally {
      loading(false);
      ev.target.value = '';
    }
    if (ask) setTimeout(() => showKttOptions(ask, true), 400);
  };

  // ---------- Dự án (lưu trên máy bằng IndexedDB) ----------
  const PDB = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('tlt_projects', 1);
      r.onupgradeneeded = () => { const db = r.result; ['meta', 'state', 'files'].forEach(n => { if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id' }); }); };
      r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); };
    }));
    const run = async (stores, mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction(stores, mode);
        const reqs = fn((n) => t.objectStore(n));
        t.oncomplete = () => res(reqs && reqs.result !== undefined ? reqs.result : undefined);
        t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Bộ nhớ đầy hoặc bị từ chối'));
      });
    };
    return {
      list: () => run(['meta'], 'readonly', st => st('meta').getAll()),
      get: (store, id) => run([store], 'readonly', st => st(store).get(id)),
      put: (items) => run(Object.keys(items), 'readwrite', st => { for (const n in items) for (const v of items[n]) st(n).put(v); }),
      del: (id, fileIds) => run(['meta', 'state', 'files'], 'readwrite', st => { st('meta').delete(id); st('state').delete(id); (fileIds || []).forEach(f => st('files').delete(f)); })
    };
  })();
  let curProj = null; // {id, name}

  function layerState(Ly) {
    return {
      name: Ly.name, visible: Ly.visible, colorMode: Ly.colorMode, color: Ly.color, weight: Ly.weight, hidden: Array.from(Ly.hidden || []),
      ktt: Ly.ktt != null ? Ly.ktt : null, kttProv: Ly.kttProv || null, labelF1: Ly.labelF1 || '', labelF2: Ly.labelF2 || '',
      labelLines: Ly.labelLines || null, ranhColor: Ly.ranhColor || null, labelPx: Ly.labelPx || 13, labelZ: Ly.labelZ || 17,
      edgeLevels: Array.from(Ly.edgeLevels || []), close: Ly.closeUsed || null,
      props: Ly.dirty ? Ly.features.map(f => f.props || null) : null,
      marks: Ly.marks && Object.keys(Ly.marks).length ? Ly.marks : null
    };
  }
  function applyState(Ly, st) {
    Ly.visible = st.visible !== false; Ly.colorMode = st.colorMode || 'file'; Ly.color = st.color || Ly.color; Ly.weight = st.weight || 1.5;
    Ly.hidden = new Set(st.hidden || []); Ly.labelF1 = st.labelF1 || ''; Ly.labelF2 = st.labelF2 || ''; Ly.labelLines = st.labelLines || null; Ly.ranhColor = st.ranhColor || null; Ly.labelPx = st.labelPx || 13; Ly.labelZ = st.labelZ || 17; Ly.edgeLevels = new Set(st.edgeLevels || []);
    let re = false;
    if ((st.ktt != null ? st.ktt : null) !== (Ly.ktt != null ? Ly.ktt : null)) { Ly.ktt = st.ktt; Ly.kttProv = st.kttProv; re = true; }
    if (Ly.isCad && JSON.stringify(st.close || null) !== JSON.stringify(Ly.closeUsed || null)) {
      autoClose(Ly, new Set(st.close ? st.close.levels : []), st.close ? st.close.tol : 0); assignLids(Ly); re = true;
    }
    if (st.props && st.props.length === Ly.features.length) {
      Ly.features.forEach((f, i) => { f.props = st.props[i] || f.props; });
      Ly.dirty = true; Ly._joined = true; Ly._fields = null; Ly._recs = null; Ly._guess = null;
    }
    Ly.marks = {};
    if (st.marks) {
      for (const k of Object.keys(st.marks)) {
        const idx = +k, col = st.marks[k];
        if (Ly.features[idx] && col) { Ly.features[idx].markColor = col; Ly.marks[idx] = col; }
      }
    }
    ensureInventoryFields(Ly);
    build(Ly, re);
    if (!re) rebuildExtra(Ly);
    if (!Ly.visible) { map.removeLayer(Ly.fast); map.removeLayer(Ly.text); if (Ly.extra) map.removeLayer(Ly.extra); }
  }
  function removeLayer(Ly) {
    map.removeLayer(Ly.fast); map.removeLayer(Ly.text); if (Ly.extra) map.removeLayer(Ly.extra);
    layers.splice(layers.indexOf(Ly), 1); refreshCount(); updateLuBar();
  }
  const fmtMB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0).replace('.', ',') + ' MB';
  const fmtTime = (t) => { const d = new Date(t); const z = (n) => String(n).padStart(2, '0'); return z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };

  /** Lưu dự án. asNew: tạo dự án mới với tên name. quiet: tự lưu (không báo). */
  async function saveProject(name, asNew, quiet) {
    const keep = layers.filter(Ly => Ly.src);
    if (!keep.length) { if (!quiet) toast('Chưa có lớp nào (mở từ file) để lưu.', true); return; }
    const id = (!asNew && curProj) ? curProj.id : 'p' + Date.now().toString(36);
    const old = (!asNew && curProj) ? await PDB.get('meta', id) : null;
    const batches = [];
    keep.forEach(Ly => { if (batches.indexOf(Ly.src.batch) < 0) batches.push(Ly.src.batch); });
    const fileRecs = [];
    let size = 0;
    const fileIds = batches.map(b => {
      // mỗi dự án giữ bản file riêng (xóa dự án này không ảnh hưởng dự án khác)
      if (b.savedIn !== id || !b.fid) { b.fid = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); fileRecs.push({ id: b.fid, files: b.files }); }
      b.files.forEach(f => size += f.data.byteLength);
      return b.fid;
    });
    const c = map.getCenter();
    const state = {
      id, view: { c: [c.lat, c.lng], z: map.getZoom() }, base: S.base,
      settings: { mode: S.mode, lon0: S.lon0, prov: S.prov, swap: S.swap, usePrj: S.usePrj, autoLon0: S.autoLon0, closeLevels: S.closeLevels, closeTol: S.closeTol, autoClose: S.autoClose },
      batches: fileIds, layers: keep.map(Ly => ({ b: batches.indexOf(Ly.src.batch), k: Ly.src.k, st: layerState(Ly) }))
    };
    const meta = { id, name: name || (old && old.name) || (curProj && curProj.name) || 'Dự án', created: old ? old.created : Date.now(), updated: Date.now(), nLayers: keep.length, size, layerNames: keep.map(Ly => Ly.name).slice(0, 8), fileIds };
    if (!quiet) loading(true, 'Đang lưu dự án…');
    try {
      await PDB.put({ meta: [meta], state: [state], files: fileRecs });
      batches.forEach(b => b.savedIn = id);
      // file cũ không còn dùng trong dự án này
      if (old && old.fileIds) { const gone = old.fileIds.filter(f => fileIds.indexOf(f) < 0); if (gone.length) await PDB.del('__none__', gone); }
      curProj = { id, name: meta.name };
      try { localStorage.setItem('lastProj', id); } catch (e) { }
      if (!quiet) toast('Đã lưu dự án "' + meta.name + '" (' + keep.length + ' lớp, ' + fmtMB(size) + ')');
    } catch (e) { if (!quiet) toast('Không lưu được dự án: ' + (e && e.message || e), true); }
    finally { if (!quiet) loading(false); }
  }

  async function openProject(id, silent) {
    const meta = await PDB.get('meta', id), st = await PDB.get('state', id);
    if (!meta || !st) { if (!silent) toast('Không tìm thấy dữ liệu dự án.', true); return; }
    if (layers.length && !(curProj && curProj.id === id) && !confirm('Mở dự án "' + meta.name + '" sẽ đóng ' + layers.length + ' lớp đang mở. Tiếp tục?')) return;
    closeSheet(); closeInfo();
    loading(true, 'Đang mở dự án ' + meta.name + '…');
    try {
      layers.slice().forEach(removeLayer);
      Object.assign(S, st.settings || {}); window.__dgnUor = S.dgnUor || 0; save();
      if (st.base && st.base !== S.base) setBase(st.base);
      const loaded = [];
      for (let bi = 0; bi < st.batches.length; bi++) {
        const rec = await PDB.get('files', st.batches[bi]);
        if (!rec) { loaded.push(null); continue; }
        const batch = { files: rec.files, fid: rec.id, savedIn: id };
        const files = rec.files.map(f => new File([f.data], f.name));
        const sets = await Loaders.loadFiles(files, (m) => { $('loadingText').textContent = m; });
        loaded.push({ batch, sets });
      }
      let miss = 0;
      for (const L0 of st.layers) {
        const b = loaded[L0.b], ds = b && b.sets[L0.k];
        if (!ds) { miss++; continue; }
        $('loadingText').textContent = 'Đang dựng ' + ds.name + '…';
        await new Promise(r => setTimeout(r, 20));
        const Ly = addDataset(ds);
        if (!Ly) continue;
        Ly.src = { batch: b.batch, k: L0.k };
        try { applyState(Ly, L0.st || {}); } catch (e) { console.warn('applyState', e); }
      }
      curProj = { id, name: meta.name };
      try { localStorage.setItem('lastProj', id); } catch (e) { }
      if (st.view) map.setView(st.view.c, st.view.z);
      toast((silent ? 'Đã mở lại dự án "' : 'Đã mở dự án "') + meta.name + '"' + (miss ? ' (thiếu ' + miss + ' lớp)' : ''));
    } catch (e) { console.error(e); toast('Lỗi mở dự án: ' + (e.message || e), true); }
    finally { loading(false); }
  }

  async function showProjects() {
    const box = document.createElement('div');
    let list = [];
    try { list = (await PDB.list()).sort((a, b) => b.updated - a.updated); } catch (e) { toast('Không đọc được bộ nhớ dự án: ' + e.message, true); }
    const nLy = layers.filter(Ly => Ly.src).length;
    box.innerHTML =
      '<div class="hint">Dự án lưu lại các file đã mở (bản gốc) cùng hệ tọa độ, tỉnh/KTT, Level đang tắt, màu nét, nhãn, thửa tự khép, chỉnh sửa thuộc tính và vị trí bản đồ. Lưu ngay trên máy, không cần mạng.</div>' +
      (curProj ? '<div class="info">Đang mở: <b>' + esc(curProj.name) + '</b></div>' : '') +
      '<div class="btnrow">' + (curProj ? '<button class="primary" id="pjSave">💾 Lưu</button>' : '') + '<button' + (curProj ? '' : ' class="primary"') + ' id="pjNew">＋ Lưu thành dự án mới</button></div>' +
      '<div class="hint">' + nLy + ' lớp đang mở có thể lưu.</div>' +
      '<label class="radio"><input type="checkbox" id="pjAuto"' + (S.autoSave !== false ? ' checked' : '') + '> Tự động lưu file đã mở vào dự án và mở lại khi vào app</label>' +
      '<div class="btnrow"><button id="pjImp">📂 Mở file dự án (.tlproj)</button></div>' +
      '<div class="hint">“⬇ Lưu ra file” ghi dự án thành 1 file .tlproj vào bộ nhớ máy (Download/Tung_LandTech) – giữ được khi gỡ app, chép sang máy khác hoặc gửi Zalo.</div>' +
      '<h3 style="margin:14px 0 6px;font-size:15px">Dự án đã lưu (' + list.length + ')</h3>' +
      (list.length ? list.map(m => '<div class="layer pj" data-id="' + m.id + '"><div class="top"><div class="name">' + (curProj && curProj.id === m.id ? '▶ ' : '') + esc(m.name) + '</div></div>' +
        '<div class="meta">' + m.nLayers + ' lớp · ' + fmtMB(m.size || 0) + ' · lưu ' + fmtTime(m.updated) + '<br>' + esc((m.layerNames || []).join(', ')) + '</div>' +
        '<div class="actions"><button class="primary po">Mở</button><button class="px">⬇ Lưu ra file</button><button class="pr">Đổi tên</button><button class="danger pdl">Xóa</button></div></div>').join('') : '<p class="hint">Chưa có dự án nào.</p>');
    openSheet('📁 Dự án', box);
    box.querySelector('#pjAuto').onchange = (e) => { S.autoSave = e.target.checked; save(); if (S.autoSave) autoSaveSoon(100); };
    box.querySelector('#pjImp').onclick = () => { closeSheet(); $('fileInput').click(); };
    const sv = box.querySelector('#pjSave');
    if (sv) sv.onclick = async () => { await saveProject(null, false); showProjects(); };
    box.querySelector('#pjNew').onclick = async () => {
      const def = layers.length ? layers[0].name.replace(/\.[^.]+$/, '') : 'Dự án';
      const n = prompt('Tên dự án:', def);
      if (n == null || !n.trim()) return;
      await saveProject(n.trim(), true); showProjects();
    };
    box.querySelectorAll('.pj').forEach(el => {
      const id = el.dataset.id, m = list.find(x => x.id === id);
      el.querySelector('.po').onclick = () => openProject(id);
      el.querySelector('.px').onclick = () => exportProjectFile(id);
      el.querySelector('.pr').onclick = async () => {
        const n = prompt('Tên mới:', m.name); if (n == null || !n.trim()) return;
        m.name = n.trim(); await PDB.put({ meta: [m] }); if (curProj && curProj.id === id) curProj.name = m.name; showProjects();
      };
      el.querySelector('.pdl').onclick = async () => {
        if (!confirm('Xóa hẳn dự án "' + m.name + '" khỏi máy? Không khôi phục được.')) return;
        await PDB.del(id, m.fileIds || []); if (curProj && curProj.id === id) { curProj = null; try { localStorage.removeItem('lastProj'); } catch (e) { } } toast('Đã xóa dự án "' + m.name + '"'); showProjects();
      };
    });
  }
  $('btnProj').onclick = showProjects;

  // ---------- Tự động lưu file đã mở ----------
  let autoT = null, autoBusy = Promise.resolve();
  /** Lưu (lặng lẽ) các lớp đang mở vào dự án hiện tại; chưa có dự án thì tự tạo "Tự lưu …". */
  function autoSaveSoon(ms) {
    if (S.autoSave === false) return;
    clearTimeout(autoT);
    autoT = setTimeout(() => {
      autoBusy = autoBusy.then(async () => {
        if (!layers.some(Ly => Ly.src)) { if (curProj) await saveProjectEmpty(); return; }
        if (curProj) await saveProject(null, false, true);
        else {
          const first = layers.find(Ly => Ly.src);
          await saveProject('Tự lưu – ' + first.name.replace(/\.[^.]+$/, '') + ' – ' + fmtTime(Date.now()), true, true);
          if (curProj) toast('Đã tự lưu vào dự án "' + curProj.name + '" (📁 Dự án)', false, 3500);
        }
      }).catch(e => console.warn('autosave', e));
    }, ms == null ? 1500 : ms);
  }
  /** Đã xóa hết lớp: cập nhật dự án hiện tại thành rỗng (giữ tên). */
  async function saveProjectEmpty() {
    const old = await PDB.get('meta', curProj.id);
    if (!old) return;
    old.updated = Date.now(); old.nLayers = 0; old.size = 0; old.layerNames = [];
    const gone = old.fileIds || []; old.fileIds = [];
    const st = (await PDB.get('state', curProj.id)) || { id: curProj.id };
    st.batches = []; st.layers = [];
    await PDB.put({ meta: [old], state: [st] });
    if (gone.length) await PDB.del('__none__', gone);
  }
  // Tự lưu dự án đang mở khi chuyển app xuống nền
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden' || !layers.some(Ly => Ly.src)) return;
    if (curProj) saveProject(null, false, true); else if (S.autoSave !== false) autoSaveSoon(0);
  });

  // ---------- Dự án ra file .tlproj (lưu trong bộ nhớ máy) ----------
  // Cấu trúc: "TLTPROJ1" + u32 độ dài JSON + JSON {meta, state, files:[{id, items:[{name, size}]}]} + dữ liệu file nối tiếp
  async function exportProjectFile(id) {
    loading(true, 'Đang ghi file dự án…');
    try {
      const meta = await PDB.get('meta', id), st = await PDB.get('state', id);
      if (!meta || !st) throw new Error('không tìm thấy dự án');
      const recs = [];
      for (const fid of st.batches || []) { const r = await PDB.get('files', fid); if (r) recs.push(r); }
      const head = { app: 'Tung_LandTech', ver: APP.version, meta, state: st, files: recs.map(r => ({ id: r.id, items: r.files.map(f => ({ name: f.name, size: f.data.byteLength })) })) };
      const hj = new TextEncoder().encode(JSON.stringify(head));
      let total = 12 + hj.length;
      recs.forEach(r => r.files.forEach(f => total += f.data.byteLength));
      const out = new Uint8Array(total);
      out.set(new TextEncoder().encode('TLTPROJ1'), 0);
      new DataView(out.buffer).setUint32(8, hj.length, true);
      out.set(hj, 12);
      let o = 12 + hj.length;
      recs.forEach(r => r.files.forEach(f => { out.set(new Uint8Array(f.data), o); o += f.data.byteLength; }));
      const fname = (String(meta.name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w\-.]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'du_an') + '.tlproj';
      $('loadingText').textContent = 'Đang ghi ' + fname + ' (' + fmtMB(total) + ')…';
      await new Promise(r => setTimeout(r, 30));
      const msg = await Export.save(fname, out, 'application/octet-stream');
      loading(false);
      toast(msg + '\nMở lại: 📁 Dự án → 📂 Mở file dự án, hoặc chạm vào file .tlproj trong Trình quản lý file.', false, 7000);
    } catch (e) { loading(false); toast('Không ghi được file dự án: ' + (e.message || e), true); }
  }
  async function importProjectFile(file) {
    loading(true, 'Đang đọc dự án ' + file.name + '…');
    try {
      const buf = await file.arrayBuffer(), u8 = new Uint8Array(buf);
      if (new TextDecoder().decode(u8.subarray(0, 8)) !== 'TLTPROJ1') throw new Error('không phải file dự án Tung_LandTech');
      const hl = new DataView(buf).getUint32(8, true);
      const head = JSON.parse(new TextDecoder().decode(u8.subarray(12, 12 + hl)));
      let o = 12 + hl;
      const stamp = Date.now().toString(36);
      const id = 'p' + stamp, map2 = {};
      const fileRecs = head.files.map((r, i) => {
        const nid = 'f' + stamp + i + Math.random().toString(36).slice(2, 6);
        map2[r.id] = nid;
        return { id: nid, files: r.items.map(it => { const d = buf.slice(o, o + it.size); o += it.size; return { name: it.name, data: d }; }) };
      });
      if (o > buf.byteLength) throw new Error('file dự án bị thiếu dữ liệu');
      const st = Object.assign({}, head.state, { id, batches: (head.state.batches || []).map(b => map2[b] || b) });
      const all = await PDB.list().catch(() => []);
      let name = head.meta.name || file.name.replace(/\.tlproj$/i, '');
      if (all.some(m => m.name === name)) name += ' (nhập ' + fmtTime(Date.now()) + ')';
      const meta = Object.assign({}, head.meta, { id, name, fileIds: fileRecs.map(r => r.id), updated: Date.now() });
      await PDB.put({ meta: [meta], state: [st], files: fileRecs });
      loading(false);
      await openProject(id);
    } catch (e) { loading(false); toast('Không mở được file dự án: ' + (e.message || e), true); }
  }

  // Vào app: mở lại dự án dùng lần trước (file đã tự lưu)
  setTimeout(async () => {
    if (S.autoSave === false || layers.length) return;
    let id = null;
    try { id = localStorage.getItem('lastProj'); } catch (e) { }
    if (!id) return;
    try { const m = await PDB.get('meta', id); if (m && m.nLayers && !layers.length) await openProject(id, true); } catch (e) { console.warn('restore', e); }
  }, 600);

  // ---------- Nhãn theo cột & chiều dài cạnh ----------
  function rebuildExtra(Ly) {
    const items = [];
    const LL = labelLinesOf(Ly).filter(l => l.k);
    if (LL.length) {
      const seen = new Set(), px = Ly.labelPx || 13, minZ = Ly.labelZ || 17;
      for (const f of Ly.features) {
        if (f.kind === 'text' || !f.props) continue;
        if (f.rid != null) { const k = f.kind + ':' + f.rid; if (seen.has(k)) continue; seen.add(k); }
        const lines = [];
        for (const l of LL) { const v = f.props[l.k]; if (v != null && v !== '') lines.push({ t: (l.pre || '') + String(v), c: l.c || '#fff' }); }
        if (!lines.length) continue;
        let p;
        if (f.kind === 'polygon') { const c = Attr.labelPoint(f.pts.map(q => ({ E: q[0], N: q[1] }))); p = [c.E, c.N]; }
        else if (f.kind === 'line') p = f.pts[f.pts.length >> 1]; else p = f.pts[0];
        try { const ll = Ly.P(p); if (isFinite(ll[0]) && isFinite(ll[1])) items.push({ lat: ll[0], lng: ll[1], text: lines.map(x => x.t).join('\n'), lines, px, minZ, color: '#ffffff', align: 1, lid: f.lid, mid: 1 }); } catch (e) { }
      }
    }
    if (Ly.edgeLevels && Ly.edgeLevels.size) {
      let n = 0;
      const raw = Ly.crs.mode === 'vn3';
      outer: for (const f of Ly.features) {
        if ((f.kind !== 'polygon' && f.kind !== 'line') || !Ly.edgeLevels.has(f.props && f.props.layer != null ? String(f.props.layer) : '*')) continue;
        const ring = f.pts, m = ring.length;
        const last = f.kind === 'polygon' && !(ring[0][0] === ring[m - 1][0] && ring[0][1] === ring[m - 1][1]) ? m : m - 1;
        for (let i = 0; i < last; i++) {
          const p = ring[i], q = ring[(i + 1) % m];
          let dE, dN;
          if (raw) { const e1 = Ly.crs.swap ? p[1] : p[0], n1 = Ly.crs.swap ? p[0] : p[1], e2 = Ly.crs.swap ? q[1] : q[0], n2 = Ly.crs.swap ? q[0] : q[1]; dE = e2 - e1; dN = n2 - n1; }
          else { const mp = metricPts(Ly, [p, q]); dE = mp[1][0] - mp[0][0]; dN = mp[1][1] - mp[0][1]; }
          const len = Math.hypot(dE, dN);
          if (len < 0.05) continue;
          let ang = Math.atan2(dN, dE);
          if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
          try {
            const ll = Ly.P([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]);
            items.push({ lat: ll[0], lng: ll[1], text: len.toFixed(2), px: 11, minZ: 19, color: '#7cff7c', align: 1, rot: ang, lid: f.lid });
          } catch (e) { }
          if (++n > 80000) break outer;
        }
      }
    }
    if (!Ly.extra) Ly.extra = new L.TextLayer(items, { minPx: 0 }); else Ly.extra.setItems(items);
    Ly.extra.setHiddenLids(Ly.hiddenLids || new Set());
    if (items.length && Ly.visible) { if (!map.hasLayer(Ly.extra)) Ly.extra.addTo(map); } else if (map.hasLayer(Ly.extra)) map.removeLayer(Ly.extra);
    return items.length;
  }
  const LINE_COLORS = ['#ffffff', '#ffeb3b', '#00e5ff', '#ff8a80', '#b9f6ca', '#ffd180'];
  /** Các dòng nhãn của lớp: [{k: cột, c: màu}] (tương thích bản cũ Dòng 1/Dòng 2). */
  function labelLinesOf(Ly) {
    if (Ly.labelLines) return Ly.labelLines;
    return [Ly.labelF1, Ly.labelF2].filter(Boolean).map((k, i) => ({ k, c: LINE_COLORS[i] }));
  }
  function showLabelOptions(Ly) {
    const fs = Attr.fields(Ly);
    const opt = (v) => '<option value="">— Không hiện —</option>' + fs.map(k => '<option value="' + esc(k) + '"' + (k === v ? ' selected' : '') + '>' + esc(k === 'layer' ? 'Layer/Level' : k) + '</option>').join('');
    let rows = labelLinesOf(Ly).map(l => Object.assign({}, l));
    if (!rows.length) {
      const g = Attr.guess(Ly);
      rows = [g.thua, g.dt, g.loai].filter(Boolean).map((k, i) => ({ k, c: LINE_COLORS[i] }));
      if (!rows.length) rows = [{ k: '', c: LINE_COLORS[0] }];
    }
    const box = document.createElement('div');
    openSheet('Nhãn — ' + Ly.name, box);
    const draw = () => {
      box.innerHTML = '<div class="hint">Mỗi dòng nhãn lấy từ một cột, có màu riêng. Nhãn đặt ở tâm thửa, hiện khi zoom gần.</div>' +
        '<div id="lbRows">' + rows.map((r, i) => '<div class="lbrow" data-i="' + i + '"><span class="lbn">' + (i + 1) + '</span><select class="lbk">' + opt(r.k) + '</select>' +
          '<input type="color" class="lbc" value="' + esc(r.c || '#ffffff') + '"><button class="lbu" title="Lên">▲</button><button class="lbx danger" title="Bỏ dòng">✕</button></div>').join('') + '</div>' +
        (rows.length < 6 ? '<div class="btnrow"><button id="lbAdd">＋ Thêm dòng</button></div>' : '') +
        '<label class="f">Cỡ chữ</label><select id="lbPx">' + [11, 13, 15, 18, 22].map(v => '<option' + (v === (Ly.labelPx || 13) ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>' +
        '<label class="f">Hiện từ mức zoom</label><select id="lbZ">' + [14, 15, 16, 17, 18, 19].map(v => '<option' + (v === (Ly.labelZ || 17) ? ' selected' : '') + '>' + v + '</option>').join('') + '</select>' +
        '<div id="lbPrev" class="lbprev"></div>' +
        '<div class="btnrow"><button class="primary" id="lbOk">Áp dụng</button><button id="lbOff">Tắt nhãn</button></div>';
      const sync = () => box.querySelectorAll('.lbrow').forEach(el => { const r = rows[+el.dataset.i]; r.k = el.querySelector('.lbk').value; r.c = el.querySelector('.lbc').value; });
      const prev = () => {
        sync();
        const f = Ly.features.find(f => f.kind === 'polygon' && f.props && rows.some(r => r.k && f.props[r.k] != null && f.props[r.k] !== '')) || Ly.features.find(f => f.props);
        box.querySelector('#lbPrev').innerHTML = 'Xem trước:<div>' + rows.filter(r => r.k).map(r => '<div style="color:' + esc(r.c) + '">' + esc(f && f.props && f.props[r.k] != null ? f.props[r.k] : r.k) + '</div>').join('') + '</div>';
      };
      box.querySelectorAll('.lbk,.lbc').forEach(el => el.oninput = el.onchange = prev);
      box.querySelectorAll('.lbx').forEach(el => el.onclick = () => { sync(); rows.splice(+el.parentNode.dataset.i, 1); draw(); });
      box.querySelectorAll('.lbu').forEach(el => el.onclick = () => { sync(); const i = +el.parentNode.dataset.i; if (i > 0) { const t = rows[i]; rows[i] = rows[i - 1]; rows[i - 1] = t; } draw(); });
      const add = box.querySelector('#lbAdd');
      if (add) add.onclick = () => { sync(); rows.push({ k: '', c: LINE_COLORS[rows.length % LINE_COLORS.length] }); draw(); };
      box.querySelector('#lbOk').onclick = () => {
        sync();
        Ly.labelLines = rows.filter(r => r.k); Ly.labelF1 = ''; Ly.labelF2 = '';
        Ly.labelPx = +box.querySelector('#lbPx').value; Ly.labelZ = +box.querySelector('#lbZ').value;
        const n = rebuildExtra(Ly); closeSheet(); autoSaveSoon();
        toast(n ? 'Đã tạo ' + n + ' nhãn ' + Ly.labelLines.length + ' dòng (hiện từ zoom ' + Ly.labelZ + ')' : 'Không có nhãn');
      };
      box.querySelector('#lbOff').onclick = () => { Ly.labelLines = []; Ly.labelF1 = ''; Ly.labelF2 = ''; rebuildExtra(Ly); closeSheet(); autoSaveSoon(); toast('Đã tắt nhãn'); };
      prev();
    };
    draw();
  }
  function showEdgeOptions(Ly) {
    const names = Object.keys(Ly.layerNames).sort((a, b) => (+a - +b) || a.localeCompare(b));
    const lvName = Ly.type === 'DGN' ? 'Level' : 'Layer';
    if (!Ly.edgeLevels) Ly.edgeLevels = new Set();
    const box = document.createElement('div');
    const list = names.length ? names : ['*'];
    box.innerHTML = '<div class="hint">Chọn ' + lvName + ' cần hiện chiều dài cạnh (m). Chữ xanh hiện khi zoom gần (từ mức 19). Ví dụ: Level 10 = ranh thửa.</div><div class="sub">' +
      list.map(n => '<label><input type="checkbox" data-n="' + esc(n) + '"' + (Ly.edgeLevels.has(n) ? ' checked' : '') + '>' + (n === '*' ? 'Tất cả đối tượng' : esc(lvName + ' ' + n)) + '</label>').join('') + '</div><div class="btnrow"><button class="primary" id="egOk">Áp dụng</button><button id="egOff">Tắt hết</button></div>';
    openSheet('Chiều dài cạnh — ' + Ly.name, box);
    box.querySelector('#egOk').onclick = () => {
      Ly.edgeLevels = new Set(Array.from(box.querySelectorAll('input[data-n]:checked')).map(c => c.dataset.n));
      loading(true, 'Đang tính chiều dài cạnh…');
      setTimeout(() => { const n = rebuildExtra(Ly); loading(false); closeSheet(); toast(n + ' nhãn (zoom gần để xem)'); }, 30);
    };
    box.querySelector('#egOff').onclick = () => { Ly.edgeLevels = new Set(); rebuildExtra(Ly); closeSheet(); };
  }

  function showKttOptions(Ly, ask) {
    const det = Ly.crs && Ly.crs.detected;
    const cand = det && det.cands ? det.cands : [];
    const row = (name, lon0, tag) => '<label><input type="radio" name="ktt" data-l="' + lon0 + '" data-p="' + esc(name) + '"' + (Ly.ktt != null && Ly.kttProv === name ? ' checked' : '') + '>' + esc(name) + ' — ' + CRS.fmtDeg(lon0) + (tag ? ' <span style="color:#7cc4ff">' + tag + '</span>' : '') + '</label>';
    const seen = new Set();
    let list = '';
    cand.forEach((c, k) => { seen.add(c.prov); list += row(c.prov, c.lon0, k === 0 ? '(phù hợp nhất)' : '(phù hợp vị trí)'); });
    CRS.PROVINCES.forEach(([n, l]) => { if (!seen.has(n)) list += row(n, l, ''); });
    const box = document.createElement('div');
    box.innerHTML = (ask ? '<div class="hint" style="color:#ffd54a">⚠ Chưa chắc chắn file này thuộc tỉnh nào (cùng tọa độ X, Y có thể nằm ở nhiều tỉnh khác kinh tuyến trục). App tạm đặt theo <b>' + esc(det.prov) + '</b>. Hãy chọn đúng tỉnh – app sẽ nhớ cho lần sau.</div>' : '') +
      '<div class="hint">Bản vẽ DGN/DWG/DXF không ghi hệ tọa độ; chọn sai kinh tuyến trục (KTT) sẽ lệch hàng chục km. ' +
      'Đang dùng: <b>' + esc(Ly.crs.label) + '</b>. Chọn đúng tỉnh lập bản đồ (tỉnh cũ, trước sáp nhập 2025) cho riêng file này:</div>' +
      '<div class="sub"><label><input type="radio" name="ktt" data-auto="1"' + (Ly.ktt == null ? ' checked' : '') + '><b>Tự động</b> (theo chữ trên bản vẽ / vị trí)</label>' + list + '</div>' +
      '<div class="btnrow"><button class="primary" id="kttOk">Áp dụng</button></div>';
    openSheet('Tỉnh / KTT — ' + Ly.name, box);
    box.querySelector('#kttOk').onclick = () => {
      const r = box.querySelector('input[name=ktt]:checked');
      if (!r) return;
      if (r.dataset.auto) { Ly.ktt = null; Ly.kttProv = null; setKttMem(Ly.name, null); } else { Ly.ktt = +r.dataset.l; Ly.kttProv = r.dataset.p; setKttMem(Ly.name, { lon0: Ly.ktt, prov: Ly.kttProv }); }
      closeSheet();
      loading(true, 'Đang tính lại tọa độ…');
      setTimeout(() => { try { Ly._recs = null; build(Ly, true); zoomTo(Ly); toast(Ly.name + ': ' + Ly.crs.label); } catch (e) { toast('Lỗi: ' + e.message, true); } loading(false); }, 30);
    };
  }

  function showCloseOptions(Ly) {
    const lvName = Ly.type === 'DGN' ? 'Level' : 'Layer';
    const cnt = {};
    for (const f of Ly.features) if (!f.auto && (f.kind === 'line' || f.kind === 'polygon') && f.props && f.props.layer != null) { const n = String(f.props.layer); cnt[n] = (cnt[n] || 0) + 1; }
    const names = Object.keys(cnt).sort((a, b) => (+lvNorm(a) - +lvNorm(b)) || a.localeCompare(b));
    const want = closeLevelSet();
    const st = Ly.closeStats;
    const box = document.createElement('div');
    box.innerHTML = '<div class="hint">Ghép các đoạn ranh rời trên các ' + lvName + ' được chọn thành thửa khép kín: tự cắt tại giao điểm, nối chỗ hở nhỏ hơn dung sai, bỏ đoạn thừa. ' +
      'Sau đó chạm vào giữa thửa sẽ hiện diện tích, số thửa. Mặc định: Level 10 (ranh thửa), 23, 31, 32.</div>' +
      (st ? '<div class="hint">Hiện có <b>' + st.parcels + '</b> thửa tự khép (' + st.segments + ' đoạn ranh, ' + st.crossings + ' giao điểm, ' + st.snaps + ' chỗ chạm/hở, ' + st.dangles + ' đoạn thừa).</div>' : '') +
      '<div class="sub">' + (names.length ? names.map(n => '<label><input type="checkbox" data-n="' + esc(n) + '"' + (want.has(lvNorm(n)) ? ' checked' : '') + '>' + esc(lvName + ' ' + n) + ' <span style="opacity:.6">(' + cnt[n] + ')</span></label>').join('') : 'Không có đường nét nào.') + '</div>' +
      '<label class="f">Dung sai nối chỗ hở</label><select id="ktTol">' + [0.02, 0.05, 0.1, 0.2, 0.5, 1].map(v => '<option value="' + v + '"' + (v === (S.closeTol || 0.1) ? ' selected' : '') + '>' + String(v).replace('.', ',') + ' m</option>').join('') + '</select>' +
      '<label><input type="checkbox" id="ktAuto"' + (S.autoClose !== false ? ' checked' : '') + '> Tự khép khi mở file DGN/DWG/DXF</label>' +
      '<div class="btnrow"><button class="primary" id="ktOk">Khép thửa</button><button id="ktOff">Bỏ thửa tự khép</button></div>';
    openSheet('Tự khép ranh thửa — ' + Ly.name, box);
    box.querySelector('#ktAuto').onchange = (e) => { S.autoClose = e.target.checked; save(); };
    box.querySelector('#ktOk').onclick = () => {
      const sel = Array.from(box.querySelectorAll('input[data-n]:checked')).map(c => lvNorm(c.dataset.n));
      if (!sel.length) { toast('Chọn ít nhất một ' + lvName, true); return; }
      S.closeLevels = sel.join(','); S.closeTol = +box.querySelector('#ktTol').value; save();
      closeSheet();
      rerunClose(Ly, new Set(sel), S.closeTol);
    };
    box.querySelector('#ktOff').onclick = () => { closeSheet(); rerunClose(Ly, new Set(), 0); };
  }

  // ---------- Thanh kéo độ mờ màu loại đất (nổi trên bản đồ) ----------
  const luA = () => (S.luAlpha != null ? +S.luAlpha : 0.55);
  function setLuA(v) {
    S.luAlpha = v;
    layers.forEach(l => { if (l.fast) { l.fast.fillAlpha = v; l.fast.redraw(); } });
    document.querySelectorAll('.lu-range').forEach(r => { if (+r.value !== Math.round(v * 100)) r.value = Math.round(v * 100); });
    document.querySelectorAll('.lu-val').forEach(e => e.textContent = Math.round(v * 100) + '%');
  }
  function bindLuRange(r, lab) {
    if (lab) lab.classList.add('lu-val');
    let raf = 0;
    r.oninput = () => { const v = +r.value / 100; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setLuA(v)); };
    r.onchange = () => save();
  }
  const luBar = document.createElement('div');
  luBar.id = 'luBar'; luBar.className = 'hidden';
  luBar.innerHTML = '<span class="lu-t">Màu đất</span><input type="range" class="lu-range" min="0" max="100" step="5"><b class="lu-val"></b>';
  document.body.appendChild(luBar);
  bindLuRange(luBar.querySelector('input'));
  ['pointerdown', 'touchstart', 'wheel', 'dblclick', 'click'].forEach(ev => luBar.addEventListener(ev, e => e.stopPropagation(), { passive: true }));
  /** Hiện thanh kéo khi có lớp đang tô màu loại đất. */
  function updateLuBar() {
    const on = layers.some(l => l.visible && l.colorMode === 'landuse');
    luBar.classList.toggle('hidden', !on);
    if (on) { luBar.querySelector('input').value = Math.round(luA() * 100); luBar.querySelector('.lu-val').textContent = Math.round(luA() * 100) + '%'; }
  }

  /** Chú giải màu loại đất trong thẻ lớp. */
  function legendHtml(Ly) {
    if (Ly.colorMode !== 'landuse') return '';
    const st = luStats(Ly);
    if (!st.length) return '';
    return '<div class="lu-leg"><div class="lu-h">Màu loại đất theo Thông tư (cột ' + esc(luField(Ly)) + ')</div>' + st.slice(0, 40).map(x => {
      const c = LandUse.colorOf(x.code);
      return '<span class="lu-i" title="' + esc(c.name) + '"><i style="background:' + c.fill + ';border-color:' + c.stroke + '"></i><b>' + esc(x.code) + '</b> ' + x.n + '</span>';
    }).join('') + (st.length > 40 ? '<span class="lu-i">… +' + (st.length - 40) + '</span>' : '') + '</div>';
  }

  // ---------- Bảng Lớp ----------
  $('btnLayers').onclick = showLayers;
  function showLayers() {
    const box = document.createElement('div');
    if (!layers.length) {
      box.innerHTML = '<p>Chưa có lớp nào. Bấm <b>＋ Mở file</b> để mở Shapefile (chọn cả .shp .dbf .prj hoặc file .zip), GDB (nén .zip), GeoJSON, KML/KMZ, DGN, DWG, DXF.</p>';
    }
    layers.forEach(Ly => {
      const d = document.createElement('div'); d.className = 'layer';
      const subNames = Object.keys(Ly.layerNames || {});
      const markKeys = Object.keys(Ly.marks || {});
      let markLeg = '';
      if (markKeys.length) {
        const mc = {};
        markKeys.forEach(k => { const c = Ly.marks[k]; mc[c] = (mc[c] || 0) + 1; });
        markLeg = '<div class="lu-leg"><div class="lu-h">Đã đánh dấu theo dõi (' + markKeys.length + ' thửa)</div>' +
          Object.keys(mc).map(c => '<span class="lu-i"><i style="background:' + esc(c) + ';border-color:' + esc(c) + '"></i>' + mc[c] + '</span>').join('') + '</div>';
      }
      d.innerHTML =
        '<div class="top"><input type="checkbox" class="vis"' + (Ly.visible ? ' checked' : '') + '><div class="name">' + esc(Ly.name) + '</div>' +
        '<input type="color" class="col" value="' + (Ly.colorMode === 'landuse' ? (Ly.ranhColor || S.ranhColor || '#2979ff') : Ly.color) + '" title="' + (Ly.colorMode === 'landuse' ? 'Màu ranh thửa' : 'Màu đơn') + '"></div>' +
        '<div class="meta">' + Ly.type + ' · ' + Ly.features.length + ' đối tượng' + (Ly.textCount ? ' · ' + Ly.textCount + ' chữ' : '') + '<br>' + esc(Ly.crs.label) + (Ly.bad ? '<br>⚠ ' + Ly.bad + ' đối tượng lỗi tọa độ' : '') + (Ly.dirty ? '<br><b style="color:#ffd54a">Đã chỉnh sửa bảng thuộc tính</b>' : '') + '</div>' +
        '<div class="actions"><button class="zoom">Phóng tới</button><button class="tb">Bảng thuộc tính</button><button class="sr">Tra cứu</button><button class="lb">Nhãn</button><button class="eg">Cạnh</button>' + (Ly.crs && (Ly.crs.mode === 'vn3' || Ly.crs.mode === 'vn6') ? '<button class="ktt">Tỉnh/KTT</button>' : '') + (Ly.isCad ? '<button class="kt">Khép thửa' + (Ly.closeStats ? ' (' + Ly.closeStats.parcels + ')' : '') + '</button>' : '') + '<button class="cm">' + (Ly.colorMode === 'file' ? 'Màu: theo file' : Ly.colorMode === 'landuse' ? 'Màu: loại đất' : 'Màu: 1 màu') + '</button>' +
        '<button class="w">Nét: ' + Ly.weight + '</button>' + (subNames.length > 1 ? '<button class="lv">' + (Ly.type === 'DGN' ? 'Level' : 'Layer') + ' (' + subNames.length + ')</button>' : '') +
        (markKeys.length ? '<button class="clrm">Bỏ màu (' + markKeys.length + ')</button>' : '') +
        '<button class="rm danger">Xóa</button></div>' + markLeg + legendHtml(Ly) + '<div class="sub hidden"></div>';
      d.querySelector('.vis').onchange = (e) => { Ly.visible = e.target.checked; setTimeout(updateLuBar, 0); if (Ly.visible) { Ly.fast.addTo(map); if (S.labels !== false) Ly.text.addTo(map); if (Ly.extra) Ly.extra.addTo(map); } else { map.removeLayer(Ly.fast); map.removeLayer(Ly.text); if (Ly.extra) map.removeLayer(Ly.extra); } };
      d.querySelector('.zoom').onclick = () => { closeSheet(); zoomTo(Ly); };
      d.querySelector('.tb').onclick = () => Attr.showTable(Ly);
      d.querySelector('.sr').onclick = () => Attr.showSearch(Ly);
      d.querySelector('.lb').onclick = () => showLabelOptions(Ly);
      d.querySelector('.eg').onclick = () => showEdgeOptions(Ly);
      if (d.querySelector('.kt')) d.querySelector('.kt').onclick = () => showCloseOptions(Ly);
      if (d.querySelector('.ktt')) d.querySelector('.ktt').onclick = () => showKttOptions(Ly);
      if (d.querySelector('.clrm')) d.querySelector('.clrm').onclick = () => {
        if (!confirm('Xóa màu đã đánh dấu của ' + markKeys.length + ' thửa trên lớp "' + Ly.name + '"?')) return;
        Ly.marks = {}; Ly.features.forEach(f => { delete f.markColor; if (f.props && 'KIEM_KE' in f.props) f.props.KIEM_KE = ''; });
        L.FastLayer.restyle(Ly.data, Ly.features, colorOf(Ly)); Ly.fast.redraw(); autoSaveSoon(300); showLayers();
      };
      d.querySelector('.col').onchange = (e) => {
        // chế độ màu loại đất: ô màu đổi màu ranh thửa (nhớ cho các lần mở sau)
        if (Ly.colorMode === 'landuse') { Ly.ranhColor = e.target.value; S.ranhColor = e.target.value; save(); }
        else { Ly.color = e.target.value; Ly.colorMode = 'single'; }
        build(Ly, false); showLayers(); autoSaveSoon();
      };
      d.querySelector('.cm').onclick = () => {
        const modes = ['file'].concat(luField(Ly) ? ['landuse'] : [], ['single']);
        Ly.colorMode = modes[(modes.indexOf(Ly.colorMode) + 1) % modes.length];
        if (Ly.colorMode === 'landuse' && !luStats(Ly).length) toast('Lớp này chưa có cột loại đất có dữ liệu', true);
        build(Ly, false); showLayers(); autoSaveSoon();
      };
      d.querySelector('.w').onclick = () => { const ws = [1, 1.5, 2, 3, 4]; Ly.weight = ws[(ws.indexOf(Ly.weight) + 1) % ws.length]; Ly.fast.setWeight(Ly.weight); showLayers(); };
      d.querySelector('.rm').onclick = () => { removeLayer(Ly); updateLuBar(); showLayers(); autoSaveSoon(); };
      const lv = d.querySelector('.lv');
      if (lv) lv.onclick = () => {
        const sub = d.querySelector('.sub');
        sub.classList.toggle('hidden');
        if (sub.innerHTML) return;
        const sorted = subNames.sort((a, b) => (+a - +b) || a.localeCompare(b));
        sub.innerHTML = '<label><button class="all">Bật tất cả</button><button class="none">Tắt tất cả</button></label>' + sorted.map(n => '<label><input type="checkbox" data-n="' + esc(n) + '"' + (Ly.hidden.has(n) ? '' : ' checked') + '><span class="sw" style="background:' + esc(Ly.layerNames[n]) + '"></span>' + esc(n) + '</label>').join('');
        sub.querySelectorAll('input[data-n]').forEach(cb => cb.onchange = () => { const n = cb.dataset.n; if (cb.checked) Ly.hidden.delete(n); else Ly.hidden.add(n); applyHidden(Ly); });
        sub.querySelector('.all').onclick = () => { Ly.hidden.clear(); applyHidden(Ly); sub.querySelectorAll('input[data-n]').forEach(c => c.checked = true); };
        sub.querySelector('.none').onclick = () => { sorted.forEach(n => Ly.hidden.add(n)); applyHidden(Ly); sub.querySelectorAll('input[data-n]').forEach(c => c.checked = false); };
      };
      box.appendChild(d);
    });
    const row = document.createElement('div'); row.className = 'btnrow';
    row.innerHTML = '<label class="radio" style="border:none"><input type="checkbox" id="chkLabels"' + (S.labels !== false ? ' checked' : '') + '> Hiện chữ ghi chú (số thửa, diện tích…)</label>';
    box.appendChild(row);
    const ts = document.createElement('div');
    ts.innerHTML = '<label class="f">Cỡ chữ ghi chú (phóng to chữ khi chữ quá nhỏ)</label><select id="selTs">' + [[1, 'Chuẩn'], [2, 'x2'], [4, 'x4'], [8, 'x8']].map(o => '<option value="' + o[0] + '"' + (+S.textScale === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
    box.appendChild(ts);
    if (layers.some(Ly => Ly.colorMode === 'landuse')) {
      const fa = document.createElement('div');
      const v0 = Math.round(luA() * 100);
      fa.innerHTML = '<label class="f">Độ mờ màu loại đất (kéo trái để thấy ảnh vệ tinh): <b id="luAv">' + v0 + '%</b></label><input type="range" id="selLuA" class="lu-range" min="0" max="100" step="5" value="' + v0 + '">';
      box.appendChild(fa);
    }
    openSheet('Các lớp bản đồ', box);
    if ($('selLuA')) bindLuRange($('selLuA'), $('luAv'));
    $('selTs').onchange = (e) => { S.textScale = +e.target.value; save(); layers.forEach(l => { l.text.scale = S.textScale; l.text._redraw && l.text._map && l.text._redraw(); }); };
    $('chkLabels').onchange = (e) => { S.labels = e.target.checked; save(); layers.forEach(Ly => { if (!Ly.visible) return; if (S.labels) Ly.text.addTo(map); else map.removeLayer(Ly.text); }); setBase(S.base); };
  }

  // ---------- Bảng Hệ tọa độ ----------
  $('btnCrs').onclick = () => {
    const opts = CRS.PROVINCES.map(p => '<option value="' + p[1] + '|' + esc(p[0]) + '"' + (S.prov === p[0] ? ' selected' : '') + '>' + esc(p[0]) + ' — ' + CRS.fmtDeg(p[1]) + '</option>').join('');
    const html =
      '<label class="f">Hệ tọa độ cho bản vẽ CAD / SHP không có .prj</label>' +
      '<select id="selMode">' +
      [['auto', 'Tự nhận dạng (VN-2000 múi 3° hoặc WGS84)'], ['vn3', 'VN-2000 múi 3° (k=0,9999) – bản đồ địa chính'], ['vn6', 'VN-2000 múi 6° (k=0,9996)'], ['utm48', 'WGS84 UTM 48N'], ['utm49', 'WGS84 UTM 49N'], ['wgs84', 'WGS84 kinh/vĩ độ']]
        .map(o => '<option value="' + o[0] + '"' + (S.mode === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<label class="f">Tỉnh / thành phố (kinh tuyến trục)</label><select id="selProv"><option value="">— Chọn tỉnh —</option>' + opts + '</select>' +
      '<label class="f">Kinh tuyến trục (độ thập phân, ví dụ 107.75 = 107°45\')</label><input type="number" step="0.25" id="inLon0" value="' + S.lon0 + '">' +
      '<label class="f">Đảo trục X/Y</label><select id="selSwap">' +
      [['auto', 'Tự động'], ['no', 'Không đảo (X = Đông, Y = Bắc như CAD)'], ['yes', 'Đảo (X = Bắc, Y = Đông)']].map(o => '<option value="' + o[0] + '"' + (S.swap === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<label class="f">Đơn vị DGN V8 (áp dụng cho file DGN mở lần sau)</label><select id="selUor">' +
      [[0, 'Tự động'], [1, 'UOR = mét'], [1000, '1 m = 1.000 UOR (mm)'], [1000000, '1 m = 1.000.000 UOR (Resolution 1000/mm)']].map(o => '<option value="' + o[0] + '"' + (+S.dgnUor === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>' +
      '<label class="radio"><input type="checkbox" id="chkAutoKtt"' + (S.autoLon0 !== false ? ' checked' : '') + '> Tự nhận kinh tuyến trục theo vị trí bản vẽ (DGN/DWG/DXF không có .prj). Bỏ chọn để luôn dùng KTT ở trên.</label>' +
      '<label class="radio"><input type="checkbox" id="chkPrj"' + (S.usePrj !== false ? ' checked' : '') + '> Ưu tiên thông tin .prj đi kèm shapefile</label>' +
      '<div class="hint">Bảng kinh tuyến trục theo 63 tỉnh (trước sắp xếp ĐVHC 2025). Với tỉnh mới sau sáp nhập, kiểm tra Phụ lục TT 26/2024/TT-BTNMT, TT 23/2025/TT-BNNMT và nhập kinh tuyến trục tương ứng. ' +
      'Chuyển VN-2000 → WGS84 dùng 7 tham số theo QĐ 05/2007/QĐ-BTNMT; ảnh vệ tinh có thể lệch vài mét so với thực địa.</div>' +
      '<div class="btnrow"><button class="primary" id="btnApply">Áp dụng cho tất cả lớp</button></div>';
    openSheet('Hệ tọa độ', html);
    $('selProv').onchange = (e) => { if (e.target.value) $('inLon0').value = e.target.value.split('|')[0]; };
    $('btnApply').onclick = () => {
      S.mode = $('selMode').value; S.lon0 = parseFloat($('inLon0').value) || 107.75; S.swap = $('selSwap').value; S.usePrj = $('chkPrj').checked; S.autoLon0 = $('chkAutoKtt').checked;
      S.dgnUor = +$('selUor').value; window.__dgnUor = S.dgnUor;
      const pv = $('selProv').value; S.prov = pv ? pv.split('|')[1] : S.prov;
      save();
      loading(true, 'Đang tính lại tọa độ…');
      setTimeout(() => {
        try { layers.forEach(l => { l._recs = null; build(l, true); }); toast('Đã áp dụng: ' + CRS.describe(S.mode === 'auto' ? 'vn3' : S.mode, S.lon0)); }
        catch (e) { toast('Lỗi: ' + e.message, true); }
        loading(false); closeSheet(); updateCoord();
        if (layers.length) zoomTo(layers[layers.length - 1]);
      }, 30);
    };
  };

  // ---------- Bảng Nền ----------
  $('btnBase').onclick = () => {
    const html = Object.keys(BASES).map(k => '<label class="radio"><input type="radio" name="base" value="' + k + '"' + (S.base === k ? ' checked' : '') + '> ' + BASES[k].name + '</label>').join('') +
      '<div class="hint">Ảnh nền cần kết nối Internet. Bản vẽ CAD/SHP đọc hoàn toàn trên máy, không gửi đi đâu.</div>';
    openSheet('Bản đồ nền', html);
    document.querySelectorAll('input[name=base]').forEach(r => r.onchange = () => { setBase(r.value); closeSheet(); });
  };

  // ---------- Tra cứu, Kiểm kê & Giới thiệu ----------
  $('btnSearch').onclick = () => Attr.showSearch();
  $('btnInv').onclick = () => Attr.showInventory();
  $('btnAbout').onclick = () => {
    openSheet('Giới thiệu', '<div class="about"><div class="logo">LT</div><h3>' + APP.name + '</h3><div class="hint">Phiên bản ' + APP.version + '</div>' +
      '<p>Xem, tra cứu và biên tập bản đồ địa chính trên điện thoại.</p>' +
      '<table><tr><td>Tác giả</td><td><b>' + APP.author + '</b></td></tr><tr><td>Đơn vị</td><td>' + APP.unit + '</td></tr><tr><td>Điện thoại</td><td><a href="tel:' + APP.phone + '">' + APP.phone + '</a></td></tr></table>' +
      '<div class="hint" style="margin-top:12px">Định dạng đọc: Shapefile, GeoJSON, File Geodatabase (.gdb nén zip), KML, KMZ, DGN V7 và V8, DWG, DXF. ' +
      'Chức năng: tắt/bật Layer–Level, tra cứu tờ/thửa/chủ, sửa bảng thuộc tính, bảng tọa độ VN-2000, xuất CAD (DXF) để cắm mốc.</div>' +
      '<div class="hint">© ' + new Date().getFullYear() + ' ' + APP.author + '. Bảo lưu mọi quyền.</div></div>');
  };

  // ---------- GPS ----------
  let gpsWatch = null, gpsMarker = null, gpsCircle = null, gpsFirst = true;
  $('btnGps').onclick = () => {
    if (gpsWatch != null) {
      if (gpsMarker && !gpsFirst) { map.setView(gpsMarker.getLatLng(), Math.max(map.getZoom(), 18)); }
      return stopGpsIfDouble();
    }
    if (!navigator.geolocation) return toast('Thiết bị không hỗ trợ định vị.', true);
    $('btnGps').classList.add('on'); gpsFirst = true;
    toast('Đang lấy vị trí GPS…');
    gpsWatch = navigator.geolocation.watchPosition((pos) => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      if (!gpsMarker) {
        gpsMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="gps-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), zIndexOffset: 1000 }).addTo(map);
        gpsCircle = L.circle(ll, { radius: pos.coords.accuracy, color: '#2f9bff', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map);
      } else { gpsMarker.setLatLng(ll); gpsCircle.setLatLng(ll).setRadius(pos.coords.accuracy); }
      const vn = CRS.toVN2000(ll[0], ll[1], S.lon0);
      gpsMarker.bindPopup('Vị trí của tôi (±' + Math.round(pos.coords.accuracy) + ' m)<br>Vĩ độ ' + ll[0].toFixed(7) + '<br>Kinh độ ' + ll[1].toFixed(7) + '<br>VN-2000 (KTT ' + CRS.fmtDeg(S.lon0) + '):<br>X = ' + fmt(vn.N, 3) + '<br>Y = ' + fmt(vn.E, 3));
      if (gpsFirst) { map.setView(ll, Math.max(map.getZoom(), 18)); gpsFirst = false; }
    }, (err) => {
      toast('Không lấy được vị trí: ' + err.message + '\nHãy bật GPS và cấp quyền Vị trí cho app.', true);
      stopGps();
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 });
  };
  let lastGpsTap = 0;
  function stopGpsIfDouble() { const now = Date.now(); if (now - lastGpsTap < 600) { stopGps(); toast('Đã tắt GPS'); } lastGpsTap = now; }
  function stopGps() {
    if (gpsWatch != null) navigator.geolocation.clearWatch(gpsWatch);
    gpsWatch = null; $('btnGps').classList.remove('on');
    if (gpsMarker) { map.removeLayer(gpsMarker); map.removeLayer(gpsCircle); gpsMarker = gpsCircle = null; }
  }

  // ---------- Tọa độ tâm màn hình ----------
  let crossOn = false;
  $('btnCross').onclick = () => {
    crossOn = !crossOn;
    $('btnCross').classList.toggle('on', crossOn);
    $('crosshair').classList.toggle('hidden', !crossOn);
    $('coordBox').classList.toggle('hidden', !crossOn);
    updateCoord();
  };
  function updateCoord() {
    if (!crossOn) return;
    const c = map.getCenter();
    const vn = CRS.toVN2000(c.lat, c.lng, S.lon0);
    $('coordBox').innerHTML = 'Vĩ độ <b>' + c.lat.toFixed(7) + '</b> · Kinh độ <b>' + c.lng.toFixed(7) + '</b><br>' +
      'VN-2000 KTT ' + CRS.fmtDeg(S.lon0) + ': X(Bắc) <b>' + fmt(vn.N, 2) + '</b> · Y(Đông) <b>' + fmt(vn.E, 2) + '</b>';
  }
  map.on('move', updateCoord);

  // ---------- Đo đạc ----------
  let measuring = false, mPts = [], mLine = null, mMarkers = L.layerGroup();
  $('btnMeasure').onclick = () => {
    measuring = !measuring;
    $('btnMeasure').classList.toggle('on', measuring);
    $('measureBox').classList.toggle('hidden', !measuring);
    if (measuring) { mMarkers.addTo(map); map.closePopup(); drawMeasure(); }
    else { clearMeasure(); map.removeLayer(mMarkers); }
  };
  $('mClose').onclick = () => $('btnMeasure').click();
  $('mUndo').onclick = () => { mPts.pop(); drawMeasure(); };
  $('mClear').onclick = () => { clearMeasure(); drawMeasure(); };
  function clearMeasure() { mPts = []; if (mLine) map.removeLayer(mLine); mLine = null; mMarkers.clearLayers(); }
  let lastM = 0;
  map.on('click', (e) => { if (!measuring) return; const now = Date.now(); const l = mPts[mPts.length - 1]; if (now - lastM < 400 || (l && l.distanceTo(e.latlng) < 0.05)) return; lastM = now; mPts.push(e.latlng); drawMeasure(); });
  function drawMeasure() {
    if (mLine) map.removeLayer(mLine);
    mMarkers.clearLayers();
    mPts.forEach(p => L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: '#ff3b3b', fillOpacity: 1, interactive: false }).addTo(mMarkers));
    if (mPts.length >= 3) mLine = L.polygon(mPts, { color: '#ff3b3b', weight: 2, fillOpacity: 0.15, interactive: false }).addTo(map);
    else if (mPts.length === 2) mLine = L.polyline(mPts, { color: '#ff3b3b', weight: 2, interactive: false }).addTo(map);
    const xy = mPts.map(p => { const r = CRS.toVN2000(p.lat, p.lng, S.lon0); return [r.E, r.N]; });
    let txt = 'Chạm lên bản đồ để thêm điểm';
    if (xy.length >= 2) txt = 'Chiều dài: <b>' + fmt(lineLen(xy), 2) + ' m</b>';
    if (xy.length >= 3) { const r = planar(xy); txt += ' · Diện tích: <b>' + fmt(r.area, 1) + ' m²</b> · Chu vi: ' + fmt(r.per, 2) + ' m'; }
    $('measureText').innerHTML = txt;
  }

  // Mở file khi Android gửi vào (Mở bằng…)
  window.openExternalFile = async function (name, url) {
    try {
      const buf = await (await fetch(url)).arrayBuffer();
      const dt = new DataTransfer(); dt.items.add(new File([buf], name));
      $('fileInput').files = dt.files; $('fileInput').onchange({ target: $('fileInput') });
    } catch (e) { toast('Không mở được file: ' + e.message, true); }
  };

  // Cho kiểm thử
  window.__app = { layers, addDataset, S, map, zoomTo, saveProject, openProject, PDB, showProjects, exportProjectFile, importProjectFile, rebuildExtra, showLabelOptions, showLayers, get curProj() { return curProj; } };
})();
