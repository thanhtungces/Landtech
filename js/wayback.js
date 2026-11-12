/*
 * Xem lùi thời gian ảnh vệ tinh – dùng kho ảnh lưu trữ Esri World Imagery Wayback (2014 → nay).
 * - Chỉ liệt kê các mốc mà ảnh TẠI VỊ TRÍ ĐANG XEM thực sự thay đổi (dịch vụ tilemap của Wayback).
 * - Hiện ngày chụp, nguồn ảnh, độ phân giải (dịch vụ metadata).
 * - Chế độ so sánh: kéo vạch để xem ảnh cũ (trái) và ảnh nền hiện tại (phải).
 */
(function (global) {
  'use strict';
  const CONFIG_URL = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
  const TILE_URL = 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/{rel}/{z}/{y}/{x}';
  const TILEMAP_URL = 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tilemap/';

  let ctx, map, releases = null, byNum = {}, versions = [], idx = -1, layer = null, active = false;
  let compare = false, divX = 0.5, lastKey = '', searching = 0;
  const metaCache = {};
  const $ = (id) => document.getElementById(id);
  const dmy = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);

  async function loadConfig() {
    if (releases) return releases;
    let cfg = null;
    try {
      const c = JSON.parse(localStorage.getItem('waybackCfg') || 'null');
      if (c && Date.now() - c.t < 24 * 3600e3) cfg = c.d;
    } catch (e) { }
    if (!cfg) {
      const r = await fetch(CONFIG_URL, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      cfg = await r.json();
      try { localStorage.setItem('waybackCfg', JSON.stringify({ t: Date.now(), d: cfg })); } catch (e) { }
    }
    releases = Object.keys(cfg).map(k => {
      const m = /(\d{4}-\d{2}-\d{2})/.exec(cfg[k].itemTitle || '');
      return { num: +k, date: m ? m[1] : '', meta: cfg[k].metadataLayerUrl };
    }).filter(r => r.date).sort((a, b) => b.date.localeCompare(a.date));
    releases.forEach(r => byNum[r.num] = r);
    return releases;
  }

  function centerTile() {
    const z = Math.max(10, Math.min(17, Math.round(map.getZoom())));
    const c = map.getCenter(), n = Math.pow(2, z);
    const x = Math.floor((c.lng + 180) / 360 * n);
    const y = Math.floor((1 - Math.asinh(Math.tan(c.lat * Math.PI / 180)) / Math.PI) / 2 * n);
    return { z, x, y };
  }

  /** Các mốc có ảnh thay đổi tại ô ảnh ở tâm màn hình (mới → cũ). */
  async function findVersions() {
    const rel = await loadConfig();
    const t = centerTile();
    const out = [];
    let i = 0;
    while (i < rel.length) {
      const r = await fetch(TILEMAP_URL + rel[i].num + '/' + t.z + '/' + t.y + '/' + t.x);
      const j = await r.json();
      if (!j.data || !j.data[0]) break;
      const sel = j.select && j.select[0] != null ? byNum[j.select[0]] : rel[i];
      if (!sel) break;
      if (!out.includes(sel)) out.push(sel);
      const next = rel.indexOf(sel) + 1;
      i = next > i ? next : i + 1;
    }
    return out;
  }

  async function metadata(r) {
    const c = map.getCenter(), z = Math.max(10, Math.min(23, Math.round(map.getZoom())));
    const key = r.num + '|' + z + '|' + c.lat.toFixed(4) + ',' + c.lng.toFixed(4);
    if (metaCache[key]) return metaCache[key];
    const url = r.meta + '/' + (23 - z) + '/query?geometry=' + c.lng + ',' + c.lat +
      '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=SRC_DATE2,NICE_DESC,SRC_RES,SRC_ACC&returnGeometry=false&f=json';
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 30000); // máy chủ metadata các năm cũ có thể trả lời chậm
      const j = await (await fetch(url, { signal: ac.signal })).json();
      clearTimeout(to);
      const a = j.features && j.features[0] && j.features[0].attributes;
      if (!a) return null;
      const d = a.SRC_DATE2 ? new Date(a.SRC_DATE2).toISOString().slice(0, 10) : null;
      return (metaCache[key] = { date: d, src: a.NICE_DESC, res: a.SRC_RES, acc: a.SRC_ACC });
    } catch (e) { return null; }
  }

  // ---------- Giao diện ----------
  function buildUI() {
    const bar = document.createElement('div');
    bar.id = 'timeBar'; bar.className = 'hidden';
    bar.innerHTML =
      '<div class="tb-head"><button id="tbPrev" aria-label="Cũ hơn">◀</button>' +
      '<div class="tb-info"><div id="tbDate">—</div><div id="tbMeta" class="tb-meta"></div></div>' +
      '<button id="tbNext" aria-label="Mới hơn">▶</button></div>' +
      '<div id="tbChips" class="tb-chips"></div>' +
      '<div class="tb-row"><button id="tbCompare">⇆ So sánh</button><button id="tbReload">↻ Tìm tại đây</button>' +
      '<label class="tb-op">Độ mờ <input type="range" id="tbOpacity" min="20" max="100" value="100"></label><button id="tbClose">✕</button></div>';
    document.body.appendChild(bar);
    const sw = document.createElement('div');
    sw.id = 'swipe'; sw.className = 'hidden';
    sw.innerHTML = '<div class="sw-line"></div><div class="sw-knob">⇆</div><div class="sw-lab sw-l"></div><div class="sw-lab sw-r">Hiện tại</div>';
    document.body.appendChild(sw);

    $('tbPrev').onclick = () => select(idx + 1);
    $('tbNext').onclick = () => select(idx - 1);
    $('tbClose').onclick = () => toggle(false);
    $('tbReload').onclick = () => refresh(true);
    $('tbCompare').onclick = () => setCompare(!compare);
    $('tbOpacity').oninput = (e) => { if (layer) layer.setOpacity(e.target.value / 100); };

    // kéo vạch so sánh
    let drag = false;
    const knob = sw.querySelector('.sw-knob');
    const move = (x) => { divX = Math.max(0.02, Math.min(0.98, x / window.innerWidth)); clip(); };
    knob.addEventListener('pointerdown', (e) => { drag = true; knob.setPointerCapture(e.pointerId); e.preventDefault(); e.stopPropagation(); });
    knob.addEventListener('pointermove', (e) => { if (drag) move(e.clientX); });
    knob.addEventListener('pointerup', () => { drag = false; });
    knob.addEventListener('pointercancel', () => { drag = false; });
    L.DomEvent.disableClickPropagation(bar);
    L.DomEvent.disableScrollPropagation(bar);
  }

  function renderChips() {
    const box = $('tbChips');
    box.innerHTML = versions.map((v, i) => '<button data-i="' + i + '" class="' + (i === idx ? 'on' : '') + '">' + dmy(v.date).slice(3) + '</button>').join('');
    box.querySelectorAll('button').forEach(b => b.onclick = () => select(+b.dataset.i));
    const on = box.querySelector('.on');
    if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  async function select(i) {
    if (!versions.length || i < 0 || i >= versions.length) return;
    idx = i;
    const v = versions[i];
    const url = TILE_URL.replace('{rel}', v.num);
    if (!layer) {
      if (!map.getPane('waybackPane')) { const p = map.createPane('waybackPane'); p.style.zIndex = 250; }
      layer = L.tileLayer(url, { pane: 'waybackPane', maxNativeZoom: 19, maxZoom: 22, opacity: $('tbOpacity').value / 100, attribution: 'Ảnh lịch sử © Esri World Imagery Wayback' });
      layer.on('load tileload', clip);
      layer.addTo(map);
    } else layer.setUrl(url);
    $('tbDate').textContent = 'Phiên bản ' + dmy(v.date) + '  (' + (versions.length - i) + '/' + versions.length + ')';
    $('tbMeta').textContent = 'Đang lấy ngày chụp…';
    $('tbPrev').disabled = i >= versions.length - 1;
    $('tbNext').disabled = i <= 0;
    document.querySelector('#swipe .sw-l').textContent = dmy(v.date);
    renderChips();
    clip();
    const m = await metadata(v);
    if (versions[idx] !== v) return;
    if (m) {
      const parts = [];
      if (m.date) parts.push('Ngày chụp ' + dmy(m.date));
      if (m.src) parts.push(m.src);
      if (m.res) parts.push('độ phân giải ' + (+m.res).toFixed(2) + ' m');
      $('tbMeta').textContent = parts.join(' · ');
      if (m.date) { $('tbDate').textContent = 'Ảnh chụp ' + dmy(m.date) + '  (' + (versions.length - idx) + '/' + versions.length + ')'; document.querySelector('#swipe .sw-l').textContent = dmy(m.date); }
    } else $('tbMeta').textContent = 'Không rõ ngày chụp (hiển thị ngày phát hành)';
  }

  async function refresh(force) {
    const t = centerTile();
    const key = t.z + '/' + t.x + '/' + t.y;
    if (!force && key === lastKey) return;
    lastKey = key;
    const my = ++searching;
    $('tbMeta').textContent = 'Đang tìm các mốc ảnh tại vị trí này…';
    try {
      const keepDate = versions[idx] ? versions[idx].date : null;
      const vs = await findVersions();
      if (my !== searching || !active) return;
      if (!vs.length) { versions = []; $('tbChips').innerHTML = ''; $('tbDate').textContent = 'Không có ảnh lưu trữ tại đây'; $('tbMeta').textContent = ''; return; }
      versions = vs;
      // giữ mốc gần nhất với mốc đang xem; lần đầu chọn mốc cũ thứ 2 (để thấy khác biệt)
      let pick = vs.length > 1 ? 1 : 0;
      if (keepDate) {
        let best = Infinity;
        vs.forEach((v, i) => { const d = Math.abs(Date.parse(v.date) - Date.parse(keepDate)); if (d < best) { best = d; pick = i; } });
      }
      select(pick);
    } catch (e) {
      if (my === searching) { $('tbMeta').textContent = 'Lỗi kết nối kho ảnh lịch sử: ' + e.message; ctx.toast('Không tải được ảnh lịch sử. Kiểm tra kết nối Internet.', true); }
    }
  }

  function clip() {
    if (!layer) return;
    const el = layer.getContainer();
    if (!el) return;
    const swEl = $('swipe');
    if (!compare) { el.style.clip = ''; swEl.classList.add('hidden'); return; }
    swEl.classList.remove('hidden');
    const size = map.getSize();
    const nw = map.containerPointToLayerPoint([0, 0]);
    const se = map.containerPointToLayerPoint(size);
    const x = nw.x + size.x * divX;
    el.style.clip = 'rect(' + [nw.y, x, se.y, nw.x].map(v => v + 'px').join(',') + ')';
    swEl.style.left = (size.x * divX) + 'px';
  }

  function setCompare(on) {
    compare = on;
    $('tbCompare').classList.toggle('on', on);
    $('tbOpacity').value = 100; if (layer) layer.setOpacity(1);
    clip();
  }

  async function toggle(on) {
    active = on == null ? !active : on;
    $('btnTime').classList.toggle('on', active);
    $('timeBar').classList.toggle('hidden', !active);
    document.body.classList.toggle('time-on', active);
    if (active) {
      if (map.getZoom() < 12) ctx.toast('Phóng to tới khu vực cần xem (mức xã/phường) để tìm đủ các mốc ảnh.', false, 5000);
      lastKey = '';
      refresh(true);
    } else {
      searching++;
      setCompare(false);
      if (layer) { map.removeLayer(layer); layer = null; }
      versions = []; idx = -1;
    }
  }

  function init(c) {
    ctx = c; map = c.map;
    buildUI();
    $('btnTime').onclick = () => toggle();
    map.on('move zoom', clip);
    map.on('moveend', () => { if (active) { clearTimeout(init._t); init._t = setTimeout(() => refresh(false), 700); } });
  }

  global.Wayback = { init, toggle };
})(window);
