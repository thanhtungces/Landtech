/*
 * Bộ đọc DGN MicroStation V7 (ISFF) viết thuần JavaScript.
 * Tham khảo cấu trúc định dạng theo thư viện dgnlib (GDAL).
 * DGN V8 (định dạng OLE của MicroStation V8/V8i) KHÔNG đọc được trực tiếp —
 * cần Save As V7 hoặc xuất DXF/DWG/SHP từ MicroStation.
 */
(function (global) {
  'use strict';

  // Màu mặc định khi file không có bảng màu (gần với bảng màu MicroStation).
  const DEFAULT_COLORS = ['#ffffff', '#0000ff', '#00ff00', '#ff0000', '#ffff00', '#ff00ff', '#ff7f00', '#00ffff',
    '#808080', '#c0c0c0', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080'];

  function int32(b, o) { // 32-bit "middle-endian" của DGN
    return ((b[o + 2] | (b[o + 3] << 8) | (b[o] << 16) | (b[o + 1] << 24)) | 0);
  }
  function uint16(b, o) { return b[o] | (b[o + 1] << 8); }

  const dv = new DataView(new ArrayBuffer(8));
  function vaxDouble(b, o) { // VAX D-float -> IEEE
    let hi = (b[o + 2] | (b[o + 3] << 8) | (b[o] << 16) | (b[o + 1] << 24)) >>> 0;
    let lo = (b[o + 6] | (b[o + 7] << 8) | (b[o + 4] << 16) | (b[o + 5] << 24)) >>> 0;
    const sign = hi & 0x80000000;
    let exp = (hi >>> 23) & 0xff;
    if (exp) exp = exp - 129 + 1023;
    const rnd = lo & 7;
    lo = ((lo >>> 3) & 0x1fffffff) | ((hi << 29) >>> 0);
    if (rnd) lo = lo | 1;
    hi = (hi >>> 3) & 0x000fffff;
    hi = (hi | (exp << 20) | sign) >>> 0;
    dv.setUint32(0, lo >>> 0, true);
    dv.setUint32(4, hi, true);
    return dv.getFloat64(0, true);
  }

  function isV8(bytes) {
    return bytes.length > 8 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0;
  }

  function parse(buffer) {
    const b = new Uint8Array(buffer);
    if (isV8(b)) {
      const e = new Error('DGN_V8');
      e.userMessage = 'File DGN này là định dạng V8 (MicroStation V8/V8i). App chỉ đọc trực tiếp DGN V7.\n' +
        'Cách xử lý: trong MicroStation chọn File > Save As > kiểu "MicroStation V7 DGN", ' +
        'hoặc File > Export > DWG/DXF, rồi mở lại file đó trong app.';
      throw e;
    }
    let scale = 1, ox = 0, oy = 0, dim = 2;
    let colors = DEFAULT_COLORS.slice();
    let hasColorTable = false, gotTcb = false;
    const ents = [];
    let off = 0;
    let complex = null; // nhóm đang gom cho complex chain/shape

    let cur = b; // phần tử đang đọc
    function pt(o) {
      const x = int32(cur, o), y = int32(cur, o + 4);
      return [x * scale - ox, y * scale - oy];
    }
    function colorOf(ci) {
      if (hasColorTable) return colors[ci] || '#ffffff';
      return DEFAULT_COLORS[ci] || hslColor(ci);
    }
    function flushComplex() {
      if (complex && complex.pts.length > 1) {
        ents.push({ t: 'line', pts: complex.pts, closed: complex.closed, layer: complex.layer, color: complex.color, style: complex.style, etype: complex.etype });
      }
      complex = null;
    }

    while (off + 4 <= b.length) {
      if (b[off] === 0xff && b[off + 1] === 0xff) break; // hết file
      const level = b[off] & 0x3f;
      const isComplex = (b[off] & 0x80) !== 0;
      const type = b[off + 1] & 0x7f;
      const deleted = (b[off + 1] & 0x80) !== 0;
      const wtf = uint16(b, off + 2);
      const size = (wtf + 2) * 2;
      if (size < 4 || off + size > b.length) break;
      const e = b.subarray(off, off + size);
      cur = e;
      off += size;
      if (deleted) continue;

      if (type === 9) { // TCB: đơn vị & gốc tọa độ (chỉ dùng TCB đầu tiên)
        if (!gotTcb && e.length >= 1264) {
          gotTcb = true;
          dim = (e[1214] & 0x40) ? 3 : 2;
          let subPerMaster = int32(e, 1112);
          let uorPerSub = int32(e, 1116);
          if (!subPerMaster) subPerMaster = 1;
          if (!uorPerSub) uorPerSub = 1;
          const uors = subPerMaster * uorPerSub;
          scale = 1 / uors;
          ox = vaxDouble(e, 1240) / uors;
          oy = vaxDouble(e, 1248) / uors;
        }
        continue;
      }
      if (type === 5 && level === 1 && e.length >= 38 + 768) { // bảng màu
        const c = [];
        for (let i = 0; i < 256; i++) {
          const o = i === 255 ? 38 : 41 + i * 3;
          c[i] = '#' + [e[o], e[o + 1], e[o + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
        }
        colors = c; hasColorTable = true;
        continue;
      }
      if (e.length < 36) continue;
      const ci = e[35];
      const style = e[34] & 7;
      const props = { layer: String(level), color: colorOf(ci), style, etype: type };

      // Kết thúc nhóm complex khi gặp phần tử không thuộc nhóm
      if (complex && (!isComplex || complex.left <= 0)) flushComplex();

      const ptSize = dim === 3 ? 12 : 8;
      switch (type) {
        case 12: case 14: { // complex chain / complex shape header
          flushComplex();
          const n = uint16(e, 38);
          complex = { pts: [], closed: type === 14, left: n, layer: props.layer, color: props.color, style, etype: type };
          break;
        }
        case 3: case 4: case 6: case 11: {
          let pts = [];
          if (type === 3) {
            pts = [pt(36), pt(36 + ptSize)];
          } else {
            const n = uint16(e, 36);
            for (let i = 0; i < n && 38 + (i + 1) * ptSize <= e.length; i++) pts.push(pt(38 + i * ptSize));
          }
          if (complex && isComplex) {
            if (complex.pts.length && pts.length && near(complex.pts[complex.pts.length - 1], pts[0])) pts.shift();
            complex.pts.push(...pts); complex.left--;
          } else if (pts.length > 1) {
            ents.push({ t: 'line', pts, closed: type === 6, ...props });
          } else if (pts.length === 1) {
            ents.push({ t: 'point', p: pts[0], ...props });
          }
          break;
        }
        case 15: case 16: { // ellipse / arc
          let a0 = 0, sweep = Math.PI * 2, o = 36;
          if (type === 16) {
            a0 = int32(e, 36) / 360000 * Math.PI / 180;
            const sv = int32(e, 40);
            let sw = (sv & 0x80000000) ? -(sv & 0x7fffffff) / 360000 : sv / 360000;
            if (sw === 0) sw = 360;
            sweep = sw * Math.PI / 180;
            o = 44;
          }
          const ra = vaxDouble(e, o) * scale;
          const rb = vaxDouble(e, o + 8) * scale;
          let rot = 0, co;
          if (dim === 2) {
            rot = int32(e, o + 16) / 360000 * Math.PI / 180;
            co = [vaxDouble(e, o + 20) * scale - ox, vaxDouble(e, o + 28) * scale - oy];
          } else {
            co = [vaxDouble(e, o + 32) * scale - ox, vaxDouble(e, o + 40) * scale - oy];
          }
          const pts = [];
          const n = Math.max(16, Math.ceil(Math.abs(sweep) / (Math.PI * 2) * 72));
          const cr = Math.cos(rot), sr = Math.sin(rot);
          for (let i = 0; i <= n; i++) {
            const a = a0 + sweep * i / n;
            const x = ra * Math.cos(a), y = rb * Math.sin(a);
            pts.push([co[0] + x * cr - y * sr, co[1] + x * sr + y * cr]);
          }
          if (complex && isComplex) {
            complex.pts.push(...pts); complex.left--;
          } else {
            ents.push({ t: 'line', pts, closed: type === 15, ...props });
          }
          break;
        }
        case 17: { // text
          let p, h, rot = 0, n, to;
          h = int32(e, 42) * scale * 6 / 1000;
          if (dim === 2) {
            rot = int32(e, 46) / 360000 * Math.PI / 180;
            p = pt(50); n = e[58]; to = 60;
          } else {
            p = pt(62); n = e[74]; to = 76;
          }
          let text = '';
          if (e[to] === 0xff && e[to + 1] === 0xfd) {
            for (let i = 2; i + 1 < n && to + i + 1 < e.length; i += 2) text += String.fromCharCode(uint16(e, to + i));
          } else {
            const bs = []; for (let i = 0; i < n && to + i < e.length; i++) bs.push(e[to + i]); text = CAD.tcvn3(bs);
          }
          ents.push({ t: 'text', p, text, h, rot, ...props });
          break;
        }
        default:
          break; // cell header (2), text node (7) ... các phần tử con vẫn được đọc riêng
      }
    }
    flushComplex();
    return { ents, blocks: {} };
  }

  function near(a, b) { return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9; }
  function hslColor(i) { return 'hsl(' + ((i * 47) % 360) + ',90%,60%)'; }

  global.DGN = { parse, isV8 };
})(window);
