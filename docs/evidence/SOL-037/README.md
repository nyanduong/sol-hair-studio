# SOL-037 — Sửa 5 điểm quản lý lịch hẹn admin

Ngày 01/11/2026. Nhánh nyan/fix-SOL-037-admin-appointments, bắt đầu từ main b220525 sau khi booking customer PR #41 đã merge. Người dùng yêu cầu sửa 5 điểm audit, kiểm Chrome rồi commit/push; không yêu cầu merge PR mới hoặc sửa Sheet/phân công.

## Thay đổi

- Picker đổi lịch giới hạn hôm nay đến ngày +7; API giữ horizon 168 giờ. URL ngày không hợp lệ vẫn có bộ chọn ngày để khôi phục. Lỗi GET giờ trống trong dialog giữ nháp lý do/stylist và các điều khiển ngày; bỏ chọn/khóa slot cũ, tải lại thành công mới mở slot mới.
- Mã SOL đã lưu hiển thị trên danh sách, chi tiết, modal đổi lịch, thao tác và audit. ID MongoDB tiếp tục dùng cho URL/target/revision/command; lịch legacy có nhãn thiếu mã, không giả mã bằng cách cắt ID.
- Dropdown stylist khác ẩn đúng ở chế độ giữ người hiện tại, hiện khi đổi người; dùng utility Tailwind để hidden thắng class block.
- Danh sách đọc lại cùng bộ lọc/trang hiện tại mỗi 30 giây, focus/visibility và nút tải lại. Chỉ thay vùng danh sách, giữ form lọc/nháp, không ngắt lúc đang nhập hoặc focus link lịch. Chặn kết quả cũ, báo dữ liệu có thể cũ khi lỗi và có đường đăng nhập lại nếu hết phiên.
- Owner tìm q theo mã SOL, tên hoặc số điện thoại snapshot, 1–100 ký tự, escape regex literal, không phân biệt hoa/thường. Số đầu 0 chuẩn hóa sang +84. Có thể bỏ ngày khi có q để tìm mọi ngày; date/staff/status/cursor vẫn kết hợp. q bị từ chối ở Customer/Stylist. API mới tương thích các client date-only cũ.

## Kiểm tra tự động

- npm run lint: PASS toàn repo.
- npm test: PASS 1850 tests (API 775 / Mobile 495 / Web 580).
- npm run build: PASS API (85 file), Web, Android export 984 modules / iOS export 989 modules. Giữ cảnh báo Mongoose deprecated option, NO_COLOR/FORCE_COLOR và Web chunk >500 kB; không làm yếu test.
- Sau tinh chỉnh title tìm mọi ngày và giữ referenceCode khi GET đổi lịch lỗi: npm run lint --workspace @sol-hair/api PASS; 4 file admin integration/browser-state 33 tests PASS; npm run build --workspace @sol-hair/api PASS; git diff --check PASS.
- Search integration dùng replica set tạm: tìm theo mã lowercase, phone đầu 0 có dấu phân cách, tên literal chứa [QA].*, global qua hai ngày; pagination không trả khách không khớp q; giữ date/status; q quá dài/array/trống bị từ chối; Customer/Stylist không dùng q. Lịch cũ không thay khi đọc ngày lỗi/khôi phục.
- DOM thật bằng happy-dom + script sản phẩm: giữ form/nháp khi GET options lỗi, vô hiệu slot cũ rồi khôi phục; ngăn ngày ngoài khoảng trước fetch; refresh giữ form lọc, không ngắt typing, không áp response cũ, giữ danh sách cũ kèm cảnh báo khi mất mạng và xử lý session expiry.

## Chrome thật

Chrome desktop, admin localhost:4000 với cookie Owner hiện có và DB local. Không tạo/sửa/hủy lịch hoặc hồ sơ trong lượt Chrome này. Các kiểm thử ghi nghiệp vụ chỉ chạy trong replica set tạm của test.

- Dữ liệu thật: q=sol-r4jj7jux tìm đúng mã SOL-R4JJ7JUX dù lowercase, ngày bỏ trống; phone 0900 000 043 và tên Minh Anh trả lịch theo snapshot. Danh sách/chi tiết/modal/audit dùng mã SOL, link chi tiết/back giữ q. Ảnh search-chrome.jpg.
- Dữ liệu thật: picker min=2026-11-01/max=2026-11-08. Dropdown giữ stylist có hidden=true và chiều cao 0 trên Chrome; chọn người khác thì hiện và chọn được An. Ảnh reschedule-fixed-chrome.jpg.
- QA lỗi đọc qua CDP Fetch: giữ nháp lý do và An, chọn ngày khác, phản hồi HTML 500 mô phỏng. Form/ngày vẫn còn; toàn bộ slot cũ disabled. Gỡ override rồi đọc lại API thật thành công: lý do/An vẫn giữ, giờ mới mở lại. Không POST. Ảnh reschedule-read-error-chrome.jpg.
- QA cập nhật danh sách: quan sát request GET tự động khi không bấm reload, trả thêm thẻ SOL-QA234567 có ghi rõ phản hồi kiểm thử. Danh sách cập nhật không reload URL/form. Gỡ override, bấm Tải lại để trở về dữ liệu thật. Đây là bằng chứng frontend polling, không phải tạo thêm booking thật. Ảnh auto-refresh-fixture-chrome.jpg.
- URL thật /reschedule?localDate=2026-11-09 trả lỗi nhưng vẫn có mã SOL và picker ngày hợp lệ; bấm 02/11 mở lại form đổi lịch. Ảnh invalid-date-recovery-chrome.jpg.
- Viewport override 390×844, clientWidth=scrollWidth=375: tìm kiếm, nút lọc/tải lại và thẻ mã lịch không tràn ngang. Ảnh search-mobile-chrome.jpg. Đã reset viewport, đóng tab QA và gỡ mọi Fetch override.
- Một số lệnh capture clip timeout; ảnh modal cuối lấy qua API screenshot mặc định. Không phát hiện console error app mới. Chưa nghiệm thu native/thiết bị thật/Atlas hoặc đo hiệu năng search với dữ liệu lớn.

## Giới hạn và bàn giao

Không thay state machine, chính sách Start/Complete ở Lịch của tôi, snapshot, guard, idempotency hoặc audit nghiệp vụ. Polling có độ trễ tối đa khoảng 30 giây khi tab hoạt động và không đang nhập; không tuyên bố realtime tức thì. Tìm tên là literal không phân biệt hoa/thường, không tự bỏ dấu tiếng Việt. Chưa thêm index tìm kiếm; giới hạn q và phân trang giữ phạm vi đọc có kiểm soát, cần đo dữ liệu lớn trước tối ưu.
