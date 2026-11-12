/*
 * Bộ đọc DGN V8 / V8i (MicroStation V8) thuần JavaScript.
 * File V8 là OLE Compound File; các phần tử đồ họa nằm trong luồng "Dgn^G" của từng model,
 * mỗi luồng có 16 byte đầu + dữ liệu nén zlib.
 * Hỗ trợ: Line, Line string, Shape, Curve, Ellipse, Arc, Text, Complex chain/shape, Cell, Text node (thành phần).
 * Tung_LandTech – © Nguyễn Thanh Tùng
 */
(function (global) {
  'use strict';

  const COLORS = ['#ffffff', '#0000ff', '#00ff00', '#ff0000', '#ffff00', '#ff00ff', '#ff7f00', '#00ffff',
    '#804000', '#c0c0c0', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080'];
  function color(ci) { return COLORS[ci] || ('hsl(' + ((ci * 47) % 360) + ',90%,60%)'); }

  function isV8(u8) { return global.OLE && OLE.isOle(u8); }

  function inflate(u8) {
    if (global.fflate && fflate.unzlibSync) return fflate.unzlibSync(u8);
    throw new Error('Thiếu thư viện giải nén');
  }

  function cp1252(bytes) {
    try { return new TextDecoder('windows-1252').decode(bytes); } catch (e) { return String.fromCharCode.apply(null, bytes); }
  }

  /** Giải mã một chuỗi byte (đã giải nén) thành các phần tử thô. */
  function elementsOf(z) {
    const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
    const out = [];
    let p = 0;
    while (p + 16 <= z.length) {
      const tw = dv.getUint32(p + 4, true), sz = dv.getUint32(p + 8, true);
      if (!sz || sz > 0x3fffffff || p + 4 + sz * 2 > z.length) break;
      out.push({ o: p + 4, type: tw & 0xffff, flags: tw >>> 16, end: p + 4 + sz * 2, geoEnd: p + 4 + Math.min(sz, dv.getUint32(p + 12, true) || sz) * 2 });
      p += 4 + sz * 2;
    }
    return { dv, z, els: out };
  }

  function parse(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const ole = OLE.parse(u8);
    // Các luồng đồ họa: .../Dgn?G/$n  (không lấy Dgn?GA = thuộc tính)
    const groups = {};
    for (const e of ole.streams) {
      const parts = e.path.split('/');
      if (parts.length < 3) continue;
      const parent = parts[parts.length - 2];
      if (/^Dgn.G$/.test(parent) && /^\$\d+$/.test(e.name)) {
        const key = parts.slice(0, -1).join('/');
        (groups[key] = groups[key] || []).push(e);
      }
    }
    const keys = Object.keys(groups).sort();
    if (!keys.length) throw userErr('Không tìm thấy dữ liệu đồ họa trong file DGN V8 (cấu trúc lạ).');
    const ents = [];
    let nEl = 0, nSkip = 0;
    for (const key of keys) {
      const list = groups[key].sort((a, b) => parseInt(a.name.slice(1)) - parseInt(b.name.slice(1)));
      for (const st of list) {
        let data = ole.read(st);
        if (data.length <= 16) continue;
        let z;
        try { z = (data[16] === 0x78) ? inflate(data.subarray(16)) : data.subarray(16); } catch (e) { continue; }
        const r = decodeChunk(z);
        nEl += r.n; nSkip += r.skip;
        for (const x of r.ents) ents.push(x);
      }
    }
    // Chữ thiếu chiều cao thật: suy từ tỉ lệ chiều cao / hệ số chiều cao của các chữ khác trong file
    const rs = [];
    for (const e of ents) if (e.t === 'text' && e.hr && e.hm > 0 && isFinite(e.hm)) rs.push(e.h / e.hm);
    rs.sort((a, b) => a - b);
    const ratio = rs.length ? rs[rs.length >> 1] : 0.006;
    for (const e of ents) if (e.t === 'text') { if (!e.hr && e.hm > 0 && isFinite(e.hm)) e.h = e.hm * ratio; delete e.hm; delete e.hr; }
    return { ents, blocks: {}, v8: { elements: nEl, skipped: nSkip, models: keys.length } };
  }

  function userErr(msg) { const e = new Error(msg); e.userMessage = msg; return e; }

  function decodeChunk(z) {
    const { dv, els } = elementsOf(z);
    const ents = [];
    let skip = 0;
    const f64 = (o) => dv.getFloat64(o, true);
    const u32 = (o) => dv.getUint32(o, true);
    const u16 = (o) => dv.getUint16(o, true);

    function props(e) {
      const o = e.o;
      // Header phần tử V8: +12 level (20 bit), +44 kiểu nét, +48 lực nét, +52 màu
      const level = u32(o + 12) & 0xfffff;
      const ci = u32(o + 52);
      const style = dv.getInt32(o + 44, true);
      return { layer: String(level), color: color(ci > 4096 ? 0 : ci), style: style > 0 && style < 8 ? style : 0, etype: e.type, is3d: !!(u32(o + 40) & 0x800) };
    }

    function ptsAt(start, n, e, is3d) {
      // chọn 2D/3D theo chỗ trống còn lại
      const room = e.geoEnd - start;
      let dim = is3d ? 3 : 2;
      if (dim === 3 && room < n * 24) dim = 2;
      if (dim === 2 && room < n * 16 && room >= n * 24) dim = 3;
      if (room < n * dim * 8) return null;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const x = f64(start + i * dim * 8), y = f64(start + i * dim * 8 + 8);
        pts.push([x, y]);
      }
      return pts;
    }

    function quatRot(o) { // quaternion (w,x,y,z) -> góc quay quanh Z
      const w = f64(o), x = f64(o + 8), y = f64(o + 16), zz = f64(o + 24);
      return Math.atan2(2 * (w * zz + x * y), 1 - 2 * (y * y + zz * zz));
    }

    // Trả về {pts, closed} hoặc {text...} cho phần tử đơn giản
    function geom(e, pr) {
      const o = e.o, b = o + 104;
      switch (e.type) {
        case 3: {
          const dim = (e.geoEnd - b) >= 48 && pr.is3d ? 3 : ((e.geoEnd - b) >= 32 ? 2 : 0);
          if (!dim) return null;
          const d = dim * 8;
          return { pts: [[f64(b), f64(b + 8)], [f64(b + d), f64(b + d + 8)]], closed: false };
        }
        case 4: case 6: case 11: {
          const n = u32(b);
          if (!n || n > 2000000) return null;
          const pts = ptsAt(b + 8, n, e, pr.is3d);
          return pts ? { pts, closed: e.type === 6 } : null;
        }
        case 15: case 16: {
          let a0 = 0, sweep = Math.PI * 2, q = b;
          if (e.type === 16) { a0 = f64(b); sweep = f64(b + 8); q = b + 16; }
          const ra = f64(q), rb = f64(q + 8);
          let rot, cx, cy;
          if (pr.is3d && e.geoEnd - q >= 9 * 8) { rot = quatRot(q + 16); cx = f64(q + 48); cy = f64(q + 56); }
          else { rot = f64(q + 16); cx = f64(q + 24); cy = f64(q + 32); }
          if (!isFinite(ra + rb + rot + cx + cy + a0 + sweep)) return null;
          const n = Math.max(16, Math.ceil(Math.abs(sweep) / (Math.PI * 2) * 72));
          const pts = [], cr = Math.cos(rot), sr = Math.sin(rot);
          for (let i = 0; i <= n; i++) {
            const a = a0 + sweep * i / n, x = ra * Math.cos(a), y = rb * Math.sin(a);
            pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
          }
          return { pts, closed: e.type === 15 };
        }
        default: return null;
      }
    }

    function textOf(e, pr) {
      const o = e.o, b = o + 104;
      // b+32: chiều cao thật (có ở phần lớn chữ); b+16: hệ số chiều cao (đơn vị khác) – dùng khi thiếu b+32
      const hb = f64(b + 32), hm = f64(b + 16);
      const hr = hb > 0 && isFinite(hb) && hb < 1e12;
      const h = hr ? hb : hm;
      let rot, ox, oy, s;
      if (pr.is3d) { rot = quatRot(b + 40); ox = f64(b + 72); oy = f64(b + 80); s = b + 96; }
      else { rot = f64(b + 40); ox = f64(b + 48); oy = f64(b + 56); s = b + 64; }
      if (!isFinite(h + rot + ox + oy)) return null;
      const end = e.geoEnd;
      if (s + 2 > end) return null;
      let p = s + 2, text = '';
      const bytes = new Uint8Array(z.buffer, z.byteOffset + p, Math.max(0, end - p));
      let q = 0;
      if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xfe) q = 4;
      else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfd) {
        for (let i = 2; i + 1 < bytes.length; i += 2) { const c = bytes[i] | (bytes[i + 1] << 8); if (!c) break; text += String.fromCharCode(c); }
        return text ? { p: [ox, oy], text, h, rot, hm, hr } : null;
      }
      let m = q; while (m < bytes.length && bytes[m] !== 0) m++;
      text = CAD.tcvn3(bytes.subarray(q, m));
      return text ? { p: [ox, oy], text, h, rot, hm, hr } : null;
    }

    let n = 0;
    for (let i = 0; i < els.length; i++) {
      const e = els[i];
      n++;
      const isHeader = (e.flags & 0x2000) !== 0;
      try {
        if (isHeader && (e.type === 12 || e.type === 14)) {
          const cnt = u32(e.o + 104);
          const pr = props(e);
          const pts = [];
          let k = 0;
          while (k < cnt && i + 1 < els.length && (els[i + 1].flags & 0x4000)) {
            i++; n++; k++;
            const c = els[i];
            const g = geom(c, Object.assign({}, pr, { is3d: !!(u32(c.o + 40) & 0x800) }));
            if (!g) continue;
            const a = pts[pts.length - 1];
            if (a && g.pts.length && Math.abs(a[0] - g.pts[0][0]) < 1e-6 && Math.abs(a[1] - g.pts[0][1]) < 1e-6) g.pts.shift();
            for (const p of g.pts) pts.push(p);
          }
          if (pts.length > 1) ents.push({ t: 'line', pts, closed: e.type === 14, layer: pr.layer, color: pr.color, style: pr.style, etype: e.type });
          continue;
        }
        if (isHeader) continue; // cell, text node, bspline header...: thành phần được xử lý riêng
        const pr = props(e);
        if (e.type === 17) {
          const t = textOf(e, pr);
          if (t) ents.push({ t: 'text', p: t.p, text: t.text, h: t.h, rot: t.rot, hm: t.hm, hr: t.hr, layer: pr.layer, color: pr.color, style: 0, etype: 17 });
          else skip++;
          continue;
        }
        const g = geom(e, pr);
        if (!g) { if ([3, 4, 6, 11, 15, 16].includes(e.type)) skip++; continue; }
        if (g.pts.some(p => !isFinite(p[0]) || !isFinite(p[1]))) { skip++; continue; }
        if (g.pts.length === 1) ents.push({ t: 'point', p: g.pts[0], layer: pr.layer, color: pr.color, style: 0, etype: e.type });
        else ents.push({ t: 'line', pts: g.pts, closed: g.closed, layer: pr.layer, color: pr.color, style: pr.style, etype: e.type });
      } catch (err) { skip++; }
    }
    return { ents, n, skip };
  }

  function median(a) { if (!a.length) return NaN; a.sort((x, y) => x - y); return a[a.length >> 1]; }
  function sampleXY(model) {
    const xs = [], ys = [];
    const step = Math.max(1, Math.floor(model.ents.length / 20000));
    for (let i = 0; i < model.ents.length; i += step) {
      const e = model.ents[i]; const p = e.pts ? e.pts[0] : e.p;
      if (p && isFinite(p[0]) && isFinite(p[1]) && (p[0] !== 0 || p[1] !== 0)) { xs.push(p[0]); ys.push(p[1]); }
    }
    return { mx: median(xs), my: median(ys) };
  }
  // Gốc tọa độ (Global Origin) hay gặp: (0,0) và chuẩn bản đồ địa chính X = 500.000 m, Y = 1.000.000 m
  const ORIGINS = [[0, 0], [500000, 1000000]];
  const okVN = (a, b) => (a > 100000 && a < 900000 && b > 800000 && b < 2700000) || (b > 100000 && b < 900000 && a > 800000 && a < 2700000);
  /**
   * Chọn hệ số đổi UOR -> mét (và gốc tọa độ) theo trung vị tọa độ
   * (không bị một vài phần tử lạc ở gốc 0,0 làm sai). Gốc tìm được ghi vào model.origin.
   */
  function autoScale(model, forced) {
    model.origin = [0, 0];
    const { mx, my } = sampleXY(model);
    if (forced && forced > 0) {
      if (isFinite(mx)) for (const o of ORIGINS) if (okVN(mx / forced + o[0], my / forced + o[1])) { model.origin = o; break; }
      return forced;
    }
    if (!isFinite(mx)) return 1;
    for (const d of [1e3, 1e6, 1, 1e4, 1e5, 1e2]) for (const o of ORIGINS) if ((!o[0] || Math.max(Math.abs(mx / d), Math.abs(my / d)) > 10000) && okVN(mx / d + o[0], my / d + o[1])) { model.origin = o; return d; }
    const m = Math.max(Math.abs(mx), Math.abs(my));
    return m >= 1e8 ? 1e6 : m >= 1e5 ? 1e3 : 1;
  }
  /** Bản vẽ đã ở đơn vị mét (DGN V7): chỉ dò gốc tọa độ. */
  function autoOrigin(model) {
    model.origin = [0, 0];
    const { mx, my } = sampleXY(model);
    if (!isFinite(mx) || okVN(mx, my) || Math.max(Math.abs(mx), Math.abs(my)) <= 10000) return model.origin;
    for (const o of ORIGINS) if (okVN(mx + o[0], my + o[1])) { model.origin = o; break; }
    return model.origin;
  }
  function rescale(model, d) {
    const k = 1 / d, ox = (model.origin || [0, 0])[0], oy = (model.origin || [0, 0])[1];
    if (d !== 1 || ox || oy) for (const e of model.ents) {
      if (e.pts) for (const p of e.pts) { p[0] = p[0] * k + ox; p[1] = p[1] * k + oy; }
      if (e.p) { e.p[0] = e.p[0] * k + ox; e.p[1] = e.p[1] * k + oy; }
      if (e.t === 'text') e.h *= k;
    }
    // Bỏ phần tử lạc xa (>150 km so với trung vị) – thường là rác ở gốc tọa độ
    const { mx, my } = sampleXY(model);
    if (isFinite(mx) && Math.max(Math.abs(mx), Math.abs(my)) > 50000) {
      const far = (p) => Math.abs(p[0] - mx) > 150000 || Math.abs(p[1] - my) > 150000;
      const before = model.ents.length;
      model.ents = model.ents.filter(e => { const p = e.pts ? e.pts[0] : e.p; return !(p && far(p)); });
      model.dropped = before - model.ents.length;
    }
  }

  global.DGN8 = { parse, isV8, autoScale, autoOrigin, rescale };
})(window);
