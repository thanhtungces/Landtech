/*
 * Tung_LandTech – giấy phép. © Nguyễn Thanh Tùng – 0356198189
 * Mã kích hoạt gắn với từng máy + ngày hết hạn, do công cụ cap_ma của tác giả tạo.
 */
(function () {
  'use strict';
  const TRIAL_DAYS = 30, DAY = 86400000, KEY = 'tlt_lic', SECRET = 'TLT-Tung-2026-nhau', EPOCH = Date.UTC(2026, 0, 1);
  const rd = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const wr = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { } };
  async function sha(s) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let raw = '';
  try { if (window.AndroidBridge && AndroidBridge.deviceId) raw = String(AndroidBridge.deviceId() || ''); } catch (e) { }
  const o0 = rd();
  if (!raw) { raw = o0.rid || (Math.random().toString(36).slice(2) + Date.now().toString(36)); }
  o0.rid = o0.rid || raw;
  async function deviceCode() { const h = (await sha('dev|' + raw)).slice(0, 8).toUpperCase(); return h.slice(0, 4) + '-' + h.slice(4); }

  function status() {
    const now = Date.now(), o = rd();
    if (!o.first) o.first = now;
    if (!o.rid) o.rid = raw;
    if (o.seen && now < o.seen - DAY) o.tamper = true;
    o.seen = Math.max(o.seen || 0, now);
    wr(o);
    if (o.tamper) return { ok: !!o.exp && now < o.exp && false };
    if (o.exp && now < o.exp) return { ok: true };
    return { ok: now < o.first + TRIAL_DAYS * DAY };
  }

  async function lock() {
    const dc = await deviceCode();
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#12161c;color:#e8edf3;display:flex;align-items:center;justify-content:center;padding:24px;font:16px/1.5 system-ui,sans-serif;text-align:center;overflow:auto';
    d.innerHTML = '<div style="max-width:420px"><div style="font-size:44px">🍻</div><h2 style="margin:8px 0">Tung_LandTech</h2>' +
      '<p>Bạn đã hết hạn dùng thử, muốn được trải nghiệm tiếp bạn hãy liên hệ tác giả để mời nhậu nhé...</p>' +
      '<p><b>Nguyễn Thanh Tùng</b><br>Đội đo đạc – VPĐK đất đai thành phố Đồng Nai<br><a style="color:#7cc4ff;font-size:20px" href="tel:0356198189">0356198189</a></p>' +
      '<p style="color:#9aa7b6;margin-bottom:4px">Mã máy của bạn (gửi cho tác giả):</p><div style="font:700 24px monospace;letter-spacing:2px;color:#ffd54a">' + dc + '</div>' +
      '<input id="licCode" type="text" placeholder="Nhập mã kích hoạt" style="margin-top:14px;width:100%;padding:10px;border-radius:8px;border:1px solid #333d4a;background:#252d38;color:#fff;font-size:16px;text-align:center">' +
      '<button id="licGo" style="margin-top:10px;width:100%;padding:11px;border-radius:10px;border:0;background:#2f9bff;color:#fff;font-size:16px;font-weight:600">Kích hoạt</button><div id="licMsg" style="color:#ff8a8a;margin-top:8px"></div></div>';
    document.body.appendChild(d);
    d.querySelector('#licGo').onclick = async () => {
      const c = d.querySelector('#licCode').value.trim().toUpperCase().replace(/\s/g, '');
      const m = /^([0-9A-F]{4})-([0-9A-F]{8})$/.exec(c);
      const msg = d.querySelector('#licMsg');
      if (!m) { msg.textContent = 'Mã không đúng.'; return; }
      const days = parseInt(m[1], 16);
      const mac = (await sha('tlt|' + SECRET + '|' + dc + '|' + days)).slice(0, 8).toUpperCase();
      if (mac !== m[2]) { msg.textContent = 'Mã không đúng hoặc không dành cho máy này.'; return; }
      const exp = EPOCH + (days + 1) * DAY;
      if (Date.now() >= exp) { msg.textContent = 'Mã này đã hết hạn.'; return; }
      const o = rd(); o.exp = exp; o.tamper = false; o.seen = Date.now(); wr(o);
      location.reload();
    };
  }
  const s = status();
  window.__license = s;
  if (!s.ok) {
    window.__locked = true;
    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', lock); else lock();
  }
})();
