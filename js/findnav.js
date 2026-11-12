/*
 * Tìm chữ trên bản vẽ (ghi chú CAD/DGN + thuộc tính) và dẫn đường bằng Google Maps.
 */
(function (global) {
  'use strict';
  let C;
  const SKIP = ['color', 'style', 'align', 'etype', 'layer', 'rid'];
  const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim();
  let marks = null, pulse = null, lastQ = '', lastOpts = { attr: true, exact: false };
  const MAX = 300;

  function init(ctx) {
    C = ctx;
    marks = L.layerGroup().addTo(C.map);
    try { const o = JSON.parse(localStorage.getItem('findOpts') || 'null'); if (o) lastOpts = o; } catch (e) { }
  }

  // ---------- Dẫn đường ----------
  function navTo(lat, lng, label) {
    if (!isFinite(lat) || !isFinite(lng)) { C.toast('Không xác định được vị trí đích.', true); return; }
    let vn = null;
    try { vn = CRS.toVN2000(lat, lng, C.S.lon0); } catch (e) { }
    const box = document.createElement('div');
    box.innerHTML =
      (label ? '<div class="nav-dest">' + C.esc(label) + '</div>' : '') +
      '<table class="nav-tb"><tr><td>Vĩ độ, kinh độ</td><td><b>' + lat.toFixed(7) + ', ' + lng.toFixed(7) + '</b></td></tr>' +
      (vn ? '<tr><td>VN-2000 (KTT ' + CRS.fmtDeg(C.S.lon0) + ')</td><td>X ' + C.fmt(vn.N, 2) + ' · Y ' + C.fmt(vn.E, 2) + '</td></tr>' : '') + '</table>' +
      '<label class="f">Chọn phương tiện – mở Google Maps chỉ đường từ vị trí hiện tại</label>' +
      '<div class="nav-modes"><button data-m="l" class="primary">🛵 Xe máy</button><button data-m="d">🚗 Ô tô</button><button data-m="w">🚶 Đi bộ</button></div>' +
      '<div class="btnrow"><button id="navCopy">Sao chép tọa độ</button><button id="navShow">Xem trên Google Maps</button></div>' +
      '<div class="hint">Cần cài Google Maps và bật GPS. Không có app Google Maps thì mở bằng trình duyệt.</div>';
    C.openSheet('Dẫn đường tới đây', box);
    let def = 'l';
    try { def = localStorage.getItem('navMode') || 'l'; } catch (e) { }
    box.querySelectorAll('.nav-modes button').forEach(b => {
      b.classList.toggle('primary', b.dataset.m === def);
      b.onclick = () => { try { localStorage.setItem('navMode', b.dataset.m); } catch (e) { } go(lat, lng, b.dataset.m); C.closeSheet(); };
    });
    box.querySelector('#navCopy').onclick = () => {
      const t = lat.toFixed(7) + ',' + lng.toFixed(7);
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => C.toast('Đã chép: ' + t), () => C.toast(t));
    };
    box.querySelector('#navShow').onclick = () => openUrl('https://www.google.com/maps/search/?api=1&query=' + lat.toFixed(7) + ',' + lng.toFixed(7));
  }

  function go(lat, lng, mode) {
    if (global.AndroidBridge && AndroidBridge.navigate) {
      const r = AndroidBridge.navigate(lat, lng, mode);
      if (r && r !== 'ok' && r !== 'web') C.toast(r, true);
      return;
    }
    const tm = mode === 'l' ? 'two-wheeler' : mode === 'w' ? 'walking' : 'driving';
    openUrl('https://www.google.com/maps/dir/?api=1&destination=' + lat.toFixed(7) + ',' + lng.toFixed(7) + '&travelmode=' + tm);
  }
  function openUrl(u) {
    const w = window.open(u, '_blank');
    if (!w) location.href = u;
  }

  /** Tâm (lat,lng) của một/nhiều đối tượng theo hộp bao đã chuẩn bị sẵn của lớp. */
  function featCenter(Ly, fis) {
    const d = Ly.data;
    if (!d || !d.fBox) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    (Array.isArray(fis) ? fis : [fis]).forEach(i => {
      if (d.fKind && d.fKind[i] === 3) return; // chữ / đối tượng lỗi: không có hộp bao
      x0 = Math.min(x0, d.fBox[i * 4]); y0 = Math.min(y0, d.fBox[i * 4 + 1]); x1 = Math.max(x1, d.fBox[i * 4 + 2]); y1 = Math.max(y1, d.fBox[i * 4 + 3]);
    });
    if (!isFinite(x0)) return null;
    return { lat: (L.FastLayer.unY(y0) + L.FastLayer.unY(y1)) / 2, lng: (L.FastLayer.unX(x0) + L.FastLayer.unX(x1)) / 2 };
  }

  // ---------- Tìm chữ ----------
  function search(q, opts) {
    const nq = norm(q);
    const out = [];
    if (!nq) return out;
    const match = (s) => { const v = norm(s); return opts.exact ? v === nq : v.indexOf(nq) >= 0; };
    for (const Ly of C.layers()) {
      if (Ly.texts) {
        for (const t of Ly.texts) {
          if (!t.text || !match(t.text)) continue;
          out.push({ Ly, kind: 'text', text: String(t.text), lat: t.lat, lng: t.lng, lid: t.lid });
          if (out.length >= MAX) return out;
        }
      }
      if (opts.attr) {
        const seen = new Set();
        for (let i = 0; i < Ly.features.length; i++) {
          const f = Ly.features[i];
          if (f.kind === 'text' || !f.props) continue;
          const key = f.rid != null ? 'r' + f.rid : 'f' + i;
          if (seen.has(key)) continue;
          for (const k of Object.keys(f.props)) {
            if (SKIP.includes(k)) continue;
            const v = f.props[k];
            if (v == null || v === '' || typeof v === 'object') continue;
            if (match(v)) {
              seen.add(key);
              out.push({ Ly, kind: 'attr', fi: i, field: k, text: String(v) });
              break;
            }
          }
          if (out.length >= MAX) return out;
        }
      }
    }
    return out;
  }

  function hl(text, q) {
    const s = String(text), n = norm(s), nq = norm(q);
    const i = nq ? n.indexOf(nq) : -1;
    // norm() giữ nguyên độ dài với chữ đã dựng sẵn (NFC) nên dùng chung vị trí được
    if (i < 0 || n.length !== s.normalize('NFC').length) return C.esc(s);
    const t = s.normalize('NFC');
    return C.esc(t.slice(0, i)) + '<mark>' + C.esc(t.slice(i, i + nq.length)) + '</mark>' + C.esc(t.slice(i + nq.length));
  }

  function posOf(r) {
    if (r.kind === 'text') return { lat: r.lat, lng: r.lng };
    return featCenter(r.Ly, [r.fi]);
  }

  function showResult(r) {
    C.closeSheet();
    if (r.kind === 'attr') {
      C.select(r.Ly, [r.fi], true);
    } else {
      C.map.setView([r.lat, r.lng], Math.max(C.map.getZoom(), 19));
    }
    const p = posOf(r);
    if (!p) return;
    if (pulse) C.map.removeLayer(pulse);
    pulse = L.circleMarker([p.lat, p.lng], { radius: 16, color: '#ff9800', weight: 3, fill: false, className: 'find-pulse', interactive: false }).addTo(C.map);
    pulse.bindTooltip(C.esc(r.text), { permanent: true, direction: 'top', className: 'find-tip', offset: [0, -14] }).openTooltip();
    setTimeout(() => { if (pulse) { C.map.removeLayer(pulse); pulse = null; } }, 8000);
  }

  function drawMarks(res) {
    marks.clearLayers();
    res.forEach(r => {
      const p = posOf(r);
      if (!p) return;
      L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#ff9800', fillOpacity: 1 })
        .on('click', (e) => { L.DomEvent.stop(e); markPopup(r, p); })
        .addTo(marks);
    });
  }
  function markPopup(r, p) {
    const box = document.createElement('div');
    box.innerHTML = '<div><b>' + C.esc(r.text) + '</b></div><div class="hint">' + C.esc(r.Ly.name) + (r.kind === 'attr' ? ' · cột ' + C.esc(r.field) : ' · ghi chú') + '</div>' +
      '<div class="pbtn"><button class="pn">🚗 Dẫn đường</button></div>';
    box.querySelector('.pn').onclick = () => { C.map.closePopup(); navTo(p.lat, p.lng, r.text); };
    L.popup({ maxWidth: 280 }).setLatLng([p.lat, p.lng]).setContent(box).openOn(C.map);
  }

  function showTextSearch(prefill) {
    if (!C.layers().length) { C.toast('Chưa có dữ liệu. Hãy mở file trước.', true); return; }
    const box = document.createElement('div');
    box.innerHTML =
      '<div class="seg"><button id="segA">Tờ · thửa · chủ</button><button class="on">Tìm chữ</button></div>' +
      '<label class="f">Chữ cần tìm (không phân biệt hoa thường, có dấu hay không dấu)</label>' +
      '<div class="find-row"><input type="text" id="fQ" placeholder="vd: ONT, 125, Nguyễn, Suối Cát…" autocomplete="off"><button class="primary" id="fGo">Tìm</button></div>' +
      '<label class="radio"><input type="checkbox" id="fAttr"' + (lastOpts.attr ? ' checked' : '') + '> Tìm cả trong bảng thuộc tính</label>' +
      '<label class="radio"><input type="checkbox" id="fExact"' + (lastOpts.exact ? ' checked' : '') + '> Khớp nguyên văn (vd tìm thửa "12" không ra "125")</label>' +
      '<div id="fMsg" class="hint"></div><div id="fRes"></div>';
    C.openSheet('Tìm chữ trên bản đồ', box);
    const $ = (s) => box.querySelector(s);
    $('#fQ').value = prefill != null ? prefill : lastQ;
    $('#segA').onclick = () => Attr.showSearch();
    function run() {
      const q = $('#fQ').value;
      lastQ = q;
      lastOpts = { attr: $('#fAttr').checked, exact: $('#fExact').checked };
      try { localStorage.setItem('findOpts', JSON.stringify(lastOpts)); } catch (e) { }
      if (!norm(q)) { $('#fMsg').textContent = 'Nhập chữ cần tìm.'; return; }
      const res = search(q, lastOpts);
      drawMarks(res);
      const nT = res.filter(r => r.kind === 'text').length;
      $('#fMsg').innerHTML = res.length ? (res.length + ' kết quả' + (res.length >= MAX ? ' (hiện ' + MAX + ' đầu)' : '') + ' — ' + nT + ' ghi chú, ' + (res.length - nT) + ' thuộc tính. Các kết quả được đánh dấu chấm cam trên bản đồ. <a href="#" id="fClr">Xóa đánh dấu</a>') : 'Không tìm thấy "' + C.esc(q) + '".';
      const clr = $('#fClr'); if (clr) clr.onclick = (e) => { e.preventDefault(); marks.clearLayers(); C.toast('Đã xóa đánh dấu'); };
      const out = $('#fRes'); out.innerHTML = '';
      res.slice(0, 150).forEach(r => {
        const row = document.createElement('div'); row.className = 'resrow';
        row.innerHTML = '<div class="rt">' + hl(r.text, lastOpts.exact ? '' : q) + '</div>' +
          '<div class="rs">' + C.esc(r.Ly.name) + (r.kind === 'attr' ? ' · cột ' + C.esc(r.field) : ' · ghi chú bản vẽ') + '</div>' +
          '<div class="ra"><button class="z">Xem</button><button class="n">🚗 Dẫn đường</button></div>';
        row.querySelector('.z').onclick = () => showResult(r);
        row.querySelector('.n').onclick = () => { const p = posOf(r); if (p) navTo(p.lat, p.lng, r.text); };
        out.appendChild(row);
      });
      if (res.length > 150) out.insertAdjacentHTML('beforeend', '<div class="hint">Danh sách hiện 150 dòng đầu; tất cả ' + res.length + ' kết quả đã đánh dấu trên bản đồ.</div>');
    }
    $('#fGo').onclick = run;
    $('#fQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#fQ').blur(); run(); } });
    if ($('#fQ').value) run(); else setTimeout(() => $('#fQ').focus(), 250);
  }

  global.FindNav = { init, navTo, featCenter, showTextSearch, search };
})(window);
