/*
 * Xuất Trích lục bản đồ địa chính theo Phụ lục số 19 – Thông tư 26/2024/TT-BTNMT.
 * Hỗ trợ lấy râu thửa từ các Level quy ước (mặc định: 10, 23, 31, 32),
 * xem trước sơ đồ, in/xuất PDF, tải Word (.doc), HTML và DXF (CAD).
 * Tung_LandTech – © Nguyễn Thanh Tùng
 */
(function (global) {
  'use strict';
  let C = null;
  const CFG_KEY = 'trichluc_cfg_v1';

  function init(ctx) { C = ctx; }

  const lvNorm = (n) => String(n == null ? '' : n).replace(/^\s*level\s*/i, '').trim();

  function parseLevels(str) {
    return new Set(String(str || '10,23,31,32').split(/[\s,;]+/).map(lvNorm).filter(Boolean));
  }

  function loadCfg() {
    const year = new Date().getFullYear();
    const prov = (C && C.S && C.S.prov) ? C.S.prov : 'Đồng Nai';
    const def = {
      soTrichLuc: '............/' + year,
      hopDong: '',
      taiLieu: 'Tờ bản đồ địa chính',
      thayDoi: 'Không thay đổi so với bản đồ địa chính',
      khac: '',
      diaDanh: prov,
      ngay: '....',
      thang: '....',
      nam: String(year),
      nguoiKiemTra: '..........................',
      nguoiTrichLuc: 'NGUYỄN THANH TÙNG',
      coQuan: 'Văn phòng Đăng ký đất đai thành phố Đồng Nai',
      chucVu: 'KT.GIÁM ĐỐC\nPHÓ GIÁM ĐỐC',
      nguoiKy: 'LÊ VĂN NGỌC',
      rauLevels: '10,23,31,32',
      useRau: true,
      marginPct: 15,
      showVerts: true,
      showNeighbor: true,
      decimals: 2
    };
    try {
      const saved = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      return Object.assign(def, saved);
    } catch (e) {
      return def;
    }
  }

  function saveCfg(cfg) {
    try {
      const keep = {
        hopDong: cfg.hopDong,
        taiLieu: cfg.taiLieu,
        thayDoi: cfg.thayDoi,
        diaDanh: cfg.diaDanh,
        nguoiKiemTra: cfg.nguoiKiemTra,
        nguoiTrichLuc: cfg.nguoiTrichLuc,
        coQuan: cfg.coQuan,
        chucVu: cfg.chucVu,
        nguoiKy: cfg.nguoiKy,
        rauLevels: cfg.rauLevels,
        useRau: cfg.useRau,
        marginPct: cfg.marginPct,
        showVerts: cfg.showVerts,
        showNeighbor: cfg.showNeighbor,
        decimals: cfg.decimals
      };
      localStorage.setItem(CFG_KEY, JSON.stringify(keep));
    } catch (e) { }
  }

  /** Sắp đỉnh theo chiều kim đồng hồ trong VN-2000 {E, N}, bắt đầu từ đỉnh Tây Bắc (N - E lớn nhất). */
  function orderOuterVN(ring) {
    if (!ring || ring.length < 3) return ring ? ring.slice() : [];
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i], q = ring[(i + 1) % ring.length];
      a += p.E * q.N - q.E * p.N;
    }
    const r = a > 0 ? ring.slice().reverse() : ring.slice();
    let k = 0, best = -Infinity;
    for (let i = 0; i < r.length; i++) {
      const v = r[i].N - r[i].E;
      if (v > best) { best = v; k = i; }
    }
    return r.slice(k).concat(r.slice(0, k));
  }

  /** Cắt đoạn thẳng (Liang-Barsky) theo khung [minE, minN, maxE, maxN]. */
  function clipSegment(ax, ay, bx, by, minX, minY, maxX, maxY) {
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1;
    const p = [-dx, dx, -dy, dy];
    const q = [ax - minX, maxX - ax, ay - minY, maxY - ay];
    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-12) {
        if (q[i] < 0) return null;
      } else {
        const t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
        else { if (t < t0) return null; if (t < t1) t1 = t; }
      }
    }
    if (t0 > t1) return null;
    return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy];
  }

  function pointInRingVN(ring, e, n) {
    let ins = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const A = ring[i], B = ring[j];
      if (((A.N > n) !== (B.N > n)) && (e < (B.E - A.E) * (n - A.N) / (B.N - A.N) + A.E)) ins = !ins;
    }
    return ins;
  }

  /** Tính khung sơ đồ cân đối tỷ lệ W:H quanh thửa đất + vùng cắt râu thửa ngắn gọn. */
  function computeFrame(outer, marginPct, boxW, boxH) {
    let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
    for (const p of outer) {
      if (p.E < minE) minE = p.E;
      if (p.N < minN) minN = p.N;
      if (p.E > maxE) maxE = p.E;
      if (p.N > maxN) maxN = p.N;
    }
    const w = Math.max(maxE - minE, 2), h = Math.max(maxN - minN, 2);
    const pct = Math.max(5, Number(marginPct) || 15) / 100;
    const span = Math.max(w, h);
    const pad = span * Math.max(0.14, pct);
    const rauPad = span * pct * 0.85;
    let fw = w + pad * 2, fh = h + pad * 2;
    const targetAspect = boxW / boxH;
    if (fw / fh < targetAspect) fw = fh * targetAspect;
    else fh = fw / targetAspect;
    const cx = (minE + maxE) / 2, cy = (minN + maxN) / 2;
    return {
      minE: cx - fw / 2, maxE: cx + fw / 2, minN: cy - fh / 2, maxN: cy + fh / 2, fw, fh,
      rauBox: { minE: minE - rauPad, maxE: maxE + rauPad, minN: minN - rauPad, maxN: maxN + rauPad }
    };
  }

  /** Trích xuất các đoạn râu thửa (theo level 10, 23, 31, 32) và nhãn thửa lân cận trong khung. */
  function extractRauThua(Ly, targetFeat, outerVN, frame, levelsStr, wantRau, wantNeighbor) {
    const segs = []; // { ax, ay, bx, by, lv }
    const labels = []; // { e, n, text }
    if (!wantRau && !wantNeighbor) return { segs, labels };

    const lvSet = parseLevels(levelsStr);
    const labelLvSet = new Set(['3', '13']);
    const rb = frame.rauBox || frame;
    const { minE, minN, maxE, maxN } = rb;
    const isInFrame = (e, n) => e >= minE && e <= maxE && n >= minN && n <= maxN;

    const pushRing = (pts, closed, lv) => {
      if (!pts || pts.length < 2) return;
      // Kiểm tra nhanh bounding box VN-2000
      const vpts = new Array(pts.length);
      let bMinE = Infinity, bMinN = Infinity, bMaxE = -Infinity, bMaxN = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        const v = Attr.toVN(Ly, pts[i]);
        vpts[i] = v;
        if (v.E < bMinE) bMinE = v.E;
        if (v.N < bMinN) bMinN = v.N;
        if (v.E > bMaxE) bMaxE = v.E;
        if (v.N > bMaxN) bMaxN = v.N;
      }
      if (bMaxE < minE || bMinE > maxE || bMaxN < minN || bMinN > maxN) return;
      const nSeg = closed ? vpts.length : vpts.length - 1;
      for (let i = 0; i < nSeg; i++) {
        const a = vpts[i], b = vpts[(i + 1) % vpts.length];
        const c = clipSegment(a.E, a.N, b.E, b.N, minE, minN, maxE, maxN);
        if (c) segs.push({ ax: c[0], ay: c[1], bx: c[2], by: c[3], lv });
      }
    };

    for (const g of Ly.features) {
      if (!g || g.auto) continue;
      if (g === targetFeat) continue;

      if (wantRau && (g.kind === 'line' || g.kind === 'polygon')) {
        const lv = g.props && g.props.layer != null ? lvNorm(g.props.layer) : '';
        if (!Ly.isCad || !lvSet.size || lvSet.has(lv)) {
          pushRing(g.pts, g.kind === 'polygon', lv);
          if (g.holes) g.holes.forEach(h => pushRing(h, true, lv));
        }
      } else if (wantNeighbor && Ly.isCad && g.kind === 'text' && g.text && g.pts && g.pts[0]) {
        const lv = g.props && g.props.layer != null ? lvNorm(g.props.layer) : '';
        const txt = String(g.text).replace(/[\x00-\x1f]/g, '').trim();
        if (!txt) continue;
        if (labelLvSet.has(lv) || /^\d{1,5}$/.test(txt)) {
          const v = Attr.toVN(Ly, g.pts[0]);
          if (isInFrame(v.E, v.N) && !pointInRingVN(outerVN, v.E, v.N)) {
            labels.push({ e: v.E, n: v.N, text: txt });
          }
        }
      }
    }

    // Với lớp không phải CAD (SHP/GeoJSON/GDB), lấy số thửa của các thửa lân cận
    if (wantNeighbor && !Ly.isCad) {
      for (const g of Ly.features) {
        if (!g || g === targetFeat || g.kind !== 'polygon' || !g.pts || g.pts.length < 3) continue;
        const lb = Attr.featLabel(Ly, g);
        if (lb.thua === '' || lb.thua == null) continue;
        const v0 = Attr.toVN(Ly, g.pts[0]);
        // Lọc sơ bộ theo khoảng cách
        if (v0.E < minE - frame.fw * 2 || v0.E > maxE + frame.fw * 2 || v0.N < minN - frame.fh * 2 || v0.N > maxN + frame.fh * 2) continue;
        const rg = Attr.vnRings(Ly, g);
        const c = Attr.labelPoint(rg.outer);
        if (isInFrame(c.E, c.N) && !pointInRingVN(outerVN, c.E, c.N)) {
          labels.push({ e: c.E, n: c.N, text: String(lb.thua) });
        }
      }
    }

    return { segs, labels };
  }

  /** Tạo SVG Sơ đồ thửa đất (Box 7) với râu thửa và mũi tên hướng Bắc. */
  function buildDiagramSvg(data, opts) {
    const W = 360, H = 270;
    const padPx = 10;
    const drawW = W - padPx * 2, drawH = H - padPx * 2;
    const { frame, outer, holes, rau, thuaText } = data;
    const sx = (e) => padPx + ((e - frame.minE) / frame.fw) * drawW;
    const sy = (n) => padPx + ((frame.maxN - n) / frame.fh) * drawH;

    const p2str = (ring) => ring.map(p => sx(p.E).toFixed(2) + ',' + sy(p.N).toFixed(2)).join(' ');
    const esc = C.esc;

    let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" style="display:block;width:100%;height:auto;background:#fff;font-family:\'Times New Roman\',Times,serif;">';
    svg += '<defs><clipPath id="tlClip"><rect x="2" y="2" width="' + (W - 4) + '" height="' + (H - 4) + '"/></clipPath></defs>';
    svg += '<g clip-path="url(#tlClip)">';

    // 1. Râu thửa (Level 10, 23, 31, 32)
    for (const s of rau.segs) {
      const x1 = sx(s.ax).toFixed(2), y1 = sy(s.ay).toFixed(2);
      const x2 = sx(s.bx).toFixed(2), y2 = sy(s.by).toFixed(2);
      const is10 = s.lv === '10' || s.lv === '';
      const col = is10 ? '#333' : (s.lv === '23' ? '#4a5568' : '#64748b');
      const dash = (s.lv === '31' || s.lv === '32') ? ' stroke-dasharray="4,2"' : '';
      svg += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" stroke="' + col + '" stroke-width="' + (is10 ? '0.8' : '0.65') + '"' + dash + '/>';
    }

    // 2. Nhãn thửa lân cận
    for (const lb of rau.labels) {
      svg += '<text x="' + sx(lb.e).toFixed(1) + '" y="' + sy(lb.n).toFixed(1) + '" font-size="9" fill="#555" text-anchor="middle" dominant-baseline="central">' + esc(lb.text) + '</text>';
    }

    // 3. Thửa đất chính
    svg += '<polygon points="' + p2str(outer) + '" fill="rgba(0,0,0,0.04)" stroke="#000" stroke-width="1.8" stroke-linejoin="round"/>';
    for (const h of holes) {
      svg += '<polygon points="' + p2str(h) + '" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/>';
    }

    // 4. Số đỉnh & kích thước cạnh
    if (opts.showVerts && outer.length >= 3) {
      const ptsPx = outer.map(p => ({ x: sx(p.E), y: sy(p.N) }));
      let cx = 0, cy = 0, sa = 0;
      for (let i = 0; i < ptsPx.length; i++) {
        const p = ptsPx[i], q = ptsPx[(i + 1) % ptsPx.length];
        cx += p.x; cy += p.y;
        sa += p.x * q.y - q.x * p.y;
      }
      cx /= ptsPx.length; cy /= ptsPx.length;

      // Chiều dài cạnh
      for (let i = 0; i < outer.length; i++) {
        const j = (i + 1) % outer.length;
        const p = ptsPx[i], q = ptsPx[j];
        const pixLen = Math.hypot(q.x - p.x, q.y - p.y);
        if (pixLen < 18) continue;
        const dist = Math.hypot(outer[j].E - outer[i].E, outer[j].N - outer[i].N);
        const txt = dist.toFixed(opts.decimals);
        const dx = q.x - p.x, dy = q.y - p.y, d = pixLen || 1;
        let ang = Math.atan2(dy, dx) * 180 / Math.PI;
        if (ang > 90) ang -= 180;
        else if (ang < -90) ang += 180;
        // Đẩy ra ngoài thửa (trong hệ tọa độ SVG y hướng xuống, sa > 0 là cùng chiều kim đồng hồ)
        const s = sa >= 0 ? 1 : -1;
        const ox = (dy / d) * s * 8, oy = (-dx / d) * s * 8;
        const mx = (p.x + q.x) / 2 + ox, my = (p.y + q.y) / 2 + oy;
        svg += '<text x="' + mx.toFixed(1) + '" y="' + my.toFixed(1) + '" font-size="8.5" fill="#111" text-anchor="middle" dominant-baseline="central" transform="rotate(' + ang.toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1) + ')" style="paint-order:stroke;stroke:#fff;stroke-width:2.5px;stroke-linejoin:round;">' + txt + '</text>';
      }

      // Đỉnh thửa
      let lastV = null;
      for (let i = 0; i < ptsPx.length; i++) {
        const p = ptsPx[i];
        svg += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="2.1" fill="#fff" stroke="#000" stroke-width="1"/>';
        if (lastV && Math.hypot(p.x - lastV.x, p.y - lastV.y) < 13) continue;
        lastV = p;
        let ux = p.x - cx, uy = p.y - cy;
        const ud = Math.hypot(ux, uy) || 1;
        ux /= ud; uy /= ud;
        const lx = p.x + ux * 10, ly = p.y + uy * 10;
        svg += '<text x="' + lx.toFixed(1) + '" y="' + ly.toFixed(1) + '" font-size="8.5" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="central" style="paint-order:stroke;stroke:#fff;stroke-width:2.5px;stroke-linejoin:round;">' + (i + 1) + '</text>';
      }
    }

    // Nhãn số thửa ở tâm thửa chính
    if (thuaText) {
      try {
        const c = Attr.labelPoint(outer);
        svg += '<text x="' + sx(c.E).toFixed(1) + '" y="' + sy(c.N).toFixed(1) + '" font-size="11" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="central" style="paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round;">' + esc(thuaText) + '</text>';
      } catch (e) { }
    }

    svg += '</g>';

    // 5. Mũi tên chỉ hướng Bắc (B) ở góc phải (giống Phụ lục 19)
    const nx = W - 18, ny = 58;
    svg += '<g transform="translate(' + nx + ',' + ny + ')">';
    svg += '<line x1="0" y1="24" x2="0" y2="-24" stroke="#000" stroke-width="1.3"/>';
    svg += '<polygon points="0,-28 -3.5,-18 3.5,-18" fill="#000"/>';
    svg += '<line x1="-2.5" y1="16" x2="-2.5" y2="24" stroke="#000" stroke-width="0.9"/>';
    svg += '<line x1="2.5" y1="16" x2="2.5" y2="24" stroke="#000" stroke-width="0.9"/>';
    svg += '<circle cx="0" cy="-2" r="7.5" fill="#fff" stroke="#000" stroke-width="1.2"/>';
    svg += '<text x="0" y="-1.5" font-size="10" font-weight="bold" fill="#000" text-anchor="middle" dominant-baseline="central">B</text>';
    svg += '</g>';

    svg += '</svg>';
    return svg;
  }

  /** Chuyển SVG sang PNG DataURL (dùng khi xuất Word .doc). */
  function svgToPngDataUrl(svgStr, w, h) {
    return new Promise((resolve) => {
      try {
        const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = w || 1080;
          canvas.height = h || 810;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      } catch (e) { resolve(null); }
    });
  }

  /** Tạo bảng 8. Tọa độ đỉnh thửa, kích thước cạnh (cạnh so le giữa 2 đỉnh giống Phụ lục 19). */
  function buildCoordTableHtml(outer, decimals) {
    const n = outer.length;
    const dec = decimals === 3 ? 3 : 2;
    let rows = '';
    for (let i = 0; i < n; i++) {
      const p = outer[i];
      const q = outer[(i + 1) % n];
      const d = Math.hypot(q.E - p.E, q.N - p.N).toFixed(dec);
      rows += '<tr>' +
        '<td rowspan="2" class="c">' + (i + 1) + '</td>' +
        '<td rowspan="2" class="r">' + p.N.toFixed(dec) + '</td>' +
        '<td rowspan="2" class="r">' + p.E.toFixed(dec) + '</td>' +
        (i === 0 ? '<td class="sp-top"></td>' : '') +
        '</tr>';
      rows += '<tr>' +
        (i < n - 1
          ? '<td rowspan="2" class="c edge">' + d + '</td>'
          : '<td class="sp-bot c edge" title="Cạnh khép về đỉnh 1">' + d + '</td>') +
        '</tr>';
    }
    return '<table class="tcoord">' +
      '<thead>' +
      '<tr><th colspan="3">Tọa độ đỉnh thửa</th><th rowspan="2">Kích thước<br>cạnh (m)</th></tr>' +
      '<tr><th>Đỉnh</th><th>X (m)</th><th>Y (m)</th></tr>' +
      '</thead>' +
      '<tbody>' + rows + '</tbody>' +
      '</table>';
  }

  /** Tạo nội dung HTML hoàn chỉnh theo Phụ lục số 19 – Thông tư 26. */
  function buildDocumentHtml(form, outer, diagramHtml, isWord) {
    const esc = C.esc;
    const khacHtml = form.khac.trim()
      ? '<div class="khac">' + form.khac.split('\n').map(l => '<div>' + esc(l) + '</div>').join('') + '</div>'
      : '';
    const chucVuHtml = form.chucVu.split('\n').map(l => '<div><b>' + esc(l) + '</b></div>').join('');
    const dateLine = esc(form.diaDanh) + ', ngày ' + esc(form.ngay) + ' tháng ' + esc(form.thang) + ' năm ' + esc(form.nam);
    const coordTable = buildCoordTableHtml(outer, form.decimals);
    const compactClass = outer.length > 22 ? ' compact2' : (outer.length > 14 ? ' compact' : '');

    return '<!doctype html>' +
      '<html' + (isWord ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"' : '') + '>' +
      '<head><meta charset="utf-8"><title>Trích lục bản đồ địa chính - Phụ lục 19</title>' +
      '<style>' +
      '@page{size:A4 portrait;margin:9mm 10mm 9mm 10mm;}' +
      '@page Section1{size:210mm 297mm;margin:9mm 10mm 9mm 10mm;mso-header-margin:5mm;mso-footer-margin:5mm;}' +
      'div.Section1{page:Section1;}' +
      '*{box-sizing:border-box;}' +
      'body{margin:0;padding:0;background:#fff;color:#000;font-family:"Times New Roman",Times,serif;font-size:11pt;line-height:1.3;}' +
      '.page{width:100%;max-width:188mm;min-height:274mm;margin:0 auto;border:1.8px solid #000;padding:7mm 8mm 7mm 8mm;background:#fff;page-break-inside:avoid;break-inside:avoid;}' +
      '.top-row{width:100%;border-collapse:collapse;margin-bottom:2px;}' +
      '.top-row td{vertical-align:top;padding:0;}' +
      '.pl-lbl{font-size:11pt;}' +
      '.hd-lbl{font-size:9pt;text-align:right;}' +
      '.title{text-align:center;font-size:14pt;font-weight:bold;margin:2px 0 2px;letter-spacing:0.2px;}' +
      '.sub{text-align:center;font-size:11pt;margin:0 0 8px;}' +
      '.info-line{margin:2.5px 0;font-size:10.5pt;}' +
      '.khac{margin:2px 0 3px 12px;font-size:10pt;line-height:1.3;}' +
      '.main-grid{width:100%;border-collapse:collapse;margin-top:6px;table-layout:fixed;page-break-inside:avoid;break-inside:avoid;}' +
      '.main-grid > tbody > tr > td{vertical-align:top;padding:0;}' +
      '.col-left{width:56%;padding-right:6px !important;}' +
      '.col-right{width:44%;padding-left:4px !important;}' +
      '.sec-h{font-size:10.5pt;margin:0 0 3px;}' +
      '.map-box{border:1px solid #000;background:#fff;overflow:hidden;}' +
      '.tcoord{width:100%;border-collapse:collapse;font-size:9pt;font-variant-numeric:tabular-nums;}' +
      '.compact .tcoord{font-size:8pt;}' +
      '.compact2 .tcoord{font-size:7pt;line-height:1.1;}' +
      '.tcoord th,.tcoord td{border:1px solid #000;padding:1px 3px;}' +
      '.compact2 .tcoord th,.compact2 .tcoord td{padding:0.5px 2px;}' +
      '.tcoord th{font-weight:normal;text-align:center;padding:2px 3px;background:#fff;}' +
      '.tcoord td.c{text-align:center;}' +
      '.tcoord td.r{text-align:right;padding-right:4px;}' +
      '.tcoord td.sp-top{border-bottom:none !important;height:6px;}' +
      '.tcoord td.sp-bot{border-top:none !important;height:6px;font-size:7.5pt;color:#333;}' +
      '.tcoord td.edge{text-align:center;}' +
      '.sign-grid{width:100%;border-collapse:collapse;margin-top:10px;font-size:10.5pt;page-break-inside:avoid;break-inside:avoid;}' +
      '.sign-grid td{width:50%;vertical-align:top;text-align:center;padding:0 4px;}' +
      '.italic{font-style:italic;}' +
      '.sig-space{height:38px;}' +
      '.sig-name{font-weight:bold;text-transform:uppercase;}' +
      '@media screen{body{background:#e5e7eb;padding:10px;}.page{box-shadow:0 2px 14px rgba(0,0,0,0.2);}}' +
      '@media print{body{background:#fff;padding:0;}.page{box-shadow:none;width:100%;max-width:none;min-height:275mm;}}' +
      '</style></head>' +
      '<body><div class="Section1"><div class="page' + compactClass + '">' +
      '<table class="top-row"><tr>' +
      '<td class="pl-lbl">Phụ lục số 19</td>' +
      '<td class="hd-lbl">' + (form.hopDong ? 'Hợp đồng số: ' + esc(form.hopDong) : '') + '</td>' +
      '</tr></table>' +
      '<div class="title">TRÍCH LỤC BẢN ĐỒ ĐỊA CHÍNH</div>' +
      '<div class="sub">Số: ' + esc(form.soTrichLuc) + '</div>' +
      '<div class="info-line">1. Thửa đất số: <b>' + esc(form.thua || '........') + '</b> &nbsp;&nbsp;&nbsp;; Tờ bản đồ địa chính: <b>' + esc(form.to || '........') + '</b></div>' +
      '<div class="info-line">2. Diện tích: <b>' + esc(form.dienTich) + '</b> m² &nbsp;; loại đất: <b>' + esc(form.loaiDat || '........') + '</b> &nbsp;; Tài liệu đo đạc: ' + esc(form.taiLieu) + '</div>' +
      '<div class="info-line">3. Tên người sử dụng đất, người quản lý đất: ' + esc(form.chu) + '</div>' +
      '<div class="info-line">4. Giấy chứng nhận: ' + esc(form.gcn) + '</div>' +
      '<div class="info-line">5. Tình hình thay đổi ranh giới thửa đất (nếu có): ' + esc(form.thayDoi) + '</div>' +
      '<div class="info-line">6. Các thông tin khác cần trích lục:</div>' +
      khacHtml +
      '<table class="main-grid"><tbody><tr>' +
      '<td class="col-left"><div class="sec-h">7. Sơ đồ thửa đất, tài sản gắn liền với đất</div><div class="map-box">' + diagramHtml + '</div></td>' +
      '<td class="col-right"><div class="sec-h">8. Tọa độ đỉnh thửa, kích thước cạnh</div>' + coordTable + '</td>' +
      '</tr></tbody></table>' +
      '<table class="sign-grid"><tbody><tr>' +
      '<td>' +
      '<div class="italic">' + dateLine + '</div>' +
      '<div class="italic">Người kiểm tra: ' + esc(form.nguoiKiemTra) + '</div>' +
      '<div><b>Người trích lục</b></div>' +
      '<div class="italic" style="font-size:9pt;">(Ký, ghi rõ họ và tên)</div>' +
      '<div class="sig-space"></div>' +
      '<div class="sig-name">' + esc(form.nguoiTrichLuc) + '</div>' +
      '</td>' +
      '<td>' +
      '<div class="italic">' + dateLine + '</div>' +
      '<div><b>Cơ quan trích lục</b></div>' +
      '<div><b>' + esc(form.coQuan) + '</b></div>' +
      chucVuHtml +
      '<div class="sig-space" style="height:34px;"></div>' +
      '<div class="sig-name">' + esc(form.nguoiKy) + '</div>' +
      '</td>' +
      '</tr></tbody></table>' +
      '</div></div></body></html>';
  }

  /** Tạo file DXF gồm thửa chính, mốc cắm và các đoạn râu thửa (10, 23, 31, 32) đã cắt theo khung. */
  function buildRauDxf(data, form) {
    const ents = [];
    const { outer, holes, rau, frame } = data;
    const layers = [
      { name: 'RANH_THUA_CHINH', color: 1 },
      { name: 'MOC_CAM', color: 1 },
      { name: 'SO_MOC', color: 3 },
      { name: 'NHAN_THUA', color: 2 },
      { name: 'KHUNG_SO_DO', color: 8 }
    ];
    const usedLv = new Set();
    for (const s of rau.segs) {
      const ln = 'RAU_L' + (s.lv || '10').replace(/[^\w]/g, '_');
      if (!usedLv.has(ln)) {
        usedLv.add(ln);
        layers.push({ name: ln, color: s.lv === '10' ? 7 : (s.lv === '23' ? 4 : 6) });
      }
      ents.push({ type: 'polyline', layer: ln, pts: [[s.ax, s.ay], [s.bx, s.by]], closed: false });
    }
    for (const lb of rau.labels) {
      ents.push({ type: 'text', layer: 'NHAN_THUA', p: [lb.e, lb.n], h: 1.2, text: lb.text });
    }
    const addRing = (r, isMain) => {
      ents.push({ type: 'polyline', layer: 'RANH_THUA_CHINH', pts: r.map(p => [p.E, p.N]), closed: true });
      if (isMain) {
        r.forEach((p, k) => {
          ents.push({ type: 'point', layer: 'MOC_CAM', p: [p.E, p.N] });
          ents.push({ type: 'text', layer: 'SO_MOC', p: [p.E + 0.4, p.N + 0.4], h: 0.9, text: String(k + 1) });
        });
      }
    };
    addRing(outer, true);
    holes.forEach(h => addRing(h, false));
    if (form.thua) {
      try {
        const c = Attr.labelPoint(outer);
        ents.push({ type: 'text', layer: 'NHAN_THUA', p: [c.E, c.N], h: 1.5, text: String(form.thua) });
      } catch (e) { }
    }
    ents.push({
      type: 'polyline',
      layer: 'KHUNG_SO_DO',
      pts: [[frame.minE, frame.minN], [frame.maxE, frame.minN], [frame.maxE, frame.maxN], [frame.minE, frame.maxN]],
      closed: true
    });
    return Export.dxf({ layers, entities: ents });
  }

  /** Mở bảng thiết lập & xuất Trích lục bản đồ địa chính (Phụ lục 19). */
  function open(Ly, fi) {
    if (!Ly || !Ly.features || !Ly.features[fi]) return;
    const f = Ly.features[fi];
    if (f.kind !== 'polygon') {
      C.toast('Trích lục bản đồ địa chính chỉ áp dụng cho đối tượng thửa đất (vùng khép kín).', true);
      return;
    }
    Attr.prepareForSearch(Ly);
    const rg = Attr.vnRings(Ly, f);
    const outer = orderOuterVN(rg.outer);
    const holes = rg.holes.map(h => orderOuterVN(h));
    const area = Attr.areaOf({ outer, holes });
    const lb = Attr.featLabel(Ly, f);
    const props = f.props || {};
    let gcn = '';
    for (const k of Object.keys(props)) {
      const kl = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (['sogcn', 'gcn', 'giaychungnhan', 'sogiaychungnhan', 'shgcn', 'sophathanh'].includes(kl) && props[k]) {
        gcn = String(props[k]); break;
      }
    }

    const cfg = loadCfg();
    const dtDefault = lb.dt !== '' && lb.dt != null ? String(lb.dt) : area.toFixed(1).replace('.', ',');

    const box = document.createElement('div');
    box.innerHTML =
      '<div id="tlPrev" style="background:#fff;border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:8px;"></div>' +
      '<div id="tlStats" class="hint" style="margin:0 0 8px;"></div>' +
      '<div class="two">' +
        '<div><label class="f"><input type="checkbox" id="tlUseRau"' + (cfg.useRau ? ' checked' : '') + '> Lấy râu thửa (Level)</label>' +
        '<input type="text" id="tlLevels" value="' + C.esc(cfg.rauLevels) + '" placeholder="10,23,31,32"></div>' +
        '<div><label class="f">Độ dài râu thửa</label><select id="tlMargin">' +
          '<option value="10"' + (cfg.marginPct == 10 ? ' selected' : '') + '>Ngắn (10%)</option>' +
          '<option value="15"' + (cfg.marginPct == 15 ? ' selected' : '') + '>Vừa (15%)</option>' +
          '<option value="25"' + (cfg.marginPct == 25 ? ' selected' : '') + '>Hơi rộng (25%)</option>' +
          '<option value="40"' + (cfg.marginPct == 40 ? ' selected' : '') + '>Rộng (40%)</option>' +
        '</select></div>' +
      '</div>' +
      '<div class="two" style="margin-top:6px;">' +
        '<label class="f" style="margin:4px 0;"><input type="checkbox" id="tlVerts"' + (cfg.showVerts ? ' checked' : '') + '> Số đỉnh &amp; cạnh</label>' +
        '<label class="f" style="margin:4px 0;"><input type="checkbox" id="tlNeigh"' + (cfg.showNeighbor ? ' checked' : '') + '> Số thửa lân cận</label>' +
      '</div>' +
      '<div class="two">' +
        '<div><label class="f">Số trích lục</label><input type="text" id="tlSo" value="' + C.esc(cfg.soTrichLuc) + '"></div>' +
        '<div><label class="f">Hợp đồng số</label><input type="text" id="tlHd" value="' + C.esc(cfg.hopDong) + '" placeholder="vd: 3723/25HCCCN.VPĐK"></div>' +
      '</div>' +
      '<div class="two">' +
        '<div><label class="f">1. Thửa đất số</label><input type="text" id="tlThua" value="' + C.esc(lb.thua != null ? lb.thua : '') + '"></div>' +
        '<div><label class="f">Tờ bản đồ ĐC</label><input type="text" id="tlTo" value="' + C.esc(lb.to != null ? lb.to : '') + '"></div>' +
      '</div>' +
      '<div class="two">' +
        '<div><label class="f">2. Diện tích (m²)</label><input type="text" id="tlDt" value="' + C.esc(dtDefault) + '"></div>' +
        '<div><label class="f">Loại đất</label><input type="text" id="tlLoai" value="' + C.esc(lb.loai || '') + '"></div>' +
      '</div>' +
      '<label class="f">Tài liệu đo đạc</label><input type="text" id="tlTl" value="' + C.esc(cfg.taiLieu) + '">' +
      '<label class="f">3. Tên người sử dụng / quản lý đất</label><input type="text" id="tlChu" value="' + C.esc(lb.chu || '') + '">' +
      '<label class="f">4. Giấy chứng nhận</label><input type="text" id="tlGcn" value="' + C.esc(gcn) + '">' +
      '<label class="f">5. Tình hình thay đổi ranh giới</label><input type="text" id="tlTd" value="' + C.esc(cfg.thayDoi) + '">' +
      '<label class="f">6. Các thông tin khác cần trích lục</label><textarea id="tlKhac" rows="2" style="width:100%;font:inherit;color:var(--text);background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:8px;">' + C.esc(cfg.khac) + '</textarea>' +
      '<details style="margin-top:8px;"><summary style="color:var(--muted);cursor:pointer;font-size:13px;">⚙ Thông tin ký, cơ quan &amp; số lẻ tọa độ</summary>' +
        '<div class="two">' +
          '<div><label class="f">Địa danh</label><input type="text" id="tlDd" value="' + C.esc(cfg.diaDanh) + '"></div>' +
          '<div><label class="f">Số lẻ tọa độ/cạnh</label><select id="tlDec"><option value="2"' + (cfg.decimals == 2 ? ' selected' : '') + '>2 chữ số (0.01)</option><option value="3"' + (cfg.decimals == 3 ? ' selected' : '') + '>3 chữ số (0.001)</option></select></div>' +
        '</div>' +
        '<div class="two">' +
          '<div><label class="f">Người kiểm tra</label><input type="text" id="tlKt" value="' + C.esc(cfg.nguoiKiemTra) + '"></div>' +
          '<div><label class="f">Người trích lục</label><input type="text" id="tlNtl" value="' + C.esc(cfg.nguoiTrichLuc) + '"></div>' +
        '</div>' +
        '<label class="f">Cơ quan trích lục</label><input type="text" id="tlCq" value="' + C.esc(cfg.coQuan) + '">' +
        '<div class="two">' +
          '<div><label class="f">Chức vụ ký (xuống dòng)</label><textarea id="tlCv" rows="2" style="width:100%;font:inherit;color:var(--text);background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:8px;">' + C.esc(cfg.chucVu) + '</textarea></div>' +
          '<div><label class="f">Người ký cơ quan</label><input type="text" id="tlNk" value="' + C.esc(cfg.nguoiKy) + '"></div>' +
        '</div>' +
      '</details>' +
      '<div class="btnrow">' +
        '<button class="primary" id="tlPrint">🖨 Xem &amp; In / PDF</button>' +
        '<button id="tlDoc">📄 Tải Word (.doc)</button>' +
        '<button id="tlHtml">🌐 Tải HTML</button>' +
        '<button id="tlDxf">⬇ CAD (râu thửa)</button>' +
      '</div>';

    C.openSheet('Trích lục BĐĐC (Phụ lục 19 – TT26)', box, true);

    const $ = (id) => box.querySelector(id);
    const readForm = () => ({
      useRau: $('#tlUseRau').checked,
      rauLevels: $('#tlLevels').value.trim() || '10,23,31,32',
      marginPct: Number($('#tlMargin').value) || 35,
      showVerts: $('#tlVerts').checked,
      showNeighbor: $('#tlNeigh').checked,
      soTrichLuc: $('#tlSo').value,
      hopDong: $('#tlHd').value.trim(),
      thua: $('#tlThua').value.trim(),
      to: $('#tlTo').value.trim(),
      dienTich: $('#tlDt').value.trim(),
      loaiDat: $('#tlLoai').value.trim(),
      taiLieu: $('#tlTl').value.trim(),
      chu: $('#tlChu').value.trim(),
      gcn: $('#tlGcn').value.trim(),
      thayDoi: $('#tlTd').value.trim(),
      khac: $('#tlKhac').value,
      diaDanh: $('#tlDd').value.trim(),
      ngay: '....',
      thang: '....',
      nam: String(new Date().getFullYear()),
      decimals: Number($('#tlDec').value) || 2,
      nguoiKiemTra: $('#tlKt').value.trim(),
      nguoiTrichLuc: $('#tlNtl').value.trim(),
      coQuan: $('#tlCq').value.trim(),
      chucVu: $('#tlCv').value,
      nguoiKy: $('#tlNk').value.trim()
    });

    let curData = null, curSvg = '';
    const refreshPreview = () => {
      const fm = readForm();
      saveCfg(fm);
      const frame = computeFrame(outer, fm.marginPct, 360, 270);
      const rau = extractRauThua(Ly, f, outer, frame, fm.rauLevels, fm.useRau, fm.showNeighbor);
      curData = { frame, outer, holes, rau, thuaText: fm.thua };
      curSvg = buildDiagramSvg(curData, { showVerts: fm.showVerts, decimals: fm.decimals });
      $('#tlPrev').innerHTML = curSvg;
      $('#tlStats').textContent = (fm.useRau
        ? 'Râu thửa (Level ' + fm.rauLevels + '): ' + rau.segs.length + ' đoạn'
        : 'Đang tắt râu thửa') +
        (fm.showNeighbor ? ' · ' + rau.labels.length + ' nhãn lân cận' : '') +
        ' · ' + outer.length + ' đỉnh thửa (VN-2000)';
    };

    refreshPreview();
    ['#tlUseRau', '#tlMargin', '#tlVerts', '#tlNeigh', '#tlDec'].forEach(sel => $(sel).onchange = refreshPreview);
    ['#tlLevels', '#tlThua'].forEach(sel => $(sel).oninput = refreshPreview);

    const baseName = () => {
      const fm = readForm();
      return 'TrichLuc_PL19' +
        (fm.to ? '_To' + Attr.safeName(fm.to) : '') +
        '_Thua' + (fm.thua ? Attr.safeName(fm.thua) : (fi + 1));
    };

    $('#tlPrint').onclick = () => {
      refreshPreview();
      const fm = readForm();
      const html = buildDocumentHtml(fm, outer, curSvg, false);
      const w = window.open('', '_blank');
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
        setTimeout(() => { try { w.focus(); w.print(); } catch (e) { } }, 300);
      } else {
        Attr.doSave(baseName() + '.html', html, 'text/html;charset=utf-8');
        C.toast('Trình duyệt chặn mở cửa sổ in — đã tải file HTML để mở và in.');
      }
    };

    $('#tlHtml').onclick = () => {
      refreshPreview();
      const html = buildDocumentHtml(readForm(), outer, curSvg, false);
      Attr.doSave(baseName() + '.html', html, 'text/html;charset=utf-8');
    };

    $('#tlDoc').onclick = async () => {
      refreshPreview();
      const fm = readForm();
      C.loading(true, 'Đang tạo file Word (.doc)…');
      try {
        const png = await svgToPngDataUrl(curSvg, 1080, 810);
        const diag = png
          ? '<img src="' + png + '" width="340" height="255" style="display:block;width:100%;height:auto;"/>'
          : curSvg;
        const docHtml = '\ufeff' + buildDocumentHtml(fm, outer, diag, true);
        await Attr.doSave(baseName() + '.doc', docHtml, 'application/msword;charset=utf-8');
      } finally {
        C.loading(false);
      }
    };

    $('#tlDxf').onclick = () => {
      refreshPreview();
      const fm = readForm();
      const dxf = buildRauDxf(curData, fm);
      Attr.doSave(baseName() + '_RauThua.dxf', dxf, 'application/dxf');
    };
  }

  global.TrichLuc = { init, open };
})(window);
