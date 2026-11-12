/*
 * Bộ đọc OLE Compound File (CFB) thuần JavaScript – dùng cho DGN V8 (MicroStation V8/V8i).
 * Tung_LandTech – © Nguyễn Thanh Tùng
 */
(function (global) {
  'use strict';
  const FREE = 0xFFFFFFFA; // các giá trị >= FREE là mã đặc biệt (ENDOFCHAIN, FREESECT...)

  function isOle(u8) {
    return u8.length > 512 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0 &&
      u8[4] === 0xA1 && u8[5] === 0xB1 && u8[6] === 0x1A && u8[7] === 0xE1;
  }

  function parse(buffer) {
    const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (!isOle(u8)) throw new Error('Không phải file OLE');
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const ss = 1 << dv.getUint16(30, true), ms = 1 << dv.getUint16(32, true);
    const dirStart = dv.getUint32(48, true), cutoff = dv.getUint32(56, true);
    const miniFatStart = dv.getUint32(60, true);
    let difatStart = dv.getUint32(68, true);
    const nDifat = dv.getUint32(72, true);
    const secOff = (id) => (id + 1) * ss;

    // DIFAT -> danh sách sector của FAT
    const fatSecs = [];
    for (let i = 0; i < 109; i++) { const v = dv.getUint32(76 + i * 4, true); if (v < FREE) fatSecs.push(v); }
    let guard = 0;
    while (difatStart < FREE && guard++ < nDifat + 4) {
      const o = secOff(difatStart);
      if (o + ss > u8.length) break;
      for (let i = 0; i < ss / 4 - 1; i++) { const v = dv.getUint32(o + i * 4, true); if (v < FREE) fatSecs.push(v); }
      difatStart = dv.getUint32(o + ss - 4, true);
    }
    const per = ss / 4;
    const fat = new Uint32Array(fatSecs.length * per);
    fatSecs.forEach((s, k) => {
      const o = secOff(s);
      if (o + ss > u8.length) return;
      for (let i = 0; i < per; i++) fat[k * per + i] = dv.getUint32(o + i * 4, true);
    });

    function chain(start, table) {
      const out = []; let s = start, n = 0;
      while (s < FREE && s < table.length && n++ < 10000000) { out.push(s); s = table[s]; }
      return out;
    }
    function readBig(start, size) {
      const secs = chain(start, fat);
      const out = new Uint8Array(size != null ? size : secs.length * ss);
      let p = 0;
      for (const s of secs) {
        if (p >= out.length) break;
        const o = secOff(s);
        const len = Math.min(ss, out.length - p, u8.length - o);
        if (len <= 0) break;
        out.set(u8.subarray(o, o + len), p); p += len;
      }
      return out;
    }

    // Thư mục
    const dirBytes = readBig(dirStart);
    const ddv = new DataView(dirBytes.buffer);
    const entries = [];
    for (let i = 0; i < dirBytes.length / 128; i++) {
      const b = i * 128;
      const nl = ddv.getUint16(b + 64, true);
      let name = '';
      for (let k = 0; k < Math.max(0, nl - 2) / 2; k++) name += String.fromCharCode(ddv.getUint16(b + k * 2, true));
      entries.push({
        id: i, name, type: dirBytes[b + 66],
        left: ddv.getUint32(b + 68, true), right: ddv.getUint32(b + 72, true), child: ddv.getUint32(b + 76, true),
        start: ddv.getUint32(b + 116, true), size: ddv.getUint32(b + 120, true) + ddv.getUint32(b + 124, true) * 4294967296,
        path: ''
      });
    }
    // Dựng cây
    function walk(id, prefix, seen) {
      if (id >= 0xFFFFFFFA || id >= entries.length || seen.has(id)) return;
      seen.add(id);
      const e = entries[id];
      walk(e.left, prefix, seen);
      e.path = prefix + '/' + e.name;
      if (e.type === 1 || e.type === 5) walk(e.child, e.path, seen);
      walk(e.right, prefix, seen);
    }
    if (entries.length) { entries[0].path = ''; walk(entries[0].child, '', new Set([0])); }

    // Mini stream
    let mini = null, miniFat = null;
    function ensureMini() {
      if (mini) return;
      const root = entries[0];
      mini = readBig(root.start, root.size);
      const mf = readBig(miniFatStart);
      const mdv = new DataView(mf.buffer);
      miniFat = new Uint32Array(mf.length / 4);
      for (let i = 0; i < miniFat.length; i++) miniFat[i] = mdv.getUint32(i * 4, true);
    }
    function read(e) {
      if (e.size < cutoff) {
        ensureMini();
        const secs = chain(e.start, miniFat);
        const out = new Uint8Array(e.size);
        let p = 0;
        for (const s of secs) {
          if (p >= out.length) break;
          const len = Math.min(ms, out.length - p);
          out.set(mini.subarray(s * ms, s * ms + len), p); p += len;
        }
        return out;
      }
      return readBig(e.start, e.size);
    }
    return { entries, read, streams: entries.filter(e => e.type === 2) };
  }

  global.OLE = { parse, isOle };
})(window);
