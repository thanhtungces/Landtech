/*
 * Đọc file người dùng chọn -> danh sách lớp {name, features, prj}
 * feature: {kind:'line'|'polygon'|'point'|'text', pts:[[x,y]..], holes?, text?, h?, rot?, props, rid?}
 * Định dạng: SHP(+DBF/PRJ), ZIP, DXF, DWG, DGN (V7 + V8), GeoJSON, KML, KMZ, GDB (zip / các file .gdbtable).
 * Tung_LandTech – © Nguyễn Thanh Tùng
 */
(function (global) {
  'use strict';

  const ext = (n) => (n.split('.').pop() || '').toLowerCase();
  const base = (n) => n.replace(/\.[^.]+$/, '');
  const readBuf = (f) => f.arrayBuffer();
  const tick = () => new Promise(r => setTimeout(r, 0));

  async function loadFiles(fileList, progress) {
    const files = Array.from(fileList);
    const out = [];
    const shpSets = {};
    const gdbFiles = {};
    const others = [];
    for (const f of files) {
      const e = ext(f.name);
      if (['shp', 'dbf', 'prj', 'cpg', 'shx'].includes(e)) {
        const k = base(f.name).toLowerCase();
        (shpSets[k] = shpSets[k] || { name: base(f.name) })[e] = f;
      } else if (['gdbtable', 'gdbtablx', 'gdbindexes', 'spx', 'freelist', 'horizon'].includes(e) || /^(gdb|timestamps)$/i.test(f.name)) {
        gdbFiles[f.name.toLowerCase()] = f;
      } else others.push(f);
    }
    for (const k of Object.keys(shpSets)) {
      const s = shpSets[k];
      if (!s.shp) { if (s.dbf) throw userErr('Thiếu file .shp cho "' + s.name + '". Hãy chọn cùng lúc .shp, .dbf, .prj (giữ ngón tay để chọn nhiều file) hoặc nén thành .zip.'); continue; }
      progress && progress('Đang đọc shapefile ' + s.name + '…');
      await tick();
      out.push(await shapefile(s.name, await readBuf(s.shp), s.dbf && await readBuf(s.dbf), s.prj && await s.prj.text(), s.cpg && await s.cpg.text()));
    }
    if (Object.keys(gdbFiles).length) {
      const m = {};
      for (const k of Object.keys(gdbFiles)) m[k] = new Uint8Array(await readBuf(gdbFiles[k]));
      out.push(...gdbSets('Geodatabase', m, progress));
    }
    for (const f of others) {
      const e = ext(f.name);
      progress && progress('Đang đọc ' + f.name + '…');
      await tick();
      switch (e) {
        case 'zip': out.push(...await zip(f)); break;
        case 'dxf': out.push(await dxf(f.name, await readBuf(f))); break;
        case 'dwg': out.push(await dwg(f.name, await readBuf(f), progress)); break;
        case 'dgn': out.push(dgn(f.name, await readBuf(f), progress)); break;
        case 'geojson': case 'json': out.push(geojson(f.name, JSON.parse(await f.text()))); break;
        case 'kml': out.push(kml(f.name, await f.text())); break;
        case 'kmz': out.push(...await kmz(f)); break;
        default: throw userErr('Không hỗ trợ định dạng .' + e + ' (' + f.name + ')');
      }
    }
    return out;
  }

  // Bỏ đối tượng CAD có điểm lạc xa (>150 km so với trung vị) – thường là rác ở gốc tọa độ 0,0
  function dropFar(ds) {
    const f = ds.features;
    if (f.length < 20) return ds;
    const xs = [], ys = [];
    const step = Math.max(1, Math.floor(f.length / 20000));
    for (let i = 0; i < f.length; i += step) { const p = f[i].pts[0]; if (p && isFinite(p[0]) && isFinite(p[1])) { xs.push(p[0]); ys.push(p[1]); } }
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    const mx = xs[xs.length >> 1], my = ys[ys.length >> 1];
    if (!(Math.max(Math.abs(mx), Math.abs(my)) > 50000)) return ds;
    const before = f.length;
    ds.features = f.filter(o => !o.pts.some(p => Math.abs(p[0] - mx) > 150000 || Math.abs(p[1] - my) > 150000));
    const n = before - ds.features.length;
    if (n) ds.note = (ds.note ? ds.note + '; ' : '') + 'đã bỏ ' + n + ' đối tượng lạc xa (rác ở gốc 0,0)';
    return ds;
  }

  function userErr(msg) { const e = new Error(msg); e.userMessage = msg; return e; }

  // ---------- Shapefile ----------
  async function shapefile(name, shpBuf, dbfBuf, prjText, cpg) {
    const geoms = shp.parseShp(shpBuf); // không truyền prj -> giữ tọa độ gốc
    let props = [];
    if (dbfBuf) {
      let enc = cpg ? cpg.trim() : 'UTF-8';
      if (/^(1258|cp1258|windows-1258)$/i.test(enc)) enc = 'windows-1258';
      try { props = shp.parseDbf(dbfBuf, enc); } catch (e) { try { props = shp.parseDbf(dbfBuf, 'windows-1252'); } catch (e2) { props = []; } }
    }
    const features = [];
    geoms.forEach((g, i) => geomToFeatures(g, props[i] || {}, features, i));
    return { name, type: 'SHP', features, prj: CRS.fromPrj(prjText), prjText: prjText || null };
  }

  function geomToFeatures(g, props, out, rid) {
    if (!g) return;
    const c = g.coordinates;
    const add = (o) => { o.props = props; if (rid != null) o.rid = rid; out.push(o); };
    switch (g.type) {
      case 'Point': add({ kind: 'point', pts: [c] }); break;
      case 'MultiPoint': c.forEach(p => add({ kind: 'point', pts: [p] })); break;
      case 'LineString': add({ kind: 'line', pts: c }); break;
      case 'MultiLineString': c.forEach(l => add({ kind: 'line', pts: l })); break;
      case 'Polygon': add({ kind: 'polygon', pts: c[0], holes: c.slice(1) }); break;
      case 'MultiPolygon': c.forEach(pg => add({ kind: 'polygon', pts: pg[0], holes: pg.slice(1) })); break;
      case 'GeometryCollection': (g.geometries || []).forEach(x => geomToFeatures(x, props, out, rid)); break;
    }
  }

  // ---------- ZIP ----------
  async function zip(f) {
    const entries = fflate.unzipSync(new Uint8Array(await f.arrayBuffer()));
    const sets = {};
    const res = [];
    const other = [];
    const gdbs = {};
    for (const path of Object.keys(entries)) {
      if (/__MACOSX/.test(path) || /\/$/.test(path)) continue;
      const e = ext(path);
      const fname = path.split('/').pop();
      const dir = path.slice(0, path.length - fname.length).toLowerCase();
      if (['gdbtable', 'gdbtablx', 'gdbindexes'].includes(e) || (/\.gdb\/$/i.test(dir) && /^(gdb|timestamps)$/i.test(fname))) {
        (gdbs[dir] = gdbs[dir] || {})[fname.toLowerCase()] = entries[path]; continue;
      }
      const k = (dir + base(fname)).toLowerCase();
      if (['shp', 'dbf', 'prj', 'cpg'].includes(e)) (sets[k] = sets[k] || { name: base(fname) })[e] = entries[path];
      else if (['dxf', 'dwg', 'dgn', 'geojson', 'kml', 'kmz'].includes(e)) other.push(new File([entries[path]], fname));
    }
    const dec = new TextDecoder();
    for (const k of Object.keys(sets)) {
      const s = sets[k];
      if (!s.shp) continue;
      res.push(await shapefile(s.name, ab(s.shp), s.dbf && ab(s.dbf), s.prj && dec.decode(s.prj), s.cpg && dec.decode(s.cpg)));
    }
    for (const d of Object.keys(gdbs)) {
      if (gdbs[d]['a00000001.gdbtable']) {
        const nm = (d.replace(/\/$/, '').split('/').pop() || 'Geodatabase').replace(/\.gdb$/i, '');
        res.push(...gdbSets(nm, gdbs[d]));
      }
    }
    if (other.length) res.push(...await loadFiles(other));
    if (!res.length) throw userErr('File zip không chứa shapefile, GDB hoặc bản vẽ CAD.');
    return res;
  }
  const ab = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

  // ---------- GDB ----------
  function gdbSets(name, files, progress) {
    progress && progress('Đang đọc Geodatabase…');
    const sets = GDB.read(files);
    return sets.map(s => {
      const features = [];
      s.recs.forEach((r, i) => { if (r.geom) geomToFeatures(r.geom, r.props, features, i); else { /* bản ghi không có hình học */ } });
      return { name: sets.length > 1 || name === 'Geodatabase' ? name + ' · ' + s.name : s.name, type: 'GDB', features, prj: CRS.fromPrj(s.wkt), prjText: s.wkt, fieldOrder: s.fields };
    });
  }

  // ---------- DXF ----------
  function decodeDxf(buf) {
    const u8 = new Uint8Array(buf);
    if (u8.length > 22 && String.fromCharCode(...u8.subarray(0, 18)) === 'AutoCAD Binary DXF') {
      throw userErr('DXF dạng nhị phân chưa hỗ trợ. Hãy lưu DXF dạng ASCII hoặc dùng DWG.');
    }
    let txt = new TextDecoder('utf-8').decode(u8);
    if (txt.indexOf('�') >= 0) {
      const m = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*ANSI_(\d+)/.exec(txt);
      const cp = m ? 'windows-' + m[1] : 'windows-1258';
      try { txt = new TextDecoder(cp).decode(u8); } catch (e) { txt = new TextDecoder('windows-1252').decode(u8); }
    }
    return txt;
  }
  async function dxf(name, buf) {
    const parser = new DxfParser();
    const data = parser.parseSync(decodeDxf(buf));
    const model = CAD.fromDxf(data);
    return dropFar({ name, type: 'DXF', features: CAD.explode(model), prj: null, isCad: true });
  }

  // ---------- DWG ----------
  let dwgLib = null;
  async function dwg(name, buf, progress) {
    const head = String.fromCharCode(...new Uint8Array(buf, 0, 6));
    if (!/^AC10\d\d$/.test(head)) throw userErr('File DWG không đúng định dạng (mã phiên bản: "' + head.replace(/[^\x20-\x7e]/g, '?') + '"). Hãy lưu lại từ CAD sang DWG 2018 hoặc DXF.');
    const ver = parseInt(head.slice(2));
    if (ver > 1032) throw userErr('Phiên bản DWG (' + head + ') mới hơn bộ đọc hỗ trợ (tối đa DWG 2018–2025 = AC1032). Hãy "Save As" DWG 2018 hoặc DXF.');
    if (!dwgLib) {
      progress && progress('Đang nạp bộ đọc DWG (lần đầu hơi lâu)…');
      const mod = await import(new URL('lib/dwg/dist/libredwg-web.js', location.href).href);
      const wasmDir = new URL('lib/dwg/wasm', location.href).href;
      dwgLib = { mod, lib: await mod.LibreDwg.create(wasmDir) };
    }
    progress && progress('Đang giải mã DWG ' + name + '…');
    await tick();
    const { mod, lib } = dwgLib;
    const ptr = lib.dwg_read_data(buf, mod.Dwg_File_Type.DWG);
    if (!ptr) throw userErr('Không đọc được file DWG (phiên bản không hỗ trợ hoặc file hỏng).');
    let db;
    try { db = lib.convert(ptr); } finally { try { lib.dwg_free(ptr); } catch (e) { } }
    const model = CAD.fromDwg(db);
    return dropFar({ name, type: 'DWG', features: CAD.explode(model), prj: null, isCad: true });
  }

  // ---------- DGN (V7 + V8) ----------
  function dgn(name, buf, progress) {
    const u8 = new Uint8Array(buf);
    let model, v8 = false;
    if (DGN8.isV8(u8)) {
      progress && progress('Đang giải mã DGN V8…');
      model = DGN8.parse(u8);
      const d = DGN8.autoScale(model, global.__dgnUor);
      DGN8.rescale(model, d);
      v8 = true;
      model.scaleInfo = d;
    } else {
      model = DGN.parse(buf);
      // DGN V7: tọa độ lưu so với Global Origin (vd 500.000 / 1.000.000) -> cộng gốc
      if (model.ents && DGN8.autoOrigin(model)[0]) DGN8.rescale(model, 1);
    }
    const features = CAD.explode(model);
    const ds = { name, type: 'DGN', features, prj: null, isCad: true };
    if (v8) ds.note = 'DGN V8: ' + (model.v8.elements) + ' phần tử, hệ số UOR→m = 1/' + model.scaleInfo + (model.v8.skipped ? ', bỏ qua ' + model.v8.skipped + ' phần tử không đọc được' : '') + (model.dropped ? ', loại ' + model.dropped + ' phần tử lạc xa' : '');
    if (model.origin && (model.origin[0] || model.origin[1])) ds.note = (ds.note ? ds.note + ', ' : '') + 'cộng Global Origin X = ' + model.origin[0].toLocaleString('vi-VN') + ', Y = ' + model.origin[1].toLocaleString('vi-VN');
    return dropFar(ds);
  }

  // ---------- GeoJSON ----------
  function geojson(name, gj) {
    const features = [];
    const list = gj.type === 'FeatureCollection' ? gj.features : gj.type === 'Feature' ? [gj] : [{ geometry: gj, properties: {} }];
    list.forEach((f, i) => geomToFeatures(f.geometry, f.properties || {}, features, i));
    return { name, type: 'GeoJSON', features, prj: { mode: 'wgs84' } };
  }

  // ---------- KML / KMZ ----------
  function kmlColor(c) { // aabbggrr -> #rrggbb
    if (!c || c.length < 8) return null;
    c = c.trim();
    return '#' + c.slice(6, 8) + c.slice(4, 6) + c.slice(2, 4);
  }
  function kml(name, text) {
    const doc = new DOMParser().parseFromString(text.replace(/^﻿/, ''), 'text/xml');
    if (doc.getElementsByTagName('parsererror').length) throw userErr('File KML không hợp lệ.');
    const features = [];
    const parse = (s) => (s || '').trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(p => p.length >= 2 && isFinite(p[0]) && isFinite(p[1]));
    const styles = {};
    Array.from(doc.getElementsByTagName('Style')).forEach(st => {
      const id = st.getAttribute('id'); if (!id) return;
      const ls = st.getElementsByTagName('LineStyle')[0], ps = st.getElementsByTagName('PolyStyle')[0], is = st.getElementsByTagName('IconStyle')[0];
      const col = (el) => el && el.getElementsByTagName('color')[0] ? kmlColor(el.getElementsByTagName('color')[0].textContent) : null;
      styles['#' + id] = col(ls) || col(ps) || col(is);
    });
    Array.from(doc.getElementsByTagName('StyleMap')).forEach(sm => {
      const id = sm.getAttribute('id'); if (!id) return;
      const pairs = Array.from(sm.getElementsByTagName('Pair'));
      const n = pairs.find(p => (p.getElementsByTagName('key')[0] || {}).textContent === 'normal') || pairs[0];
      const u = n && n.getElementsByTagName('styleUrl')[0];
      if (u) styles['#' + id] = styles[u.textContent.trim()] || null;
    });
    const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
    placemarks.forEach((pm, rid) => {
      const props = {};
      const txt = (tag) => { const e = Array.from(pm.children).find(c => c.localName === tag); return e ? e.textContent.trim() : ''; };
      props.name = txt('name');
      const desc = txt('description'); if (desc) props.description = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      Array.from(pm.getElementsByTagName('Data')).forEach(d => { const v = d.getElementsByTagName('value')[0]; props[d.getAttribute('name')] = v ? v.textContent.trim() : ''; });
      Array.from(pm.getElementsByTagName('SimpleData')).forEach(d => { props[d.getAttribute('name')] = d.textContent.trim(); });
      let color = null;
      const su = txt('styleUrl'); if (su && styles[su]) color = styles[su];
      const inl = Array.from(pm.children).find(c => c.localName === 'Style');
      if (inl) { const c = inl.getElementsByTagName('color')[0]; if (c) color = kmlColor(c.textContent); }
      if (color) props.color = color;
      const add = (o) => { o.props = props; o.rid = rid; features.push(o); };
      Array.from(pm.getElementsByTagName('Point')).forEach(p => { const c = p.getElementsByTagName('coordinates')[0]; if (c) { const pts = parse(c.textContent); if (pts.length) add({ kind: 'point', pts: [pts[0]] }); } });
      Array.from(pm.getElementsByTagName('LineString')).forEach(p => { const c = p.getElementsByTagName('coordinates')[0]; if (c) { const pts = parse(c.textContent); if (pts.length > 1) add({ kind: 'line', pts }); } });
      Array.from(pm.getElementsByTagName('Polygon')).forEach(pg => {
        const o = pg.getElementsByTagName('outerBoundaryIs')[0];
        const oc = o && o.getElementsByTagName('coordinates')[0];
        if (!oc) return;
        const holes = Array.from(pg.getElementsByTagName('innerBoundaryIs')).map(i => parse((i.getElementsByTagName('coordinates')[0] || {}).textContent));
        add({ kind: 'polygon', pts: parse(oc.textContent), holes: holes.filter(h => h.length > 2) });
      });
      Array.from(pm.getElementsByTagName('gx:coord')).length && null;
    });
    return { name, type: 'KML', features, prj: { mode: 'wgs84' } };
  }
  async function kmz(f) {
    const entries = fflate.unzipSync(new Uint8Array(await f.arrayBuffer()));
    const names = Object.keys(entries).filter(n => /\.kml$/i.test(n));
    if (!names.length) throw userErr('File KMZ không chứa file .kml.');
    names.sort((a, b) => (/^doc\.kml$/i.test(b) ? 1 : 0) - (/^doc\.kml$/i.test(a) ? 1 : 0));
    return names.slice(0, 5).map(n => kml(names.length > 1 ? base(f.name) + ' · ' + n.split('/').pop() : base(f.name), new TextDecoder('utf-8').decode(entries[n])));
  }

  global.Loaders = { loadFiles };
})(window);
