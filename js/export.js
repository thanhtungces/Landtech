/*
 * Xuất dữ liệu: DXF (CAD, cắm mốc), CSV, GeoJSON, Shapefile (zip), lưu file qua Android.
 * Tung_LandTech – © Nguyễn Thanh Tùng
 */
(function (global) {
  'use strict';
  const enc = new TextEncoder();

  // ---------- Lưu file ----------
  function toB64(u8) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  /** data: string | Uint8Array. Trả về thông báo để hiển thị. */
  async function save(name, data, mime) {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    mime = mime || 'application/octet-stream';
    if (global.AndroidBridge && AndroidBridge.saveStart && bytes.length > 4194304) {
      // file lớn: ghi từng phần 3 MB
      let r = String(AndroidBridge.saveStart(name, mime));
      if (r !== 'ok') return r;
      const CH = 3 * 1048576;
      for (let i = 0; i < bytes.length; i += CH) {
        r = String(AndroidBridge.saveAppend(toB64(bytes.subarray(i, i + CH))));
        if (r !== 'ok') { try { AndroidBridge.saveFinish(); } catch (e) { } return r; }
        await new Promise(res => setTimeout(res, 0));
      }
      return String(AndroidBridge.saveFinish());
    }
    if (global.AndroidBridge && AndroidBridge.saveFile) {
      const r = AndroidBridge.saveFile(name, mime, toB64(bytes));
      return String(r || ('Đã lưu ' + name));
    }
    // iPhone / iPad: mở bảng Chia sẻ → "Lưu vào Tệp" (hoặc gửi Zalo, mail…)
    if (isIOS() && navigator.canShare && global.File) {
      try {
        const file = new File([bytes], name, { type: mime });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return 'Đã lưu / chia sẻ ' + name;
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return 'Đã hủy lưu ' + name;
        // mất thao tác chạm (file lớn chuẩn bị lâu): chuyển sang tải xuống bên dưới
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: mime }));
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return 'Đã tải xuống ' + name + (isIOS() ? '\n(iPhone: xem trong ứng dụng Tệp → Tải về)' : '');
  }
  function share(name) {
    if (global.AndroidBridge && AndroidBridge.shareLast) { AndroidBridge.shareLast(); return true; }
    return false;
  }

  // ---------- CSV ----------
  function csv(rows) {
    const q = (v) => { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }

  // ---------- DXF (R12, đọc được ở mọi phiên bản CAD / MicroStation) ----------
  function dxf(model) {
    const out = [];
    const INTC = (c) => (c >= 60 && c <= 99) || (c >= 170 && c <= 189) || (c >= 270 && c <= 289) || (c >= 370 && c <= 389);
    const g = (code, val) => { out.push(String(code)); out.push(typeof val === 'number' ? (INTC(code) ? String(Math.round(val)) : fmt(val)) : String(val)); };
    const fmt = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(+n.toFixed(6)));
    const layers = model.layers || [];
    const safe = (s) => String(s).replace(/[<>\/\\":;?*|=`,]/g, '_');
    g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSUNITS'); g(70, 6);
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1);
    g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0.0);
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.length + 1);
    g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
    for (const l of layers) { g(0, 'LAYER'); g(2, safe(l.name)); g(70, 0); g(62, l.color || 7); g(6, 'CONTINUOUS'); }
    g(0, 'ENDTAB');
    g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1);
    g(0, 'STYLE'); g(2, 'STANDARD'); g(70, 0); g(40, 0.0); g(41, 1.0); g(50, 0.0); g(71, 0); g(42, 2.5); g(3, 'txt'); g(4, '');
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    for (const e of model.entities) {
      const ly = safe(e.layer || '0');
      if (e.type === 'polyline') {
        if (!e.pts || e.pts.length < 2) continue;
        g(0, 'POLYLINE'); g(8, ly); g(66, 1); g(10, 0.0); g(20, 0.0); g(30, 0.0); g(70, e.closed ? 1 : 0);
        for (const p of e.pts) { g(0, 'VERTEX'); g(8, ly); g(10, p[0]); g(20, p[1]); g(30, 0.0); }
        g(0, 'SEQEND'); g(8, ly);
      } else if (e.type === 'point') {
        g(0, 'POINT'); g(8, ly); g(10, e.p[0]); g(20, e.p[1]); g(30, 0.0);
      } else if (e.type === 'circle') {
        g(0, 'CIRCLE'); g(8, ly); g(10, e.p[0]); g(20, e.p[1]); g(30, 0.0); g(40, e.r);
      } else if (e.type === 'text') {
        if (!e.text) continue;
        g(0, 'TEXT'); g(8, ly); g(10, e.p[0]); g(20, e.p[1]); g(30, 0.0); g(40, e.h || 1); g(1, String(e.text).replace(/[\r\n]+/g, ' '));
        if (e.rot) g(50, e.rot);
        if (e.align) { g(72, e.align); g(11, e.p[0]); g(21, e.p[1]); g(31, 0.0); }
        g(7, 'STANDARD');
      }
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }

  // ---------- GeoJSON ----------
  function geojson(features, wgsFn) {
    const coord = (p) => { const ll = wgsFn(p); return [+ll[1].toFixed(9), +ll[0].toFixed(9)]; };
    const seen = new Set();
    const list = [];
    features.forEach(f => {
      if (f.kind === 'text') return;
      const props = {};
      Object.keys(f.props || {}).forEach(k => { if (!['color', 'style', 'align', 'etype'].includes(k)) props[k] = f.props[k]; });
      let geometry;
      if (f.kind === 'polygon') {
        const close = (r) => { const a = r.map(coord); const A = a[0], B = a[a.length - 1]; if (A[0] !== B[0] || A[1] !== B[1]) a.push(A.slice()); return a; };
        geometry = { type: 'Polygon', coordinates: [close(f.pts)].concat((f.holes || []).map(close)) };
      } else if (f.kind === 'line') geometry = { type: 'LineString', coordinates: f.pts.map(coord) };
      else geometry = { type: 'Point', coordinates: coord(f.pts[0]) };
      list.push({ type: 'Feature', properties: props, geometry });
    });
    return JSON.stringify({ type: 'FeatureCollection', features: list });
  }

  // ---------- Shapefile ----------
  function area2(ring) { let a = 0; for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; }

  function dbfBytes(rows, cols) {
    // cols: [{name, type:'C'|'N', len, dec}]
    const nRec = rows.length;
    const recLen = 1 + cols.reduce((s, c) => s + c.len, 0);
    const hdrLen = 32 + cols.length * 32 + 1;
    const buf = new Uint8Array(hdrLen + nRec * recLen + 1);
    const dv = new DataView(buf.buffer);
    const d = new Date();
    buf[0] = 3; buf[1] = d.getFullYear() - 1900; buf[2] = d.getMonth() + 1; buf[3] = d.getDate();
    dv.setUint32(4, nRec, true); dv.setUint16(8, hdrLen, true); dv.setUint16(10, recLen, true);
    buf[29] = 0x57;
    cols.forEach((c, i) => {
      const o = 32 + i * 32;
      buf.set(enc.encode(c.name).subarray(0, 10), o);
      buf[o + 11] = c.type.charCodeAt(0); buf[o + 16] = c.len; buf[o + 17] = c.dec || 0;
    });
    buf[hdrLen - 1] = 0x0d;
    let p = hdrLen;
    for (const r of rows) {
      buf[p++] = 0x20;
      cols.forEach((c, i) => {
        let v = r[i];
        let b;
        if (c.type === 'N') {
          let s = v == null || v === '' || !isFinite(+v) ? '' : (c.dec ? (+v).toFixed(c.dec) : String(Math.round(+v)));
          if (s.length > c.len) s = s.slice(0, c.len);
          b = enc.encode(s.padStart(c.len, ' '));
        } else {
          b = enc.encode(v == null ? '' : String(v));
          if (b.length > c.len) { // cắt theo byte, không làm hỏng ký tự UTF-8
            let n = c.len; while (n > 0 && (b[n] & 0xC0) === 0x80) n--; b = b.subarray(0, n);
          }
        }
        buf.set(b, p); for (let k = b.length; k < c.len; k++) buf[p + k] = 0x20;
        p += c.len;
      });
    }
    buf[p] = 0x1a;
    return buf;
  }

  function dbfColumns(fieldNames, rowsProps) {
    const used = new Set();
    return fieldNames.map(fn => {
      let nm = fn.replace(/[^\w]/g, '_').slice(0, 10) || 'F';
      let base = nm, k = 1;
      while (used.has(nm.toUpperCase())) { const suf = String(k++); nm = base.slice(0, 10 - suf.length) + suf; }
      used.add(nm.toUpperCase());
      let num = true, dec = 0, maxLen = 1;
      for (const r of rowsProps) {
        const v = r[fn];
        if (v == null || v === '') continue;
        if (typeof v !== 'number' && !(typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim().length < 18 && false)) num = false;
        const bl = enc.encode(String(v)).length; if (bl > maxLen) maxLen = bl;
        if (typeof v === 'number' && !Number.isInteger(v)) dec = Math.max(dec, Math.min(6, (String(v).split('.')[1] || '').length));
      }
      if (num) return { src: fn, name: nm, type: 'N', len: Math.min(19, Math.max(maxLen + dec, 10)), dec };
      return { src: fn, name: nm, type: 'C', len: Math.min(254, Math.max(maxLen, 1)), dec: 0 };
    });
  }

  /** Ghi một bộ shapefile cho 1 loại hình học. recs: [{parts:[ring..]|pts, props}] */
  function shpFiles(kind, recs, fieldNames) {
    const type = kind === 'polygon' ? 5 : kind === 'line' ? 3 : 1;
    const contents = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of recs) {
      const parts = r.parts;
      let nPts = 0; parts.forEach(p => nPts += p.length);
      let len;
      if (type === 1) len = 20; else len = 44 + 4 * parts.length + 16 * nPts;
      const b = new ArrayBuffer(len); const dv = new DataView(b);
      dv.setInt32(0, type, true);
      if (type === 1) {
        const p = parts[0][0]; dv.setFloat64(4, p[0], true); dv.setFloat64(12, p[1], true);
        x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]);
      } else {
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
        parts.forEach(pt => pt.forEach(p => { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); }));
        dv.setFloat64(4, bx0, true); dv.setFloat64(12, by0, true); dv.setFloat64(20, bx1, true); dv.setFloat64(28, by1, true);
        dv.setInt32(36, parts.length, true); dv.setInt32(40, nPts, true);
        let idx = 0, o = 44 + 4 * parts.length;
        parts.forEach((pt, i) => {
          dv.setInt32(44 + 4 * i, idx, true);
          pt.forEach(p => { dv.setFloat64(o, p[0], true); dv.setFloat64(o + 8, p[1], true); o += 16; });
          idx += pt.length;
        });
        x0 = Math.min(x0, bx0); x1 = Math.max(x1, bx1); y0 = Math.min(y0, by0); y1 = Math.max(y1, by1);
      }
      contents.push(new Uint8Array(b));
    }
    const shpLen = 100 + contents.reduce((s, c) => s + 8 + c.length, 0);
    const shp = new Uint8Array(shpLen), shx = new Uint8Array(100 + contents.length * 8);
    const hd = (u8, fileLen) => {
      const dv = new DataView(u8.buffer);
      dv.setInt32(0, 9994, false); dv.setInt32(24, fileLen / 2, false); dv.setInt32(28, 1000, true); dv.setInt32(32, type, true);
      if (!isFinite(x0)) { x0 = y0 = x1 = y1 = 0; }
      dv.setFloat64(36, x0, true); dv.setFloat64(44, y0, true); dv.setFloat64(52, x1, true); dv.setFloat64(60, y1, true);
    };
    hd(shp, shpLen); hd(shx, shx.length);
    let p = 100;
    const sdv = new DataView(shp.buffer), xdv = new DataView(shx.buffer);
    contents.forEach((c, i) => {
      sdv.setInt32(p, i + 1, false); sdv.setInt32(p + 4, c.length / 2, false);
      xdv.setInt32(100 + i * 8, p / 2, false); xdv.setInt32(104 + i * 8, c.length / 2, false);
      shp.set(c, p + 8); p += 8 + c.length;
    });
    const cols = dbfColumns(fieldNames, recs.map(r => r.props));
    const dbf = dbfBytes(recs.map(r => cols.map(c => r.props[c.src])), cols);
    return { shp, shx, dbf };
  }

  /** features: danh sách đối tượng của lớp; trả về Uint8Array zip. wgsFn dùng khi muốn xuất WGS84 (ghi kèm .prj phù hợp). */
  function shapefileZip(baseName, features, opts) {
    opts = opts || {};
    const groups = { polygon: [], line: [], point: [] };
    const ridMap = new Map();
    const fieldSet = [];
    const seenF = new Set();
    for (const f of features) {
      if (f.kind === 'text' || !groups[f.kind]) continue;
      Object.keys(f.props || {}).forEach(k => { if (!['color', 'style', 'align', 'etype', 'layer'].includes(k) && !seenF.has(k)) { seenF.add(k); fieldSet.push(k); } });
    }
    if (!fieldSet.length) fieldSet.push('ID');
    for (const f of features) {
      if (f.kind === 'text' || !groups[f.kind]) continue;
      const conv = opts.pt || ((p) => p);
      let parts;
      if (f.kind === 'polygon') {
        const fix = (r, wantCW) => {
          let a = r.map(conv);
          const A = a[0], B = a[a.length - 1];
          if (A[0] !== B[0] || A[1] !== B[1]) a.push(A.slice());
          const cw = area2(a) < 0;
          if (cw !== wantCW) a = a.reverse();
          return a;
        };
        parts = [fix(f.pts, true)].concat((f.holes || []).map(h => fix(h, false)));
      } else if (f.kind === 'line') parts = [f.pts.map(conv)]; else parts = [[conv(f.pts[0])]];
      const key = f.rid != null ? f.kind + ':' + f.rid : null;
      if (key && ridMap.has(key)) { ridMap.get(key).parts.push(...parts); continue; }
      const rec = { parts, props: f.props || {} };
      if (key) ridMap.set(key, rec);
      groups[f.kind].push(rec);
    }
    const kinds = Object.keys(groups).filter(k => groups[k].length);
    if (!kinds.length) throw new Error('Không có đối tượng hình học để xuất.');
    const files = {};
    kinds.forEach(k => {
      const nm = kinds.length > 1 ? baseName + '_' + { polygon: 'thua', line: 'duong', point: 'diem' }[k] : baseName;
      const r = shpFiles(k, groups[k], fieldSet);
      files[nm + '.shp'] = r.shp; files[nm + '.shx'] = r.shx; files[nm + '.dbf'] = r.dbf;
      files[nm + '.cpg'] = enc.encode('UTF-8');
      if (opts.prj) files[nm + '.prj'] = enc.encode(opts.prj);
    });
    return fflate.zipSync(files, { level: 6 });
  }

  global.Export = { save, share, csv, dxf, geojson, shapefileZip, enc };
})(window);
