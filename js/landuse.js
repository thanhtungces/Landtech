/*
 * Bảng màu loại đất (ký hiệu mục đích sử dụng đất) theo quy định trình bày bản đồ
 * hiện trạng sử dụng đất của Bộ TN&MT / Bộ NN&MT. Dùng để tô màu thửa đất SHP, GDB, GeoJSON, CAD.
 * Tung_LandTech – © Nguyễn Thanh Tùng
 */
(function (global) {
  'use strict';
  // [mã, tên, R, G, B]
  const T = [
    ['LUA', 'Đất trồng lúa', 255, 252, 130], ['LUC', 'Đất chuyên trồng lúa', 255, 252, 130], ['LUK', 'Đất trồng lúa còn lại', 255, 252, 140], ['LUN', 'Đất lúa nương', 255, 252, 180],
    ['HNK', 'Đất trồng cây hàng năm khác', 255, 240, 180], ['BHK', 'Đất bằng trồng cây hàng năm khác', 255, 240, 180], ['NHK', 'Đất nương rẫy trồng cây hàng năm khác', 255, 240, 180], ['COC', 'Đất cỏ dùng vào chăn nuôi', 230, 255, 140],
    ['CLN', 'Đất trồng cây lâu năm', 255, 210, 160],
    ['RSX', 'Đất rừng sản xuất', 180, 255, 180], ['RSN', 'Đất rừng sản xuất là rừng tự nhiên', 180, 255, 180], ['RST', 'Đất rừng sản xuất là rừng trồng', 180, 255, 180],
    ['RPH', 'Đất rừng phòng hộ', 190, 255, 30], ['RDD', 'Đất rừng đặc dụng', 110, 255, 100],
    ['NTS', 'Đất nuôi trồng thủy sản', 170, 255, 255], ['LMU', 'Đất làm muối', 120, 255, 255], ['NKH', 'Đất nông nghiệp khác', 245, 255, 180], ['CNT', 'Đất chăn nuôi tập trung', 245, 255, 180],
    ['ODT', 'Đất ở tại đô thị', 255, 160, 255], ['ONT', 'Đất ở tại nông thôn', 255, 208, 255],
    ['TSC', 'Đất xây dựng trụ sở cơ quan', 255, 170, 160], ['TSN', 'Đất xây dựng trụ sở cơ quan', 255, 170, 160], ['DTS', 'Đất xây dựng trụ sở tổ chức sự nghiệp', 255, 170, 160], ['DNG', 'Đất xây dựng cơ sở ngoại giao', 255, 170, 160],
    ['CQP', 'Đất quốc phòng', 255, 100, 80], ['CAN', 'Đất an ninh', 255, 80, 70],
    ['DSN', 'Đất xây dựng công trình sự nghiệp', 255, 170, 160], ['DVH', 'Đất xây dựng cơ sở văn hóa', 255, 170, 160], ['DXH', 'Đất xây dựng cơ sở dịch vụ xã hội', 255, 170, 160],
    ['DYT', 'Đất xây dựng cơ sở y tế', 255, 170, 160], ['DGD', 'Đất xây dựng cơ sở giáo dục và đào tạo', 255, 170, 160], ['DTT', 'Đất xây dựng cơ sở thể dục thể thao', 255, 170, 160],
    ['DKH', 'Đất xây dựng cơ sở khoa học và công nghệ', 255, 170, 160], ['DMT', 'Đất xây dựng cơ sở môi trường', 255, 170, 160], ['DKT', 'Đất xây dựng cơ sở khí tượng thủy văn', 255, 170, 160],
    ['DSK', 'Đất xây dựng công trình sự nghiệp khác', 255, 170, 160],
    ['SKK', 'Đất khu công nghiệp', 250, 170, 160], ['SKN', 'Đất cụm công nghiệp', 250, 170, 160], ['SKT', 'Đất khu chế xuất', 250, 170, 160], ['TMD', 'Đất thương mại, dịch vụ', 250, 170, 160],
    ['SKC', 'Đất cơ sở sản xuất phi nông nghiệp', 250, 170, 160], ['SKS', 'Đất sử dụng cho hoạt động khoáng sản', 205, 170, 205], ['SKX', 'Đất sản xuất vật liệu xây dựng, gốm sứ', 205, 170, 205],
    ['CCC', 'Đất công cộng', 255, 170, 160], ['DGT', 'Đất giao thông', 255, 170, 50], ['DTL', 'Đất thủy lợi', 170, 255, 255], ['DNL', 'Đất công trình năng lượng', 255, 170, 160],
    ['DBV', 'Đất công trình bưu chính, viễn thông', 255, 170, 160], ['DCH', 'Đất chợ', 255, 170, 160], ['DDT', 'Đất có di tích lịch sử - văn hóa', 255, 170, 160], ['DDL', 'Đất danh lam thắng cảnh', 255, 170, 160],
    ['DRA', 'Đất bãi thải, xử lý chất thải', 205, 170, 205], ['DKV', 'Đất khu vui chơi, giải trí công cộng', 255, 170, 160], ['DSH', 'Đất sinh hoạt cộng đồng', 255, 170, 160],
    ['DCK', 'Đất công trình công cộng khác', 255, 170, 160], ['DHT', 'Đất phát triển hạ tầng', 255, 170, 160],
    ['TON', 'Đất cơ sở tôn giáo', 255, 170, 160], ['TIN', 'Đất cơ sở tín ngưỡng', 255, 170, 160],
    ['NTD', 'Đất nghĩa trang, nhà tang lễ, hỏa táng', 210, 210, 210],
    ['SON', 'Đất sông, ngòi, kênh, rạch, suối', 160, 255, 255], ['MNC', 'Đất có mặt nước chuyên dùng', 180, 255, 255], ['PNK', 'Đất phi nông nghiệp khác', 255, 170, 160],
    ['BCS', 'Đất bằng chưa sử dụng', 255, 255, 254], ['DCS', 'Đất đồi núi chưa sử dụng', 230, 230, 200], ['NCS', 'Núi đá không có rừng cây', 230, 230, 200], ['CSD', 'Đất chưa sử dụng', 255, 255, 254]
  ];
  const MAP = {};
  for (const r of T) {
    const k = r[0];
    MAP[k] = { code: k, name: r[1], rgb: [r[2], r[3], r[4]] };
  }
  const hex = (c) => '#' + c.map(v => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2)).join('');

  /** Mã loại đất chính trong chuỗi (ví dụ "ONT+CLN" -> ONT, "đất ODT" -> ODT). */
  function codeOf(v) {
    if (v == null) return '';
    const s = String(v).toUpperCase().replace(/[\u0000-\u001f]/g, '');
    const m = s.match(/[A-ZĐ]{2,4}/g);
    if (!m) return '';
    for (const c of m) if (MAP[c]) return c;
    return m[0];
  }
  /** Màu cho mã loại đất: {fill, stroke, name}. Mã lạ: màu xám nhạt. */
  function colorOf(code) {
    const e = MAP[code];
    const rgb = e ? e.rgb : [200, 200, 200];
    return { fill: hex(rgb), stroke: hex(rgb.map(v => v * 0.25)), name: e ? e.name : 'Chưa có trong bảng màu', known: !!e };
  }
  global.LandUse = { codeOf, colorOf, MAP };
})(window);
