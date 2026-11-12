/* Lớp vẽ chữ (ghi chú CAD) bằng canvas, cỡ chữ theo chiều cao thực (m) của bản vẽ. */
(function () {
  'use strict';
  L.TextLayer = L.Layer.extend({
    initialize: function (items, opts) {
      this._items = items; // [{lat,lng,text,h,rot,color,align,lid}]
      this.hidden = null;
      L.setOptions(this, opts);
    },
    setItems: function (items) { this._items = items; if (this._map) this._redraw(); },
    setHiddenLids: function (set) { this.hidden = set; if (this._map) this._redraw(); },
    onAdd: function (map) {
      if (!map.getPane('textPane')) { const p = map.createPane('textPane'); p.style.zIndex = 450; p.style.pointerEvents = 'none'; }
      this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide');
      map.getPane('textPane').appendChild(this._canvas);
      map.on('moveend zoomend resize viewreset', this._redraw, this);
      this._redraw();
    },
    onRemove: function (map) {
      map.off('moveend zoomend resize viewreset', this._redraw, this);
      L.DomUtil.remove(this._canvas);
    },
    _redraw: function () {
      const map = this._map; if (!map) return;
      const size = map.getSize(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const c = this._canvas;
      c.width = size.x * dpr; c.height = size.y * dpr;
      c.style.width = size.x + 'px'; c.style.height = size.y + 'px';
      L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]));
      const ctx = c.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      const lat = map.getCenter().lat;
      const mpp = 40075016.686 * Math.cos(lat * Math.PI / 180) / (256 * Math.pow(2, map.getZoom()));
      const minPx = this.options.minPx || 5;
      const b = map.getBounds().pad(0.2);
      const s = b.getSouth(), n = b.getNorth(), w = b.getWest(), e = b.getEast();
      const hid = this.hidden, zoom = map.getZoom();
      ctx.lineJoin = 'round';
      let drawn = 0;
      for (const it of this._items) {
        let px;
        if (it.px) { if (zoom < it.minZ) continue; px = it.px; }
        else { px = it.h * (this.scale || 1) / mpp; if (px < minPx) continue; }
        if (it.lat < s || it.lat > n || it.lng < w || it.lng > e) continue;
        if (hid && hid.has(it.lid)) continue;
        if (px > 60) px = 60;
        const p = map.latLngToContainerPoint([it.lat, it.lng]);
        ctx.save();
        ctx.translate(p.x, p.y);
        if (it.rot) ctx.rotate(-it.rot);
        ctx.font = '600 ' + px.toFixed(1) + 'px system-ui, sans-serif';
        ctx.textAlign = it.align === 1 || it.align === 4 ? 'center' : it.align === 2 ? 'right' : 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.lineWidth = Math.max(2, px / 5);
        ctx.strokeStyle = 'rgba(0,0,0,.85)';
        ctx.fillStyle = this.options.color || it.color || '#fff';
        if (it.lines) {
          // nhãn nhiều dòng, mỗi dòng một màu; căn giữa theo chiều đứng quanh tâm thửa
          const n = it.lines.length, y0 = -(n - 1) * px * 1.2 / 2 + px * 0.35;
          ctx.font = '700 ' + px.toFixed(1) + 'px system-ui, sans-serif';
          it.lines.forEach((ln, i) => { const y = y0 + i * px * 1.2; ctx.strokeText(ln.t, 0, y); ctx.fillStyle = ln.c || '#fff'; ctx.fillText(ln.t, 0, y); });
        } else {
          const lines = String(it.text).split('\n');
          lines.forEach((ln, i) => { const y = i * px * 1.25; ctx.strokeText(ln, 0, y); ctx.fillText(ln, 0, y); });
        }
        ctx.restore();
        if (++drawn > 4000) break;
      }
    }
  });
})();
