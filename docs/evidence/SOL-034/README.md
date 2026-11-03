# SOL-034 — Nghiệm thu đặt lịch: Web/API đã kiểm, Android còn bị chặn

Ngày 21/10/2026, Windows; Node 24.15.0, npm 11.12.1, MongoDB 8.0.17 replica set tạm.
Nguồn: [hàng SOL-034](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit?gid=0&range=A34:O34).

**Chưa nghiệm thu đầy đủ SOL-034.** Web và HTTP/client/DB có bằng chứng dưới đây.
Android mới xác nhận boot/Expo Go, chưa chạy UI Booking vì lệnh start Expo bị bộ duyệt từ chối
`blocked by policy`. Giữ trạng thái `Bị chặn` trên Sheet, kể cả sau merge bộ kiểm tra/bằng chứng này.
Không dùng adapter Mobile chạy Node hoặc export bundle để thay bằng chứng UI Android.

## Ma trận bằng chứng

| Tiêu chí | Kết quả và nơi kiểm |
| --- | --- |
| Web khách đăng nhập → chọn → tạo lịch thật | PASS, Chrome desktop → Express thật → MongoDB replica set tạm; ảnh customer và DB cùng mã lịch |
| Chủ chọn đúng hồ sơ chung phone, khách tới ngay | PASS trên Chrome: chọn hồ sơ mobile, stylist B; POST không có startAt, giờ ghi là server-now |
| Mất response sau commit, retry giữ key/payload | PASS trên Chrome và hai adapter; proxy ngắt socket sau response 201 thật, không fake response nghiệp vụ |
| Hai client tranh cùng slot | PASS qua socket đồng thời với adapter Web/Mobile: 1 thành công, 1 HTTP409; DB chỉ 1 lịch/event/receipt |
| Biên 30 phút, 7 ngày, grid 15 phút, dọn 10 phút | PASS HTTP + DB; đồng hồ Date của API/test được cố định cho biên chính xác, không đợi ngoài đời 7 ngày |
| Receipt 24 giờ | PASS ngay trước expiry, tại đúng expiry; đăng nhập lại cùng actor vì token cũ hết hạn; receipt chưa TTL dọn vẫn không tạo trùng |
| Snapshot catalog/contact | PASS tự động và DB manual; catalog hiện tại đổi giá 999.000đ, lịch vẫn giữ snapshot 100.000đ/30 phút |
| Android tạo lịch thật, safe area/back/keyboard/font scaling/loading/retry | CHƯA CHẠY UI; bị chặn khởi động Expo |
| iOS/thiết bị thật/Atlas hoặc dữ liệu salon | Không kiểm trong task này |

## Web thực tế và đối chiếu DB

Không có mock trong đường API chính. Harness khởi động replica set mới, seed dữ liệu tổng hợp,
gắn Express app sản phẩm vào HTTP server thật; proxy chỉ chuyển tiếp và gây mất response theo lệnh stdin.
Chrome truy cập Web Vite `localhost:5178`, API qua loopback `4012`.

1. Đăng nhập khách web qua M1, chọn Cut/stylist A/10:30. Proxy ngắt response đầu sau commit;
   Chrome tự gửi lại cùng POST. Nhận lịch `6ad821d1ec92f4eb4094eb29`, chỉ 1 lịch/event/receipt.
2. Đăng nhập owner, tìm số tổng hợp có hai hồ sơ, chọn đúng hồ sơ mobile thay vì tự gộp.
   Chọn tới ngay/stylist B. Ngắt cả response đầu và lần Chrome tự gửi lại: UI báo chưa xác định,
   khóa lựa chọn và hiện **Thử lại cùng yêu cầu**. Bấm retry nhận cùng mã `6ad8224aec92f4eb4094eb30`.
3. Owner POST không có `startAt`; DB `startAt=confirmedAt=2026-10-21T02:24:10.596Z`, giữ giờ này qua retry.
   Kết thúc có tổng 2 lịch confirmed, 2 event created và 2 receipt, dù có 5 lần POST.
4. Đổi catalog trong DB tạm: giá hiện tại 999.000đ và tên mới; snapshot hai lịch vẫn là Cut/100.000đ/30 phút.

- [Khách đặt thành công](web-customer-success.png)
- [Mất response và UI giữ intent](web-uncertain-retry.png)
- [Chủ đặt hộ tới ngay thành công](web-owner-walkin-success.png)
- [DB audit](db-audit.json), [transport audit](transport.json), [catalog sau đổi](catalog-after-change.json)

Transport chỉ ghi hash payload/key, status và mã lịch, không ghi Bearer token/password/raw key/contact.
Tài khoản tổng hợp/mật khẩu ngẫu nhiên nằm trong file OS temp, không commit; đã dừng harness/Vite
và xác nhận file credential được xóa sau shutdown. Không đọc/sửa DB salon/.env thật.

## Kiểm tra tự động

`apps/api/src/modules/appointments/tests/booking.integration.test.js` dùng socket TCP thật, fetch/HTTP helper
và adapter nguyên bản của Web/Mobile, M1 login/profile, shared intent manager và MongoDB replica set.
**Mobile adapter chạy trong Node, không phải React Native runtime.**

16 kịch bản mới gồm đối chiếu profile/availability/create, tranh Web/Mobile đồng thời, mất socket sau commit
cho từng adapter, 409 clear intent, owner walk-in/chọn hồ sơ trùng phone, các biên thời gian, cleanup,
snapshot, expiry 24h và session disabled. Không mock repository/fetch hoặc chỉ disable nút để chứng minh chống trùng.

- `npm run test --workspace @sol-hair/api -- src/modules/appointments/tests/booking.integration.test.js`: 16 PASS.
- `npm run lint`: PASS API/Mobile/Web/shared.
- Prettier 3.6.2 format và check trước PR: PASS, single quote/no semi/width 100.
- `git diff --check`: PASS.
- `npm test`: 446 PASS (API 301, Mobile 61, Web 84).
- `npm run build`: PASS API 64 file JavaScript, Web 70 module, Android export 896 module và iOS export 901 module.

Lần chạy integration đầu: 6 PASS/10 FAIL vì bộ đếm rate-limit M1 bị dùng chung giữa các fixture
độc lập có cùng email/clock. Đã dùng `resetRateLimits` hiện có tại beforeEach để cô lập kịch bản;
không thay rate-limit sản phẩm. Chạy lại đủ 16 PASS. Không làm yếu assertion hoặc tắt bảo vệ sản phẩm.

## Android và giới hạn còn lại

- ADB trả boot completed=1, Android 15 (API 35), Expo Go 57.0.9 có sẵn.
- Lệnh khởi động Expo trên cổng 8082 với API emulator host bị duyệt tự động từ chối: `blocked by policy`.
  Không đổi cách khởi chạy để vượt từ chối. Không cài phần mềm hoặc dùng bundle export thay chạy ứng dụng.
- Cửa sổ emulator được tìm thấy; capture màn hình qua Computer Use lỗi crop ngoài màn hình monitor.
  Không có ảnh Booking Android hoặc kết quả thao tác native để nghiệm thu.
- [Quy trình tái chạy](../../booking-acceptance.md) có môi trường/API/ca native còn phải thực hiện khi có thể
  chạy Expo; chỉ lúc có bằng chứng Android đạt mới chuyển SOL-034 sang Hoàn thành.
- Catalog thật vẫn cần cấu hình duration cố định theo SOL-021. Seed nghiệm thu không backfill dữ liệu salon.
