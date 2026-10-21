# SOL-030 — Bằng chứng bàn giao

Ngày kiểm tra: 21/10/2026 (Asia/Saigon). Môi trường Windows, Node 24.15.0.
Nguồn yêu cầu: [SOL-030, hàng 30](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit?gid=0&range=A30:O30).

## Lệnh và kết quả local

```text
npm run lint
  API ESLint: PASS
  Mobile ESLint: PASS
  Web ESLint: PASS

npm test
  API:    Test Files 17 passed (17), Tests 234 passed (234)
  Mobile: Test Files  9 passed (9),  Tests  56 passed (56)
  Web:    Test Files  9 passed (9),  Tests  51 passed (51)
  Tổng: 341 tests PASS

npm run build
  API: Đã kiểm tra cú pháp 58 file JavaScript API.
  Android: Exported: dist/android
  iOS: Exported: dist/ios
  Web: 53 modules transformed; built successfully.
```

Log trích từ các lệnh thực sự chạy. Build Expo có cảnh báo cache rỗng và NO_COLOR/FORCE_COLOR;
vẫn exit 0. Export bundle không chứng minh đã chạy UI thiết bị.

Lần chạy riêng đầu tiên của test mới có 3 lỗi fixture: token phát hành trước khi test lùi đồng hồ,
và array một phần tử được Supertest serialize thành scalar query hợp lệ. Đã cấp lại token sau đổi giờ
và dùng query lặp hai giá trị để kiểm malformed input thật. Sau sửa, toàn bộ suite trên đạt;
không làm yếu auth hoặc bỏ test.

## Phạm vi kiểm chứng

38 test mới trong `apps/api/src/modules/availability/tests/availability.api.test.js`:

- HTTP đi qua Express/auth thật, account active/disabled và phân quyền; DTO allowlist/no-store.
- MongoDB 8.0.17 replica set do mongodb-memory-server tạo mới, chỉ chứa dữ liệu tổng hợp.
  Reader dùng model/collection thật; không mock truy vấn availability. Không dùng .env DB thật.
- Chọn nhiều dịch vụ, giá 0, thời lượng cố định, thiếu cấu hình thì báo lỗi, không suy min/max.
- Năng lực đủ toàn bộ dịch vụ; active staff/account; chủ kiêm stylist; lọc đúng staff.
- Ca chưa xếp/hủy, không ghép hai ca; time-off, dọn và khoảng liền kề.
- Lead 30 phút, grid 15 phút, biên horizon 168h, ngày tiệm qua UTC midnight.
- Confirmed, completed sớm, cancelled/no-show; ETA tương lai/quá hạn, lịch đang phục vụ quá giờ.
- Cùng customerId ở stylist khác, không áp dọn cho khách; owner chọn hồ sơ; không lộ lịch/hồ sơ khác.
- Walk-in server-now có giây/millisecond, không backdate, không nhận role/totals từ query.
- Dữ liệu đầu vào malformed, DB mất kết nối, giữ đúng 8 field public catalog.
- Validator duration và tổng nhiều dịch vụ >480 phút khi ca đủ dài.

## Output để review

Xem [hợp đồng và output fixture đã được test](../../availability-api.md#response-và-ví-dụ-đã-kiểm-bằng-test).
Ví dụ hai dịch vụ tổng 60 phút/100.000đ, server 10:00, ca 09:00–13:00:
slot đầu 10:30, cuối 11:45; slot 12:00 bị loại do dọn vượt ca.
Chủ walk-in lúc 10:07:12.345 nhận chính thời điểm đó nếu cả dịch vụ và dọn còn đủ trong ca.

## Chưa kiểm chứng và bàn giao tiếp

- Không chạy thủ công browser/emulator/thiết bị Android/iOS; không kết nối Atlas/DB production.
- SOL-021 cần cấu hình bookingDurationMinutes do chủ chọn. Catalog legacy thiếu field này
  tiếp tục đọc được nhưng availability trả 409 SERVICE_BOOKING_NOT_CONFIGURED.
- SOL-031 tái kiểm dưới transaction/guard khi tạo lịch; kết quả GET không giữ chỗ/chống trùng khi ghi.
- SOL-032/033 ghép UI, SOL-034 nghiệm thu tích hợp thật. Chờ review và merge PR mới hoàn thành task.
- CI được ghi tại PR/checks, không thay bằng log local.
