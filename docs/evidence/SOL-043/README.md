# SOL-043 — Nghiệm thu booking Web và Socket.IO

Ngày: 31/10/2026. Môi trường: Chrome desktop, Web thật localhost:5173 và localhost:5174 (hai origin, hai tài khoản customer riêng), API localhost:4000, MongoDB local replica set. Không dùng mock fetch hay thay logic sản phẩm trong browser.

## Kết quả browser

1. Cả hai phiên chọn Cắt & tạo kiểu, Stylist An, ngày 31/10 lúc 17:00 và cùng tới xác nhận.
2. Khách A xác nhận thành công. Khách B tự nhận cập nhật, quay về bước 2, bỏ lựa chọn 17:00, báo giờ đã thay đổi và disable nút đi tiếp. Không reload hoặc bấm Tải lại. Ảnh socket-slot-invalidated.jpg.
3. Hai phiên lại chọn cùng 18:30, đều có nút xác nhận enabled; gọi hai thao tác click trong Promise.all. Network.responseReceived: A POST 409, B POST 201 (204 là CORS preflight). A hiện lỗi giờ không còn hợp lệ, B thành công. Ảnh socket-race-conflict.jpg và socket-race-success.jpg.
4. Lịch của tôi ở A hiển thị lịch 17:00, ở B hiển thị lịch 18:30, đều Đã xác nhận và đúng Cắt & tạo kiểu/Stylist An/450.000đ. Ảnh socket-customer-history.jpg.
5. Đối chiếu DB sau cả hai kịch bản: 17:00 = 1 confirmed; 18:30 = 1 confirmed. Tổng 2 appointments / 2 created events / 2 booking receipts. Không có lịch trùng cho cùng slot.

Đã tạo hai lịch thật trong database local để nghiệm thu, không phải fixture response. Tài khoản B được tạo riêng cho kiểm thử; không commit mật khẩu/token. Ảnh chỉ dùng giao diện không hiển thị contact của khách A. Không xóa hai lịch thử sau kiểm tra để có thể xem lại.

## Kiểm thử tự động

Socket server: handshake từ chối token sai; hai client nhận tín hiệu không payload sau HTTP ghi thành công, 409 không phát tín hiệu; đổi ca cũng phát tín hiệu. Client: gom burst, refresh khi reconnect, cleanup không gọi refresh sau unmount. Test race transaction/guard hiện có vẫn giữ nguyên.

Không nghiệm thu thiết bị native, Atlas hay nhiều API instance. Socket dùng in-memory adapter một process; định kỳ/focus/reconnect bù tín hiệu bỏ lỡ. Khi scale-out cần adapter chung. Không coi realtime UI là thay thế transaction DB.

## Lệnh kiểm tra

- npm run lint: PASS (toàn repo, sau thay đổi cuối).
- npm test: PASS 1765 test (API 664, Mobile 490, Web 611).
- npm run test --workspace @sol-hair/web: PASS 611 test sau điều chỉnh cuối về refresh định kỳ và xóa thông báo khi chọn giờ mới.
- npm run build: PASS API syntax, Web production, Android/iOS export; Web vẫn có cảnh báo chunk >500 kB.
- git diff --check: PASS.

## Ghép main — 01/11/2026

Hoàn tất lần merge main a4b6b39 đang dở trên nhánh SOL-043. Resolve app.js bằng cách giữ admin EJS/router/assets/urlencoded của main và middleware availabilityInvalidation của SOL-043; bỏ import owner-web đã được main thay thế. Cập nhật matcher realtime cho /admin/appointments, /admin/services và alias /owner/services; test socket HTTP thật kiểm tra cả ba đường dẫn này vẫn phát tín hiệu không payload.

Kiểm tra sau resolve: npm run lint PASS; npm test PASS 1821 (API 763, Mobile 495, Web 563); npm run build PASS API syntax, Web, Android/iOS export; git diff --check origin/main PASS. Có cảnh báo Mongoose new option deprecated và Web chunk >500 kB; không làm yếu test. Không chạy lại nghiệm thu browser/native/DB dữ liệu salon trong lần resolve này.

## Refine chọn dịch vụ — 01/11/2026

Theo mockup desktop/mobile đã duyệt: bổ sung tìm không dấu, lọc category thực, chip Đã chọn x/5, bỏ chọn từ sidebar; thẻ desktop gọn, header mobile gọn; CTA customer cố định đáy mobile, tóm tắt có thể mở/thu gọn ở bước 1–2. Không sửa API, dữ liệu, slot/payload/retry hoặc lịch sử M5 trong lần này.

- npm run lint --workspace @sol-hair/web: PASS.
- npm run test --workspace @sol-hair/web: PASS 565 test / 36 file (thêm test tìm kiếm kết hợp category với 30 dịch vụ, dấu tiếng Việt và fallback category).
- npm run build:web: PASS; cảnh báo chunk >500 kB hiện có.
- git diff --check: PASS.
- Chrome thật: chọn sẵn Cắt; tìm nhuom rồi chọn Nhuộm vẫn giữ Cắt; query không khớp hiện empty state và Xóa bộ lọc; bỏ Nhuộm từ chip, chọn Spa, giá API đúng; ảnh refine-desktop.jpg.
- Chrome 390px: document width = scrollWidth = 390, CTA hiện cố định đáy; mở tóm tắt, bỏ Spa từ sidebar, thu gọn và dùng CTA bước 1 → 2, chọn Stylist An/16:45 → bước 3 có nút xác nhận enabled. Không bấm xác nhận hoặc lưu hồ sơ. Ảnh refine-mobile.jpg.
- Fixture tạm ngoài bundle: BookingPage thật với AuthContext/fetch tổng hợp, 30 dịch vụ / 3 nhóm. Lọc Nhuộm còn 10 checkbox; chọn mục 28 rồi lọc khác vẫn giữ chip; thử chọn mục thứ 6 bị từ chối, đúng 5 checkbox checked; 360px không tràn ngang và fixed bar đáy800px (viewport800). Fixture và tab được xóa sau khi kiểm, không insert DB/không để mock trong source sản phẩm.

Đây là emulation responsive Web, chưa kiểm bàn phím/thiết bị mobile thật. Các đề xuất khác ở đợt audit (contact sớm, date/empty state, success và nhóm lịch quá giờ) chưa triển khai trong mockup chọn dịch vụ này. SOL-043 tiếp tục nghiệm thu; chưa merge PR.
