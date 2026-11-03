# SOL-033 — Mobile khách đặt lịch

Ngày 21/10/2026. Branch `feat/SOL-033-mobile-booking`, từ main đã merge SOL-032.

## Đầu ra

- Native screen `Booking`, route RootNavigator và các điểm vào Home/banner/bottom nav.
- Customer active gate từ profile M1, bổ sung contact ngay tại bước đặt hẹn; login giữ returnTo.
- Chọn 1–5 dịch vụ → ngày tiệm → stylist → slot → tổng tiền/thời lượng từ API → xác nhận.
- Safe area/keyboard/ScrollView, StyleSheet và lựa chọn một cột trên màn hẹp/chữ lớn; control ≥44dp.
- Không đặt hộ/quản lý chủ trên native. Không tính lại giá/thời lượng/slot bằng client.
- Retry dùng chung intent/key tại `shared/booking.js`; native UUID từ `expo-crypto ~57.0.4`.
  Không device ID/Math.random. Khi kết quả chưa xác định, giữ lựa chọn và khóa việc rời màn hình bằng
  usePreventRemove, ẩn điều hướng đẩy màn hình mới; HTTP 409 bỏ lựa chọn giờ cũ/tải lại.
- Web chuyển sang cùng module thuần JS, thêm cảnh báo trước reload/đóng trang trong lúc pending.
  Không shared UI hay workspace mới. HTTP/latest/lifecycle riêng trong từng app.

## Kiểm chứng tự động

- `npm run lint`: PASS API/Mobile/Web và shared (thêm lint:shared vào root).
- Mobile: 61 test PASS, trong đó 5 test adapter mới; Web: 84 test PASS, gồm quy tắc payload/retry dùng chung.
- Root lockfile chỉ thêm expo-crypto; không đổi phiên bản package hiện có, npm chuẩn hóa metadata peer.
- `npm test`: PASS toàn bộ 379 test (API 234, Mobile 61, Web 84).
- `npm run build`: PASS API syntax 58 file, Android export 896 modules, iOS export 901 modules, Web 69 modules.
- Prettier check và `git diff --check`: PASS. Không thêm test giữ chỗ hay làm yếu check có sẵn.

## Giới hạn thực tế

- Đã khởi động emulator có sẵn, kiểm tra Android 15 boot hoàn tất và Expo Go 57.0.9 đã cài.
  **Chưa chạy giao diện Booking trên emulator**: bộ duyệt tự động từ chối lệnh start Expo dev server
  với lý do `blocked by policy`, cả cấu hình emulator host lẫn loopback. Không tìm cách bỏ qua bộ duyệt.
  Không có ảnh native Booking; export bundle không thay thế kiểm thử thiết bị.
- Không chạy iOS simulator/thiết bị thật; chưa xác minh safe area/back/font scaling/keyboard bằng native UI.
- POST /api/appointments chưa có trên main, cần SOL-031; SOL-021 cần dữ liệu thời lượng cố định.
  Không tạo lịch thật hoặc thay dữ liệu DB/production. Không tuyên bố đã nghiệm thu SOL-034.
- Key giữ trong lần mở màn hình, chưa receipt recovery sau force close/app kill. Server phải enforce
  transaction/guard/snapshot/idempotency 24h; không dùng nút disabled thay chống trùng DB.
- [Hợp đồng và phụ thuộc](../../booking-ui-contract.md) là nguồn handoff cho API/UI.
