/*
 * Chuẩn hóa thực thể CAD (DXF / DWG / DGN) về một dạng chung rồi "explode"
 * (bung block, tính cung tròn, bulge) thành danh sách đối tượng theo tọa độ gốc của file.
 *
 * Dạng chung:
 *  {t:'line', pts:[[x,y]..], closed}
 *  {t:'circle', c:[x,y], r}
 *  {t:'arc', c, r, a0, a1}            (radian, ngược chiều kim đồng hồ)
 *  {t:'ellipse', c, major:[dx,dy], ratio, a0, a1}
 *  {t:'text', p, text, h, rot}
 *  {t:'point', p}
 *  {t:'insert', name, p, sx, sy, rot}
 *  + layer, color
 */
(function (global) {
  'use strict';

  // ---------- Bảng màu AutoCAD (ACI) ----------
  const ACI = (function () {
    const t = [];
    const base = ['#000000', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ffffff', '#414141', '#808080'];
    for (let i = 0; i < 10; i++) t[i] = base[i];
    const vals = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3];
    for (let i = 10; i < 250; i++) {
      const hue = Math.floor((i - 10) / 10) * 15;
      const k = i % 10;
      const v = vals[k], s = k % 2 === 0 ? 1 : 0.5;
      t[i] = hsv(hue, s, v);
    }
    const grays = [51, 91, 132, 173, 214, 255];
    for (let i = 250; i < 256; i++) { const g = grays[i - 250].toString(16).padStart(2, '0'); t[i] = '#' + g + g + g; }
    return t;
  })();
  function hsv(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(Math.min(k, 4 - k, 1), 0); };
    return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }
  function aciColor(i) { if (i == null || i === 256 || i === 0 || i === 7) return '#ffffff'; return ACI[Math.abs(i)] || '#ffffff'; }
  function rgbColor(c) { return '#' + (c & 0xffffff).toString(16).padStart(6, '0'); }

  // ---------- DXF (dxf-parser) ----------
  function fromDxf(dxf) {
    const layerColors = {};
    const layers = (dxf.tables && dxf.tables.layer && dxf.tables.layer.layers) || {};
    Object.keys(layers).forEach(n => {
      const L = layers[n];
      layerColors[n] = L.colorIndex != null ? aciColor(L.colorIndex) : (L.color != null ? rgbColor(L.color) : '#ffffff');
    });
    const D = Math.PI / 180;
    function col(e) {
      if (e.colorIndex != null && e.colorIndex !== 256 && e.colorIndex !== 0) return aciColor(e.colorIndex);
      if (e.colorIndex == null && e.color != null && e.color !== 0) return rgbColor(e.color);
      return layerColors[e.layer] || '#ffffff';
    }
    function conv(e) {
      const base = { layer: e.layer || '0', color: col(e), etype: e.type };
      const P = (v) => [v.x, v.y];
      switch (e.type) {
        case 'LINE': return e.vertices && e.vertices.length >= 2 ? { t: 'line', pts: [P(e.vertices[0]), P(e.vertices[1])], ...base } : null;
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          if (!e.vertices || e.vertices.length < 1) return null;
          const closed = !!e.shape || ((e.flags || 0) & 1) === 1;
          return { t: 'line', pts: bulgePts(e.vertices.map(v => ({ x: v.x, y: v.y, bulge: v.bulge || 0 })), closed), closed, ...base };
        }
        case 'CIRCLE': return { t: 'circle', c: P(e.center), r: e.radius, ...base };
        case 'ARC': return { t: 'arc', c: P(e.center), r: e.radius, a0: e.startAngle, a1: e.endAngle, ...base };
        case 'ELLIPSE': return { t: 'ellipse', c: P(e.center), major: P(e.majorAxisEndPoint), ratio: e.axisRatio, a0: e.startAngle || 0, a1: e.endAngle == null ? Math.PI * 2 : e.endAngle, ...base };
        case 'POINT': return e.position ? { t: 'point', p: P(e.position), ...base } : null;
        case 'TEXT':
        case 'ATTRIB': {
          const p = (e.halign || e.valign) && e.endPoint ? e.endPoint : e.startPoint;
          if (!p) return null;
          return { t: 'text', p: P(p), text: cleanText(e.text), h: e.textHeight || 1, rot: (e.rotation || 0) * D, align: e.halign, ...base };
        }
        case 'MTEXT': {
          if (!e.position) return null;
          let rot = (e.rotation || 0) * D;
          if (e.directionVector) rot = Math.atan2(e.directionVector.y, e.directionVector.x);
          return { t: 'text', p: P(e.position), text: cleanMText(e.text), h: e.height || 1, rot, ...base };
        }
        case 'INSERT': return { t: 'insert', name: e.name, p: P(e.position || { x: 0, y: 0 }), sx: e.xScale || 1, sy: e.yScale || 1, rot: (e.rotation || 0) * D, ...base };
        case 'SOLID':
        case '3DFACE': {
          const v = e.points || e.vertices;
          if (!v || v.length < 3) return null;
          const pts = v.map(P);
          if (e.type === 'SOLID' && pts.length === 4) { const t = pts[2]; pts[2] = pts[3]; pts[3] = t; }
          return { t: 'line', pts, closed: true, ...base };
        }
        case 'SPLINE': {
          const v = (e.fitPoints && e.fitPoints.length > 1) ? e.fitPoints : e.controlPoints;
          if (!v || v.length < 2) return null;
          return { t: 'line', pts: v.map(P), closed: !!e.closed, ...base };
        }
        default: return null;
      }
    }
    const ents = (dxf.entities || []).map(conv).filter(Boolean);
    const blocks = {};
    Object.keys(dxf.blocks || {}).forEach(n => {
      const B = dxf.blocks[n];
      blocks[n] = { base: B.position ? [B.position.x, B.position.y] : [0, 0], ents: (B.entities || []).map(conv).filter(Boolean) };
    });
    return { ents, blocks };
  }

  // ---------- DWG (libredwg-web DwgDatabase) ----------
  function fromDwg(db) {
    const layerColors = {};
    ((db.tables && db.tables.LAYER && db.tables.LAYER.entries) || []).forEach(L => {
      layerColors[L.name] = L.colorIndex != null ? aciColor(L.colorIndex) : (L.color != null ? rgbColor(L.color) : '#ffffff');
    });
    function col(e) {
      if (e.colorIndex != null && e.colorIndex !== 256 && e.colorIndex !== 0) return aciColor(e.colorIndex);
      if (e.colorIndex == null && e.color != null) return rgbColor(e.color);
      return layerColors[e.layer] || '#ffffff';
    }
    const P = (v) => [v.x, v.y];
    function conv(e) {
      const base = { layer: e.layer || '0', color: col(e), etype: e.type };
      switch (e.type) {
        case 'LINE': return { t: 'line', pts: [P(e.startPoint), P(e.endPoint)], ...base };
        case 'LWPOLYLINE': {
          const closed = !!((e.flag || 0) & 512);
          return { t: 'line', pts: bulgePts(e.vertices || [], closed), closed, ...base };
        }
        case 'POLYLINE2D':
        case 'POLYLINE3D': {
          const closed = !!((e.flag || 0) & 1);
          return { t: 'line', pts: bulgePts(e.vertices || [], closed), closed, ...base };
        }
        case 'CIRCLE': return { t: 'circle', c: P(e.center), r: e.radius, ...base };
        case 'ARC': return { t: 'arc', c: P(e.center), r: e.radius, a0: e.startAngle, a1: e.endAngle, ...base };
        case 'ELLIPSE': return { t: 'ellipse', c: P(e.center), major: P(e.majorAxisEndPoint), ratio: e.axisRatio, a0: e.startAngle || 0, a1: e.endAngle == null ? Math.PI * 2 : e.endAngle, ...base };
        case 'POINT': return { t: 'point', p: P(e.position), ...base };
        case 'TEXT':
        case 'ATTRIB': {
          const src = e.text && typeof e.text === 'object' ? e.text : e;
          const p = (src.halign || src.valign) && src.endPoint && (src.endPoint.x || src.endPoint.y) ? src.endPoint : src.startPoint;
          if (!p) return null;
          return { t: 'text', p: P(p), text: cleanText(String(src.text || '')), h: src.textHeight || 1, rot: src.rotation || 0, align: src.halign, ...base };
        }
        case 'MTEXT': {
          if (!e.insertionPoint) return null;
          const rot = e.direction ? Math.atan2(e.direction.y, e.direction.x) : (e.rotation || 0);
          return { t: 'text', p: P(e.insertionPoint), text: cleanMText(e.text || ''), h: e.textHeight || 1, rot, ...base };
        }
        case 'INSERT': return { t: 'insert', name: e.name, p: P(e.insertionPoint || { x: 0, y: 0 }), sx: e.xScale || 1, sy: e.yScale || 1, rot: e.rotation || 0, ...base };
        case 'SOLID':
        case '3DFACE': {
          const keys = ['corner1', 'corner2', 'corner4', 'corner3'];
          if (e.corner1) return { t: 'line', pts: keys.filter(k => e[k]).map(k => P(e[k])), closed: true, ...base };
          return null;
        }
        case 'SPLINE': {
          const v = (e.fitPoints && e.fitPoints.length > 1) ? e.fitPoints : e.controlPoints;
          if (!v || v.length < 2) return null;
          return { t: 'line', pts: v.map(P), closed: false, ...base };
        }
        default: return null;
      }
    }
    const blocks = {};
    let model = null;
    ((db.tables && db.tables.BLOCK_RECORD && db.tables.BLOCK_RECORD.entries) || []).forEach(B => {
      if (/^\*model_space$/i.test(B.name)) { model = B; return; }
      blocks[B.name] = { base: B.basePoint ? [B.basePoint.x, B.basePoint.y] : [0, 0], ents: (B.entities || []).map(conv).filter(Boolean) };
    });
    let src = db.entities && db.entities.length ? db.entities : (model ? model.entities : []);
    const ents = (src || []).map(conv).filter(Boolean);
    return { ents, blocks };
  }

  // ---------- Hình học ----------
  function bulgePts(vs, closed) {
    const out = [];
    const n = vs.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = vs[i], b = vs[(i + 1) % n];
      out.push([a.x, a.y]);
      if (a.bulge) out.push(...arcFromBulge(a, b, a.bulge));
    }
    if (!closed && n) out.push([vs[n - 1].x, vs[n - 1].y]);
    return out;
  }
  function arcFromBulge(a, b, bulge) {
    const th = 4 * Math.atan(bulge);
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d === 0) return [];
    const r = d / (2 * Math.sin(th / 2));
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const h = r * Math.cos(th / 2);
    const cx = mx - h * dy / d, cy = my + h * dx / d;
    const a0 = Math.atan2(a.y - cy, a.x - cx);
    const n = Math.max(4, Math.ceil(Math.abs(th) / (Math.PI / 36)));
    const pts = [];
    const R = Math.abs(r);
    for (let i = 1; i < n; i++) {
      const ang = a0 + th * i / n;
      pts.push([cx + R * Math.cos(ang), cy + R * Math.sin(ang)]);
    }
    return pts;
  }
  function arcPts(c, r, a0, a1) {
    let sweep = a1 - a0;
    while (sweep <= 0) sweep += Math.PI * 2;
    const n = Math.max(8, Math.ceil(sweep / (Math.PI / 36)));
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + sweep * i / n; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
    return pts;
  }
  function ellipsePts(c, major, ratio, a0, a1) {
    const ra = Math.hypot(major[0], major[1]), rb = ra * ratio, rot = Math.atan2(major[1], major[0]);
    let sweep = a1 - a0; while (sweep <= 0) sweep += Math.PI * 2;
    const n = Math.max(16, Math.ceil(sweep / (Math.PI / 36)));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = a0 + sweep * i / n, x = ra * Math.cos(t), y = rb * Math.sin(t);
      pts.push([c[0] + x * cr - y * sr, c[1] + x * sr + y * cr]);
    }
    return pts;
  }

  // Ma trận affine [a,b,c,d,e,f]: x' = a*x + c*y + e ; y' = b*x + d*y + f
  const I = [1, 0, 0, 1, 0, 0];
  function mul(m, n) {
    return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
      m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  }
  function ap(m, p) { return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]; }

  /** Bung toàn bộ thực thể thành danh sách đối tượng hiển thị. */
  function explode(model, opts) {
    const maxDepth = 6;
    const out = [];
    const limit = (opts && opts.limit) || 400000;
    function walk(ents, m, depth, inheritLayer) {
      for (const e of ents) {
        if (out.length >= limit) return;
        const layer = (e.layer === '0' && inheritLayer) ? inheritLayer : e.layer;
        const props = { layer, color: e.color, etype: e.etype, style: e.style };
        switch (e.t) {
          case 'line': {
            const pts = e.pts.map(p => ap(m, p));
            if (pts.length < 2) break;
            out.push({ kind: e.closed && pts.length >= 3 ? 'polygon' : 'line', pts, props });
            break;
          }
          case 'circle': out.push({ kind: 'polygon', pts: arcPts(e.c, e.r, 0, Math.PI * 2).map(p => ap(m, p)), props }); break;
          case 'arc': out.push({ kind: 'line', pts: arcPts(e.c, e.r, e.a0, e.a1).map(p => ap(m, p)), props }); break;
          case 'ellipse': {
            const full = Math.abs((e.a1 - e.a0) - Math.PI * 2) < 1e-6;
            out.push({ kind: full ? 'polygon' : 'line', pts: ellipsePts(e.c, e.major, e.ratio, e.a0, e.a1).map(p => ap(m, p)), props });
            break;
          }
          case 'point': out.push({ kind: 'point', pts: [ap(m, e.p)], props }); break;
          case 'text': {
            if (!e.text) break;
            const s = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
            const r = Math.atan2(m[1], m[0]);
            out.push({ kind: 'text', pts: [ap(m, e.p)], text: e.text, h: e.h * s, rot: (e.rot || 0) + r, props });
            break;
          }
          case 'insert': {
            const B = model.blocks[e.name];
            if (!B || depth >= maxDepth) break;
            const c = Math.cos(e.rot), s = Math.sin(e.rot);
            let t = [1, 0, 0, 1, -B.base[0], -B.base[1]];
            t = mul([e.sx, 0, 0, e.sy, 0, 0], t);
            t = mul([c, s, -s, c, e.p[0], e.p[1]], t);
            walk(B.ents, mul(m, t), depth + 1, layer);
            break;
          }
        }
      }
    }
    walk(model.ents, I, 0, null);
    return out;
  }

  function cleanText(s) {
    if (!s) return '';
    return String(s).replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '');
  }
  function cleanMText(s) {
    if (!s) return '';
    return String(s)
      .replace(/\\P/g, '\n')
      .replace(/\\[ACcFfHhQqTtWw][^;]*;/g, '')
      .replace(/\\S([^;]*)[\^#\/]([^;]*);/g, '$1/$2')
      .replace(/\\[LlOoKk]/g, '')
      .replace(/[{}]/g, '')
      .replace(/\\~/g, ' ')
      .trim();
  }

  // Chuyển chữ mã TCVN3 (ABC, font .VnTime) sang Unicode
  const TCVN3 = {
    0xA1: 'Ă', 0xA2: 'Â', 0xA3: 'Ê', 0xA4: 'Ô', 0xA5: 'Ơ', 0xA6: 'Ư', 0xA7: 'Đ', 0xA8: 'ă', 0xA9: 'â', 0xAA: 'ê', 0xAB: 'ô', 0xAC: 'ơ', 0xAD: 'ư', 0xAE: 'đ',
    0xB5: 'à', 0xB6: 'ả', 0xB7: 'ã', 0xB8: 'á', 0xB9: 'ạ', 0xBB: 'ằ', 0xBC: 'ẳ', 0xBD: 'ẵ', 0xBE: 'ắ', 0xC6: 'ặ',
    0xC7: 'ầ', 0xC8: 'ẩ', 0xC9: 'ẫ', 0xCA: 'ấ', 0xCB: 'ậ', 0xCC: 'è', 0xCE: 'ẻ', 0xCF: 'ẽ', 0xD0: 'é', 0xD1: 'ẹ',
    0xD2: 'ề', 0xD3: 'ể', 0xD4: 'ễ', 0xD5: 'ế', 0xD6: 'ệ', 0xD7: 'ì', 0xD8: 'ỉ', 0xDC: 'ĩ', 0xDD: 'í', 0xDE: 'ị',
    0xDF: 'ò', 0xE1: 'ỏ', 0xE2: 'õ', 0xE3: 'ó', 0xE4: 'ọ', 0xE5: 'ồ', 0xE6: 'ổ', 0xE7: 'ỗ', 0xE8: 'ố', 0xE9: 'ộ',
    0xEA: 'ờ', 0xEB: 'ở', 0xEC: 'ỡ', 0xED: 'ớ', 0xEE: 'ợ', 0xEF: 'ù', 0xF1: 'ủ', 0xF2: 'ũ', 0xF3: 'ú', 0xF4: 'ụ',
    0xF5: 'ừ', 0xF6: 'ử', 0xF7: 'ữ', 0xF8: 'ứ', 0xF9: 'ự', 0xFA: 'ỳ', 0xFB: 'ỷ', 0xFC: 'ỹ', 0xFD: 'ý', 0xFE: 'ỵ'
  };
  /** bytes (mảng số 0-255) -> chuỗi; byte >= 0x80 hiểu theo TCVN3. */
  function tcvn3(bytes) {
    let s = '';
    for (const b of bytes) s += b >= 0x80 && TCVN3[b] ? TCVN3[b] : String.fromCharCode(b);
    return s;
  }

  global.CAD = { fromDxf, fromDwg, explode, aciColor, tcvn3 };
})(window);
