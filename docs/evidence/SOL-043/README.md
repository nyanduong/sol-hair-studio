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

## Refine màn thành công — 01/11/2026 (local, chưa commit)

Theo mockup đã duyệt: trang receipt riêng thay form; mã ngắn immutable/unique index, bản ghi snapshot, ngày/giờ bắt đầu-kết thúc, tổng dịch vụ và link chi tiết. Availability ngừng khi success, không còn Cần chọn lại giờ trống sau khi tạo thành công. Không dùng giá/tên/contact live làm receipt.

- API 764 tests PASS, gồm cố ý collision mã rồi retry đúng, 2 appointments/2 receipts/2 events và replay giữ mã; test snapshot/replay sau sửa catalog/profile vẫn nguyên DTO. Mobile 495 PASS.
- Lần npm test đầu có 1 test Web cũ mong ID dài; cập nhật fixture/expect sang referenceCode và thêm case legacy không hiển thị raw ID. Sau sửa, Web 568/37 files PASS; không bỏ test/không bỏ assertions snapshot/thời gian/giá.
- npm run lint PASS sau thay đổi cuối; npm run build PASS API/Web/Android+iOS export (cảnh báo chunk >500 kB cũ), git diff --check PASS.
- Backfill DB local: cấp mã cho 5 lịch cũ, chạy lại cập nhật 0. Không sửa giờ/trạng thái/dịch vụ. Kiểm DB sau browser QA: 6 appointments có mã/0 mã trùng/unique index tồn tại.
- Chrome origin5174 với tài khoản QA mới Minh Anh QA: đặt Cắt, Stylist Linh, 01/11/2026 18:45–19:45 thành công, reference SOL-R4JJ7JUX; UI thực không còn wizard/cần chọn lại giờ; API thực, không mock POST. Tạo 1 lịch QA mới và giữ lại DB local. Link chi tiết thực hiển thị cùng mã.
- Sau hot reload sửa focus, dùng wrapper tạm render chính BookingSuccess với receipt QA đọc từ DB để chụp success-desktop/mobile.jpg và kiểm responsive390px (không tràn). Wrapper/dữ liệu preview đã xóa, không có mock trong source sản phẩm. Nút sao chép trả feedback thành công từ Clipboard API; công cụ Browser Use dùng virtual clipboard nên không đối chiếu được OS clipboard qua thao tác paste. Không tuyên bố paste E2E đã đạt.
- Chưa native/Atlas. Theo yêu cầu người dùng, toàn bộ sửa đang local, không commit/push/merge. Không cập nhật PR chứa code chưa push.

## Kiểm tra trước commit/push — 01/11/2026

Người dùng đã yêu cầu commit và push các thay đổi màn thành công/mã lịch hẹn và thông báo giới hạn đặt trước. Ghi chú chưa commit ở phần trên phản ánh thời điểm kiểm thử ban đầu. Bàn giao trên nhánh fix/SOL-043-vietnamese-phone, PR #41 tiếp tục Draft; không merge vào main.

- npm run lint: PASS toàn repo.
- npm test: PASS 1.827 tests (API 764, Mobile 495, Web 568).
- npm run build: PASS API, Web và Expo export Android/iOS (984/989 modules). Còn cảnh báo Mongoose deprecated option, NO_COLOR/FORCE_COLOR và chunk Web >500 kB.
- node --check apps/api/scripts/backfill-booking-references.js và git diff --check: PASS.
- Thông báo cạnh ô ngày và DATE_OUT_OF_RANGE nêu rõ tối đa 7 ngày/168 giờ; khách tới ngay chỉ hôm nay. Không đổi logic tính giờ. Chưa kiểm lại trình duyệt hoặc native UI trong lần bàn giao này; bằng chứng Chrome trước đó nằm ở phần trên.
- Đợt thêm ca riêng theo yêu cầu đã nạp 92 ca 09:00–20:00 ngày 08–30/11 cho 4 nhân sự vào DB local, kiểm lại ca/giờ trống và giữ nguyên lịch hẹn. Dữ liệu DB không nằm trong commit.
