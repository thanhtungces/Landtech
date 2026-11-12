/*
 * Bộ đọc Esri File Geodatabase (.gdb) thuần JavaScript – chỉ đọc (OpenFileGDB).
 * Đầu vào: map {tênFile -> Uint8Array} của thư mục .gdb (a0000000N.gdbtable / .gdbtablx).
 * Tung_LandTech – © Nguyễn Thanh Tùng
 */
(function (global) {
  'use strict';

  function Reader(u8) { this.b = u8; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); this.p = 0; }
  Reader.prototype = {
    u8() { return this.b[this.p++]; },
    u16() { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; },
    i16() { const v = this.dv.getInt16(this.p, true); this.p += 2; return v; },
    u32() { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; },
    i32() { const v = this.dv.getInt32(this.p, true); this.p += 4; return v; },
    f32() { const v = this.dv.getFloat32(this.p, true); this.p += 4; return v; },
    f64() { const v = this.dv.getFloat64(this.p, true); this.p += 8; return v; },
    varuint() {
      let r = 0, m = 1, c;
      do { c = this.b[this.p++]; r += (c & 0x7f) * m; m *= 128; } while (c & 0x80 && this.p < this.b.length);
      return r;
    },
    varint() {
      let c = this.b[this.p++];
      const neg = (c & 0x40) !== 0;
      let r = c & 0x3f, m = 64;
      while (c & 0x80 && this.p < this.b.length) { c = this.b[this.p++]; r += (c & 0x7f) * m; m *= 128; }
      return neg ? -r : r;
    },
    utf16(nChars) { let s = ''; for (let i = 0; i < nChars; i++) s += String.fromCharCode(this.u16()); return s; },
    utf8(n) { const s = new TextDecoder('utf-8').decode(this.b.subarray(this.p, this.p + n)); this.p += n; return s; }
  };

  function userErr(m) { const e = new Error(m); e.userMessage = m; return e; }

  function openTable(table, tablx) {
    const r = new Reader(table);
    if (table.length < 40) throw userErr('File bảng GDB hỏng.');
    const nValid = r.dv.getUint32(4, true);
    const fdOff = r.dv.getUint32(32, true);
    r.p = fdOff;
    const fdLen = r.u32();
    const fdEnd = r.p + fdLen;
    r.u32(); // version
    const geomType = r.u8();
    const gflagsTable = r.u8(); r.u8(); r.u8();
    const tableHasZ = !!(gflagsTable & 0x80), tableHasM = !!(gflagsTable & 0x40);
    const nFields = r.u16();
    const fields = [];
    let nullable = 0;
    for (let i = 0; i < nFields; i++) {
      const f = { name: r.utf16(r.u8()) };
      f.alias = r.utf16(r.u8());
      f.type = r.u8();
      f.nullable = false;
      switch (f.type) {
        case 4: { r.u32(); const fl = r.u8(); f.nullable = !!(fl & 1); if (fl & 4) { const dl = r.u8(); r.p += dl; } break; }
        case 6: r.u8(); r.u8(); break;
        case 7: {
          r.u8(); const fl = r.u8(); f.nullable = !!(fl & 1);
          const wl = r.u16(); const wkt = []; for (let k = 0; k < wl / 2; k++) wkt.push(String.fromCharCode(r.u16()));
          f.wkt = wkt.join('');
          const gf = r.u8();
          f.xorg = r.f64(); f.yorg = r.f64(); f.xyscale = r.f64();
          f.hasM = !!(gf & 2); f.hasZ = !!(gf & 4);
          if (gf & 2) { f.morg = r.f64(); f.mscale = r.f64(); }
          if (gf & 4) { f.zorg = r.f64(); f.zscale = r.f64(); }
          r.f64(); // xy tolerance
          if (gf & 2) r.f64();
          if (gf & 4) r.f64();
          r.p += 32; // bbox xy
          if (tableHasZ) r.p += 16;
          if (tableHasM) r.p += 16;
          r.u8(); const ng = r.u32(); r.p += ng * 8;
          break;
        }
        case 8: case 12: { r.u8(); const fl = r.u8(); f.nullable = !!(fl & 1); break; }
        case 10: case 11: { r.u8(); const fl = r.u8(); f.nullable = !!(fl & 1); break; }
        case 9: throw userErr('Bảng GDB có trường raster – chưa hỗ trợ.');
        default: { // số, ngày
          r.u8(); const fl = r.u8(); f.nullable = !!(fl & 1);
          if (fl & 4) { const dl = r.u8(); r.p += dl; }
        }
      }
      if (f.nullable) nullable++;
      fields.push(f);
    }
    // Chỉ mục dòng
    const x = new DataView(tablx.buffer, tablx.byteOffset, tablx.byteLength);
    const n1024 = x.getUint32(4, true);
    const offSize = x.getUint32(12, true) || 4;
    let slots = n1024 * 1024;
    slots = Math.min(slots, Math.floor((tablx.length - 16) / offSize));
    const rows = [];
    for (let i = 0; i < slots; i++) {
      const o = 16 + i * offSize;
      let off = 0;
      for (let k = offSize - 1; k >= 0; k--) off = off * 256 + tablx[o + k];
      if (off > 0 && off < table.length) rows.push([i + 1, off]);
    }
    return { r, fields, nullable, geomType, tableHasZ, tableHasM, rows, nValid, fdEnd };
  }

  function dateStr(days) {
    if (!isFinite(days)) return '';
    const ms = Math.round((days - 25569) * 86400000);
    const d = new Date(ms);
    return isNaN(d.getTime()) ? '' : d.toISOString().replace('T', ' ').replace(/\.000Z$/, '').replace(/ 00:00:00$/, '');
  }

  function readGeom(r, gf, tab, len) {
    const end = r.p + len;
    const gt = r.varuint();
    const type = gt & 0xff;
    const xs = gf.xyscale, xo = gf.xorg, yo = gf.yorg;
    if ([1, 9, 11, 21, 52].includes(type)) { // điểm
      const x = r.varuint(), y = r.varuint();
      if (!x && !y) return null;
      return { type: 'Point', coordinates: [(x - 1) / xs + xo, (y - 1) / xs + yo] };
    }
    if ([8, 18, 20, 28, 53].includes(type)) { // đa điểm
      const n = r.varuint();
      if (!n) return null;
      for (let i = 0; i < 4; i++) r.varuint();
      const pts = []; let vx = 0, vy = 0;
      for (let i = 0; i < n; i++) { vx += r.varint(); vy += r.varint(); pts.push([vx / xs + xo, vy / xs + yo]); }
      return { type: 'MultiPoint', coordinates: pts };
    }
    const isLine = [3, 10, 13, 23, 50].includes(type), isPoly = [5, 15, 19, 25, 51].includes(type);
    if (!isLine && !isPoly) { r.p = end; return null; }
    const nPts = r.varuint();
    if (!nPts) return null;
    const nParts = r.varuint();
    if (gt & 0x20000000) { r.varuint(); } // số đoạn cong (bỏ qua, vẽ bằng dây cung)
    for (let i = 0; i < 4; i++) r.varuint(); // bbox
    const counts = [];
    let sum = 0;
    for (let i = 0; i < nParts - 1; i++) { const c = r.varuint(); counts.push(c); sum += c; }
    counts.push(nPts - sum);
    const parts = [];
    let vx = 0, vy = 0;
    for (const c of counts) {
      const ring = [];
      for (let i = 0; i < c; i++) { vx += r.varint(); vy += r.varint(); ring.push([vx / xs + xo, vy / xs + yo]); }
      parts.push(ring);
    }
    if (!isPoly) {
      return parts.length === 1 ? { type: 'LineString', coordinates: parts[0] } : { type: 'MultiLineString', coordinates: parts };
    }
    // Gom vòng thành đa giác: vòng cùng chiều kim đồng hồ = vòng ngoài, ngược chiều = lỗ
    const polys = [];
    for (const ring of parts) {
      let a = 0;
      for (let i = 0; i < ring.length; i++) { const p = ring[i], q = ring[(i + 1) % ring.length]; a += p[0] * q[1] - q[0] * p[1]; }
      if (a <= 0 || !polys.length) polys.push([ring]); else polys[polys.length - 1].push(ring);
    }
    return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
  }

  function readRows(tab, limit) {
    const { r, fields } = tab;
    const out = [];
    const geoField = fields.find(f => f.type === 7);
    for (const [id, off] of tab.rows) {
      if (limit && out.length >= limit) break;
      r.p = off;
      const len = r.u32();
      const end = r.p + len;
      if (end > r.b.length) continue;
      const nb = Math.ceil(tab.nullable / 8);
      const nullBits = r.b.subarray(r.p, r.p + nb); r.p += nb;
      let ni = 0;
      const props = {};
      let geom = null;
      try {
        for (const f of fields) {
          if (f.type === 6) { props[f.name] = id; continue; }
          if (f.nullable) { const isNull = (nullBits[ni >> 3] >> (ni & 7)) & 1; ni++; if (isNull) { props[f.name] = null; continue; } }
          switch (f.type) {
            case 0: props[f.name] = r.i16(); break;
            case 1: props[f.name] = r.i32(); break;
            case 2: props[f.name] = r.f32(); break;
            case 3: props[f.name] = r.f64(); break;
            case 4: props[f.name] = r.utf8(r.varuint()); break;
            case 5: props[f.name] = dateStr(r.f64()); break;
            case 7: { const l = r.varuint(); const s = r.p; try { geom = readGeom(r, f, tab, l); } catch (e) { geom = null; } r.p = s + l; break; }
            case 8: case 12: { const l = r.varuint(); r.p += l; props[f.name] = f.type === 12 ? '[xml]' : '[blob]'; break; }
            case 10: case 11: { r.p += 16; break; }
            case 13: r.f64(); r.i16(); break;
            case 14: case 15: r.f64(); break;
            default: throw new Error('type');
          }
        }
      } catch (e) { /* bỏ qua dòng lỗi */ }
      out.push({ id, props, geom });
    }
    return out;
  }

  /** files: { 'a00000001.gdbtable': Uint8Array, ... } */
  function read(files) {
    const get = (name) => files[name.toLowerCase()];
    const cat = get('a00000001.gdbtable'), catx = get('a00000001.gdbtablx');
    if (!cat || !catx) throw userErr('Không tìm thấy bảng hệ thống của GDB (a00000001.gdbtable). Hãy nén cả thư mục .gdb thành .zip rồi mở.');
    const ct = openTable(cat, catx);
    const names = readRows(ct);
    const sets = [];
    for (const row of names) {
      const name = row.props.Name;
      if (!name || /^GDB_/i.test(name)) continue;
      const hex = ('00000000' + row.id.toString(16)).slice(-8);
      const t = get('a' + hex + '.gdbtable'), tx = get('a' + hex + '.gdbtablx');
      if (!t || !tx) continue;
      let tab;
      try { tab = openTable(t, tx); } catch (e) { continue; }
      const gf = tab.fields.find(f => f.type === 7);
      if (!gf) continue;
      const recs = readRows(tab);
      sets.push({ name, fields: tab.fields.filter(f => f.type !== 7).map(f => f.name), wkt: gf.wkt, recs });
    }
    if (!sets.length) throw userErr('GDB không có lớp không gian nào đọc được.');
    return sets;
  }

  global.GDB = { read };
})(window);
