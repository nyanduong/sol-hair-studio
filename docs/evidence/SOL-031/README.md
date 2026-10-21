# SOL-031 — Bằng chứng kiểm thử

Ngày 21/10/2026, Windows, Node 24.15.0 / npm 11.12.1.

## Tự động

- `npm run lint`: PASS (API, Mobile, Web, shared).
- `npm test`: PASS 430 test (API 285, Mobile 61, Web 84), gồm 51 test SOL-031 mới.
- `npm run build`: PASS API 63 file, Web 70 module, Android 896 module, iOS 901 module.
- Prettier 3.6.2 `--single-quote --no-semi --print-width 100`: format trước PR và check lại file sửa.

51 test mới `apps/api/src/modules/appointments/tests/booking.api.test.js` gọi Express thật qua Supertest,
MongoDB 8.0.17 replica set tạm, dữ liệu tổng hợp. Bao gồm snapshot/guard/event/receipt atomic,
same-key concurrency (gồm guest), tranh stylist/khách, payload khác, actor scope, hết hạn còn vật lý,
walk-in giờ server, contact/roles/lead/grid/ca/nghỉ/catalog, rollback audit lỗi và unknown commit.
Kiểm M5 đọc/hủy chính lịch được tạo; replay không tạo lại lịch đã hủy. Kiểm index và startup lặp lại.
Không dùng mock repository để chứng minh chống trùng. Test unknown commit/audit failure chủ động inject lỗi;
không tuyên bố đã mô phỏng lỗi mạng thật tại thời điểm commit.

## Web gọi API + MongoDB thật

Chrome desktop, Web Vite cổng 5177 → Express cổng 4011 → MongoDB replica set tạm độc lập.
Không dùng fixture HTTP: login M1 thật (password hash), catalog, availability và POST appointments thật.
Tài khoản/contact/catalog đều tổng hợp; không đọc/sửa dữ liệu salon hay cấu hình .env thật.

Thao tác: `/booking` → đăng nhập → chọn Demo Cut → Demo Stylist → 10:30 → xác nhận.
Web hiện thành công và mã lịch `6ad81d381729c15f30138ec4`.
Đọc DB cùng mã: confirmed, 100.000đ/30 phút, một event created và một receipt.

- [Ảnh màn hình](web-real-booking.png).
- [Đối chiếu DB](web-db-audit.json), không chứa token, mật khẩu, account/contact thật.

Đã dừng API demo/Vite và xóa runner tạm sau kiểm thử. Không commit seed credentials hoặc server fixture.
Không chạy Android/iOS UI, thiết bị thật, Atlas/production hoặc cấu hình catalog SOL-021 thật.
Export bundle mobile chỉ kiểm build; SOL-034 tiếp tục nghiệm thu native và dữ liệu thực tế.
