/*
 * Hệ tọa độ: VN-2000 (múi 3° k=0.9999 / múi 6° k=0.9996), UTM WGS84, WGS84 độ.
 * Tham số chuyển đổi VN-2000 -> WGS84 theo QĐ 05/2007/QĐ-BTNMT.
 * Bảng kinh tuyến trục theo 63 tỉnh (trước sắp xếp ĐVHC 2025) — cần đối chiếu Phụ lục
 * TT 26/2024/TT-BTNMT & TT 23/2025/TT-BNNMT; có thể nhập kinh tuyến trục tùy ý.
 */
(function (global) {
  'use strict';
  const TOWGS84 = '-191.90441429,-39.30318279,-111.45032835,-0.00928836,0.01975479,-0.00427372,0.252906278';

  const PROVINCES = [
    ['An Giang', 104.75], ['Bà Rịa - Vũng Tàu', 107.75], ['Bạc Liêu', 105.0], ['Bắc Giang', 107.0], ['Bắc Kạn', 106.5],
    ['Bắc Ninh', 105.5], ['Bến Tre', 105.75], ['Bình Dương', 105.75], ['Bình Định', 108.25], ['Bình Phước', 106.25],
    ['Bình Thuận', 108.5], ['Cà Mau', 104.5], ['Cao Bằng', 105.75], ['Cần Thơ', 105.0], ['Đà Nẵng', 107.75],
    ['Đắk Lắk', 108.5], ['Đắk Nông', 108.5], ['Điện Biên', 103.0], ['Đồng Nai', 107.75], ['Đồng Tháp', 105.0],
    ['Gia Lai', 108.5], ['Hà Giang', 105.5], ['Hà Nam', 105.0], ['Hà Nội', 105.0], ['Hà Tĩnh', 105.5],
    ['Hải Dương', 105.5], ['Hải Phòng', 105.75], ['Hậu Giang', 105.0], ['Hòa Bình', 106.0], ['Hưng Yên', 105.5],
    ['Khánh Hòa', 108.25], ['Kiên Giang', 104.5], ['Kon Tum', 107.5], ['Lai Châu', 103.0], ['Lạng Sơn', 107.25],
    ['Lào Cai', 104.75], ['Lâm Đồng', 107.75], ['Long An', 105.75], ['Nam Định', 105.5], ['Nghệ An', 104.75],
    ['Ninh Bình', 105.0], ['Ninh Thuận', 108.25], ['Phú Thọ', 104.75], ['Phú Yên', 108.5], ['Quảng Bình', 106.0],
    ['Quảng Nam', 107.75], ['Quảng Ngãi', 108.0], ['Quảng Ninh', 107.75], ['Quảng Trị', 106.25], ['Sóc Trăng', 105.5],
    ['Sơn La', 104.0], ['Tây Ninh', 105.5], ['Thái Bình', 105.5], ['Thái Nguyên', 106.5], ['Thanh Hóa', 105.0],
    ['Thừa Thiên Huế', 107.0], ['Tiền Giang', 105.75], ['TP. Hồ Chí Minh', 105.75], ['Trà Vinh', 105.5], ['Tuyên Quang', 106.0],
    ['Vĩnh Long', 105.5], ['Vĩnh Phúc', 105.0], ['Yên Bái', 104.75]
  ];

  // Khung bao gần đúng [kinh độ min, vĩ độ min, kinh độ max, vĩ độ max] của 63 tỉnh (địa giới trước 2025)
  // dùng để tự nhận kinh tuyến trục: bản vẽ phải rơi vào đúng tỉnh có kinh tuyến trục đó.
  const BBOX = {
    'Lai Châu': [102.3, 21.7, 103.9, 22.85], 'Điện Biên': [102.1, 20.9, 103.6, 22.55], 'Sơn La': [103.2, 20.6, 105.0, 22.05],
    'Lào Cai': [103.5, 21.85, 104.65, 22.85], 'Yên Bái': [103.9, 21.3, 105.1, 22.3], 'Hà Giang': [104.3, 22.1, 105.6, 23.4],
    'Tuyên Quang': [104.85, 21.5, 105.65, 22.7], 'Phú Thọ': [104.8, 20.9, 105.45, 21.75], 'Vĩnh Phúc': [105.3, 21.1, 105.8, 21.6],
    'Cao Bằng': [105.25, 22.35, 106.85, 23.15], 'Lạng Sơn': [106.1, 21.3, 107.4, 22.45], 'Bắc Kạn': [105.45, 21.8, 106.25, 22.75],
    'Thái Nguyên': [105.45, 21.3, 106.25, 22.05], 'Bắc Giang': [105.85, 21.1, 107.05, 21.65], 'Bắc Ninh': [105.9, 20.95, 106.3, 21.3],
    'Quảng Ninh': [106.4, 20.65, 108.1, 21.7], 'Hải Phòng': [106.4, 20.55, 107.15, 21.05], 'Hải Dương': [106.0, 20.65, 106.65, 21.25],
    'Hưng Yên': [105.85, 20.55, 106.3, 21.05], 'Hà Nội': [105.25, 20.55, 106.05, 21.4], 'Hòa Bình': [104.8, 20.3, 105.85, 21.1],
    'Hà Nam': [105.75, 20.35, 106.2, 20.7], 'Nam Định': [105.9, 19.9, 106.55, 20.55], 'Thái Bình': [106.1, 20.25, 106.65, 20.75],
    'Ninh Bình': [105.55, 19.95, 106.2, 20.45], 'Thanh Hóa': [104.35, 19.3, 106.1, 20.7], 'Nghệ An': [103.85, 18.55, 105.85, 19.95],
    'Hà Tĩnh': [105.1, 17.9, 106.5, 18.85], 'Quảng Bình': [105.6, 16.9, 106.95, 18.1], 'Quảng Trị': [106.5, 16.3, 107.4, 17.2],
    'Thừa Thiên Huế': [107.0, 15.95, 108.2, 16.8], 'Đà Nẵng': [107.8, 15.9, 108.35, 16.35], 'Quảng Nam': [107.2, 14.95, 108.75, 16.1],
    'Quảng Ngãi': [108.2, 14.5, 109.15, 15.45], 'Bình Định': [108.6, 13.5, 109.35, 14.75], 'Kon Tum': [107.35, 13.9, 108.55, 15.45],
    'Gia Lai': [107.45, 12.95, 108.95, 14.65], 'Đắk Lắk': [107.5, 12.15, 108.95, 13.45], 'Đắk Nông': [107.2, 11.75, 108.15, 12.85],
    'Phú Yên': [108.65, 12.7, 109.5, 13.7], 'Khánh Hòa': [108.65, 11.8, 109.5, 12.9], 'Ninh Thuận': [108.55, 11.3, 109.25, 12.2],
    'Bình Thuận': [107.4, 10.5, 108.9, 11.6], 'Lâm Đồng': [107.25, 11.1, 108.75, 12.35], 'Bình Dương': [106.35, 10.85, 106.95, 11.5],
    'Bình Phước': [106.4, 11.35, 107.45, 12.3], 'Đồng Nai': [106.75, 10.5, 107.6, 11.6], 'Bà Rịa - Vũng Tàu': [107.0, 10.3, 107.6, 10.85],
    'Tây Ninh': [105.8, 10.95, 106.45, 11.8], 'Long An': [105.5, 10.35, 106.8, 11.05], 'TP. Hồ Chí Minh': [106.35, 10.35, 106.95, 11.15],
    'Tiền Giang': [105.8, 10.2, 106.8, 10.6], 'Bến Tre': [106.0, 9.8, 106.85, 10.35], 'Đồng Tháp': [105.2, 10.3, 105.95, 10.95],
    'Vĩnh Long': [105.65, 9.85, 106.3, 10.35], 'Trà Vinh': [105.95, 9.5, 106.6, 10.05], 'An Giang': [104.75, 10.2, 105.6, 10.95],
    'Kiên Giang': [103.5, 9.35, 105.55, 10.55], 'Cần Thơ': [105.25, 9.9, 105.85, 10.35], 'Hậu Giang': [105.3, 9.55, 105.95, 10.05],
    'Sóc Trăng': [105.55, 9.2, 106.3, 9.95], 'Bạc Liêu': [105.2, 9.0, 105.85, 9.65], 'Cà Mau': [104.7, 8.55, 105.4, 9.55]
  };

  /**
   * Tự nhận kinh tuyến trục: thử từng KTT, chiếu tâm bản vẽ (E, N) ra kinh/vĩ độ,
   * chọn KTT mà vị trí rơi gần tâm nhất của một tỉnh dùng đúng KTT đó.
   * Trả về {lon0, prov} hoặc null.
   */
  /**
   * opt.names: Map tên tỉnh -> số lần xuất hiện trong chữ trên bản vẽ ("TỈNH ĐỒNG NAI"…)
   * opt.prefer: tên tỉnh người dùng đang chọn (ưu tiên phương án gần tỉnh này)
   * Trả về {lon0, prov, why, cands:[{lon0, prov}]} hoặc null.
   */
  function detectLon0(E, N, k, opt) {
    opt = opt || {};
    if (!(N > 800000 && N < 2700000 && E > 100000 && E < 900000)) return null;
    const lonOf = (name) => { const p = PROVINCES.find(q => q[0] === name); return p ? p[1] : null; };
    // 1. Tên tỉnh ghi trên bản vẽ
    if (opt.names && opt.names.size) {
      for (const [top] of Array.from(opt.names.entries()).sort((a, b) => b[1] - a[1])) {
        const l = lonOf(top), b = BBOX[top];
        if (l == null || !b) continue;
        // chỉ tin tên tỉnh khi theo KTT của tỉnh đó bản vẽ nằm trong (hoặc sát) tỉnh ấy
        const r = proj4(vn2000(l, k || 0.9999), 'WGS84', [E, N]), m = 0.3;
        if (r[0] >= b[0] - m && r[0] <= b[2] + m && r[1] >= b[1] - m && r[1] <= b[3] + m) return { lon0: l, prov: top, why: 'theo chữ trên bản vẽ', cands: [] };
      }
    }
    // 2. Vị trí: KTT nào đưa bản vẽ vào đúng một tỉnh dùng KTT đó
    const lons = Array.from(new Set(PROVINCES.map(p => p[1])));
    const cands = [];
    for (const lon0 of lons) {
      let r;
      try { r = proj4(vn2000(lon0, k || 0.9999), 'WGS84', [E, N]); } catch (e) { continue; }
      const x = r[0], y = r[1];
      let best = null;
      for (const [name, l] of PROVINCES) {
        if (l !== lon0) continue;
        const b = BBOX[name]; if (!b) continue;
        const m = 0.05;
        if (x < b[0] - m || x > b[2] + m || y < b[1] - m || y > b[3] + m) continue;
        const hx = (b[2] - b[0]) / 2, hy = (b[3] - b[1]) / 2;
        const s = Math.pow((x - (b[0] + hx)) / hx, 2) + Math.pow((y - (b[1] + hy)) / hy, 2);
        if (!best || s < best.s) best = { lon0, prov: name, s, x, y };
      }
      if (best) cands.push(best);
    }
    if (!cands.length) return null;
    const pb = opt.prefer && BBOX[opt.prefer];
    cands.sort((a, b) => a.s - b.s);
    if (pb) {
      // tỉnh đang chọn là "vùng làm việc": ưu tiên phương án nằm trong vùng lân cận (≈ 1,6°)
      const px = (pb[0] + pb[2]) / 2, py = (pb[1] + pb[3]) / 2;
      cands.forEach(c => { c.d = Math.hypot(c.x - px, c.y - py); });
      const near = cands.filter(c => c.d < (opt.R || 1.6));
      if (near.length) {
        const w = opt.w != null ? opt.w : 0.3;
        near.sort((a, b) => (a.s + w * a.d) - (b.s + w * b.d));
        const rest = cands.filter(c => near.indexOf(c) < 0);
        cands.length = 0; near.concat(rest).forEach(c => cands.push(c));
      }
    }
    const c = cands[0];
    return { lon0: c.lon0, prov: c.prov, why: 'theo vị trí', cands: cands.map(q => ({ lon0: q.lon0, prov: q.prov })) };
  }

  const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  /** Tìm "TỈNH …" / "THÀNH PHỐ …" trong chữ của bản vẽ. Trả về Map tên tỉnh -> số lần. */
  function provinceNames(features) {
    const keys = PROVINCES.map(([n]) => [n, fold(n.replace(/^TP\.\s*/, '')).replace(/\s*-\s*/g, ' ')]);
    const found = new Map();
    let n = 0;
    for (const f of features) {
      if (f.kind !== 'text' || !f.text) continue;
      if (++n > 50000) break;
      const t = fold(f.text).replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ');
      if (t.indexOf('tinh') < 0 && t.indexOf('thanh pho') < 0 && t.indexOf('tp') < 0) continue;
      for (const [name, k] of keys) {
        if (t.indexOf('tinh ' + k) >= 0 || t.indexOf('thanh pho ' + k) >= 0 || t.indexOf('tp ' + k) >= 0 || t.indexOf('tp. ' + k) >= 0) found.set(name, (found.get(name) || 0) + 1);
      }
    }
    return found;
  }

  function vn2000(lon0, k) {
    return '+proj=tmerc +lat_0=0 +lon_0=' + lon0 + ' +k=' + k + ' +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=' + TOWGS84 + ' +units=m +no_defs';
  }

  /** settings: {mode:'auto'|'vn3'|'vn6'|'utm48'|'utm49'|'wgs84', lon0, swap:'auto'|'yes'|'no'} */
  function projString(mode, lon0) {
    switch (mode) {
      case 'vn6': return vn2000(lon0, 0.9996);
      case 'utm48': return '+proj=utm +zone=48 +datum=WGS84 +units=m +no_defs';
      case 'utm49': return '+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs';
      case 'wgs84': return null;
      default: return vn2000(lon0, 0.9999);
    }
  }

  // Khung bao "bền": bỏ 0,1% điểm lạc hai đầu để một vài điểm rác không làm hỏng việc nhận dạng hệ tọa độ
  function bboxOf(features) {
    let n = 0;
    for (const f of features) n += f.pts.length;
    const step = Math.max(1, Math.floor(n / 40000));
    const xs = [], ys = [];
    let k = 0;
    for (const f of features) for (const p of f.pts) {
      if ((k++ % step) !== 0) continue;
      if (!isFinite(p[0]) || !isFinite(p[1])) continue;
      xs.push(p[0]); ys.push(p[1]);
    }
    if (!xs.length) return [Infinity, Infinity, -Infinity, -Infinity];
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    const lo = Math.floor(xs.length * 0.01), hi = Math.max(lo, Math.ceil(xs.length * 0.99) - 1);
    return [xs[lo], ys[lo], xs[hi], ys[hi]];
  }

  /** Đọc .prj (WKT) để đoán hệ tọa độ. Trả về {mode, lon0} hoặc null. */
  function fromPrj(wkt) {
    if (!wkt) return null;
    const s = wkt.toUpperCase();
    const isProj = /PROJCS|PROJCRS/.test(s);
    if (!isProj) return { mode: 'wgs84' };
    const cm = /CENTRAL_MERIDIAN"?\s*,\s*([-\d.]+)/.exec(s) || /LONGITUDE OF NATURAL ORIGIN"?\s*,\s*([-\d.]+)/.exec(s);
    const kf = /SCALE_FACTOR"?\s*,\s*([\d.]+)/.exec(s);
    const lon0 = cm ? parseFloat(cm[1]) : null;
    const k = kf ? parseFloat(kf[1]) : null;
    if (/VN.?2000|VN_2000|VN2000/.test(s)) {
      return { mode: k && Math.abs(k - 0.9996) < 1e-6 ? 'vn6' : 'vn3', lon0: lon0 || 105 };
    }
    if (/UTM/.test(s) && /WGS/.test(s)) {
      if (lon0 === 105) return { mode: 'utm48' };
      if (lon0 === 111) return { mode: 'utm49' };
    }
    return { mode: 'wkt', wkt };
  }

  /**
   * Tạo hàm chuyển tọa độ file -> [lat, lng] cho Leaflet.
   * Trả về {fn, info}.
   */
  function makeTransform(features, settings, prjHint) {
    const bb = bboxOf(features);
    let mode = settings.mode, lon0 = settings.lon0, wkt = null, note = '';
    const looksGeo0 = bb[0] >= -180 && bb[2] <= 180 && bb[1] >= -90 && bb[3] <= 90;
    if (prjHint && prjHint.mode === 'wgs84' && !looksGeo0) prjHint = null;
    if (prjHint && settings.usePrj !== false) {
      if (prjHint.mode === 'wkt') { mode = 'wkt'; wkt = prjHint.wkt; }
      else { mode = prjHint.mode; if (prjHint.lon0) lon0 = prjHint.lon0; }
      note = 'theo file .prj';
    }
    const looksGeo = bb[0] >= -180 && bb[2] <= 180 && bb[1] >= -90 && bb[3] <= 90;
    if (mode === 'auto') mode = looksGeo ? 'wgs84' : 'vn3';
    if (mode !== 'wgs84' && looksGeo && !prjHint) { mode = 'wgs84'; note = 'tọa độ dạng độ (lon/lat)'; }

    let swap = settings.swap === 'yes';
    if (settings.swap === 'auto' && mode !== 'wgs84') {
      // VN-2000: X(Đông) ~ 100.000–900.000 ; Y(Bắc) ~ 900.000–2.700.000
      const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
      if (cx > 900000 && cy < 900000) { swap = true; note += (note ? ', ' : '') + 'tự đảo X/Y'; }
    }
    let warn = '', detected = null;
    if (mode === 'vn3' || mode === 'vn6') {
      const n = swap ? (bb[0] + bb[2]) / 2 : (bb[1] + bb[3]) / 2;
      const e = swap ? (bb[1] + bb[3]) / 2 : (bb[0] + bb[2]) / 2;
      if (!(n > 800000 && n < 2700000 && e > 100000 && e < 900000)) warn = 'Tọa độ không giống VN-2000 (có thể là bản vẽ tọa độ giả định/cục bộ) nên sẽ không nằm đúng trên ảnh vệ tinh.';
      // File không có .prj (DGN, DWG, DXF…): tự nhận kinh tuyến trục theo vị trí
      else if (!note.includes('.prj') && settings.autoLon0 !== false) {
        const d = detectLon0(e, n, mode === 'vn6' ? 0.9996 : 0.9999, { names: provinceNames(features), prefer: settings.prov });
        if (d) { lon0 = d.lon0; note += (note ? ', ' : '') + 'tự nhận: ' + d.prov + ' ' + d.why; detected = d; }
      }
    }
    let fwd;
    if (mode === 'wgs84') {
      fwd = (p) => [p[1], p[0]];
    } else {
      const def = mode === 'wkt' ? wkt : projString(mode, lon0);
      const conv = proj4(def, 'WGS84');
      fwd = (p) => { const r = conv.forward(p); return [r[1], r[0]]; };
    }
    let fn = swap ? (p) => fwd([p[1], p[0]]) : fwd;
    // Bộ dữ liệu lớn: nội suy song tuyến trên lưới thay vì gọi proj4 cho từng đỉnh (nhanh hơn hàng chục lần, sai số < 1 cm)
    if (mode !== 'wgs84') {
      let nv = 0; for (const f of features) nv += f.pts.length;
      if (nv > 30000) fn = gridTransform(fn, bb, swap);
    }
    const label = describe(mode, lon0) + (note ? ' (' + note + ')' : '');
    return { fn, info: { mode, lon0, swap, label, bbox: bb, warn, detected, center: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] } };
  }

  /** Hàm chiếu nhanh: nội suy song tuyến từ lưới điểm đã chiếu chính xác. bb = bbox tọa độ file. */
  function gridTransform(exact, bb, swap) {
    const x0 = bb[0], y0 = bb[1], x1 = bb[2], y1 = bb[3];
    const w = x1 - x0, h = y1 - y0;
    if (!(w >= 0 && h >= 0) || !isFinite(w + h)) return exact;
    const n = 160;
    const nx = w < 1e-6 ? 1 : n, ny = h < 1e-6 ? 1 : n;
    const sx = nx > 1 ? w / (nx) : 0, sy = ny > 1 ? h / (ny) : 0;
    const lat = new Float64Array((nx + 1) * (ny + 1)), lng = new Float64Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const r = exact([x0 + i * sx, y0 + j * sy]);
      lat[j * (nx + 1) + i] = r[0]; lng[j * (nx + 1) + i] = r[1];
    }
    return (p) => {
      const x = p[0], y = p[1];
      if (x < x0 || x > x1 || y < y0 || y > y1) return exact(p);
      let fx = sx ? (x - x0) / sx : 0, fy = sy ? (y - y0) / sy : 0;
      let i = Math.min(nx - 1 < 0 ? 0 : nx - 1, Math.floor(fx)), j = Math.min(ny - 1 < 0 ? 0 : ny - 1, Math.floor(fy));
      fx -= i; fy -= j;
      const k = j * (nx + 1) + i, k2 = k + (nx + 1);
      const i1 = nx > 0 && sx ? 1 : 0, j1 = ny > 0 && sy ? (nx + 1) : 0;
      const a = lat[k] * (1 - fx) + lat[k + i1] * fx, b = lat[k + j1] * (1 - fx) + lat[k + j1 + i1] * fx;
      const c = lng[k] * (1 - fx) + lng[k + i1] * fx, d = lng[k + j1] * (1 - fx) + lng[k + j1 + i1] * fx;
      return [a * (1 - fy) + b * fy, c * (1 - fy) + d * fy];
    };
  }

  function describe(mode, lon0) {
    switch (mode) {
      case 'vn3': return 'VN-2000 múi 3°, KTT ' + fmtDeg(lon0);
      case 'vn6': return 'VN-2000 múi 6°, KTT ' + fmtDeg(lon0);
      case 'utm48': return 'WGS84 UTM 48N';
      case 'utm49': return 'WGS84 UTM 49N';
      case 'wkt': return 'Theo .prj';
      default: return 'WGS84 (độ)';
    }
  }
  function fmtDeg(d) { const a = Math.floor(d), m = Math.round((d - a) * 60); return a + '°' + String(m).padStart(2, '0') + "'"; }

  /** WGS84 [lat,lng] -> VN-2000 [x(Bắc), y(Đông)] theo cách ghi của ngành địa chính */
  function toVN2000(lat, lng, lon0, k) {
    const r = proj4('WGS84', vn2000(lon0, k || 0.9999), [lng, lat]);
    return { E: r[0], N: r[1] };
  }

  function vnWkt(lon0) {
    return 'PROJCS["VN_2000_TM3_KTT_' + lon0 + '",GEOGCS["GCS_VN_2000",DATUM["D_Vietnam_2000",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],' +
      'PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",' + lon0 + '],PARAMETER["Scale_Factor",0.9999],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
  }
  function wgsWkt() {
    return 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
  }

  global.CRS = { PROVINCES, BBOX, detectLon0, provinceNames, makeTransform, fromPrj, toVN2000, describe, fmtDeg, vnWkt, wgsWkt };
})(window);
