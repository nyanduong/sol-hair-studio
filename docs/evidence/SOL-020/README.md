# SOL-020 — M1 Tài khoản: Tích hợp và nghiệm thu tài khoản

Ngày 03/11/2026, Windows; Node 24.x, MongoDB Replica Set thật trong bộ nhớ (`mongodb-memory-server` 8.0.17) và máy chủ SMTP cục bộ (`smtp-server`).
Nguồn: [Sol Hair Studio — Kế hoạch & phân công](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit?gid=0&range=A20:O20).

Nhiệm vụ: Thực hiện kiểm thử tích hợp đầu-cuối (End-to-End Integration) và nghiệm thu Module 1 Tài khoản (SOL-016 baseline, SOL-017 API, SOL-018 Web, SOL-019 Mobile) khi kết nối API/SMTP/MongoDB Replica Set thật cho các luồng: đăng ký/kích hoạt khách hàng, cấp phát và kích hoạt nhân viên (stylist), quên/đặt lại mật khẩu, chu kỳ OTP (6 số, hạn 5 phút, cooldown gửi lại 60 giây, khóa sau 5 lần sai, chặn tái dùng mã và proof một lần), thu hồi phiên qua `authRevision`, bổ sung hồ sơ khách hàng (Họ tên + SĐT E.164) trước đặt lịch và kiểm quyền RBAC 3 vai trò (`customer`, `stylist`, `owner`).

---

## 1. Ma trận bằng chứng tích hợp & nghiệm thu M1

| Tiêu chí nghiệm thu | Kết quả & Bằng chứng | Chi tiết kỹ thuật |
| --- | --- | --- |
| **1. Đăng ký, Active Gate & Kích hoạt OTP khách hàng** | **PASS** | - Khách hàng đăng ký qua Web/Mobile adapter (`POST /api/auth/register`) tạo bản ghi `accounts` ở trạng thái `pending_verification`, mật khẩu được băm scrypt (`passwordHash`), chưa tạo bản ghi `customers`.<br>- **Active Gate**: Cố đăng nhập trước khi xác thực OTP bị chặn với `403 ACCOUNT_NOT_ACTIVE`; giao diện hiển thị lối tắt chuyển sang màn nhập OTP kích hoạt.<br>- Nhập đúng OTP 6 số (`POST /api/auth/activate`) kích hoạt tài khoản sang `active` và cấp ngay JWT access token. |
| **2. Hồ sơ khách hàng (Tên + SĐT E.164) & Đồng bộ Web/Mobile** | **PASS** | - Sau khi kích hoạt, `GET /api/auth/me` chưa có trường `customer`.<br>- Khách cập nhật Họ tên và SĐT chuẩn E.164 (`PATCH /api/auth/me` trên Mobile hoặc bước 1 trang `/booking` trên Web) tạo đúng 1 hồ sơ `customers` liên kết `accountId`.<br>- Thay đổi hồ sơ đồng bộ tức thì giữa Web (`getMe`, `readBookingData`) và Mobile (`getMe`, `updateMyProfile`). |
| **3. Luồng nhân viên (Owner tạo -> OTP -> Đặt mật khẩu)** | **PASS** | - Chủ tiệm tạo nhân viên qua M3 (`POST /api/staff`) hoặc M1 (`POST /api/auth/staff`) sinh tài khoản `stylist` ở trạng thái `pending_verification` (chưa có `passwordHash`).<br>- Nhân viên xác minh OTP (`purpose: 'activate_staff'`) trên Web (`StaffActivationModal`) hoặc Mobile (`OtpVerificationScreen`) nhận one-time `grant`; trạng thái chuyển sang `pending_password`.<br>- `grant` bị từ chối nếu dùng làm Bearer token (`401 UNAUTHORIZED`).<br>- Nhân viên hoàn tất đặt mật khẩu (`POST /api/auth/password/complete`) chuyển sang `active`, đăng nhập thành công và đọc được hồ sơ/ca làm của chính mình. |
| **4. Quên/Đặt lại mật khẩu & Thu hồi phiên (`authRevision`)** | **PASS** | - Yêu cầu OTP khôi phục (`purpose: 'reset_password'`), xác minh nhận `grant` và đặt mật khẩu mới.<br>- Tăng `authRevision` trong cùng transaction: mật khẩu cũ bị vô hiệu (`401 INVALID_CREDENTIALS`) và mọi JWT cũ trên cả Web lẫn Mobile bị thu hồi tức thì (`401 UNAUTHORIZED`).<br>- Đăng xuất (`POST /api/auth/logout`) trên một thiết bị cũng tăng `authRevision`, thu hồi phiên trên các thiết bị còn lại. |
| **5. Chu kỳ & Bảo mật OTP (Hết hạn / Resend / Sai 5 lần / Tái dùng)** | **PASS** | - **Resend cooldown 60s**: Gửi lại trước 60 giây bị chặn `429 RESEND_COOLDOWN_ACTIVE`.<br>- **Vô hiệu mã cũ khi resend**: Gửi lại sau cooldown tăng `generation` lên 2 và vô hiệu mã thế hệ 1.<br>- **Sai 5 lần**: Nhập sai đủ 5 lần trả `400 MAX_ATTEMPTS_EXCEEDED`; nhập mã đúng ngay sau đó vẫn bị từ chối.<br>- **Hết hạn 5 phút**: Mã quá `expiresAt` bị từ chối với `400 CHALLENGE_EXPIRED`.<br>- **Chặn tái dùng**: Mã OTP hoặc `grant` đã tiêu thụ không thể dùng lại (`CHALLENGE_ALREADY_CONSUMED` / `INVALID_GRANT`). |
| **6. Kiểm quyền 3 vai trò (RBAC) & Chặn nâng quyền** | **PASS** | - Truyền `roles: ['owner']` khi đăng ký công khai bị bỏ qua, luôn gán `['customer']`.<br>- `customer` và `stylist` gọi `POST /api/auth/staff` hoặc `POST /api/services` bị chặn `403 FORBIDDEN`.<br>- `customer` gọi `GET /api/staff` bị chặn `403 FORBIDDEN`.<br>- `stylist` và `owner` gọi `PATCH /api/auth/me` (cập nhật hồ sơ khách) bị chặn `403 FORBIDDEN`.<br>- Khi đăng nhập trên Web với vai trò `owner`, `OwnerRedirect` tự động gửi token qua `POST /admin/session` để cấp cookie `sol_admin_token` và chuyển hướng vào Admin EJS (`/admin/dashboard`). Cổng Admin EJS từ chối token của `customer`/`stylist` (`303 /login?error=forbidden`). |
| **7. Giao thức SMTP thật & Phục hồi lỗi gửi mail** | **PASS** | - Nodemailer gửi email OTP qua máy chủ TCP `SMTPServer` thật, trích xuất đúng mã 6 số từ nội dung thư để kích hoạt.<br>- Khi SMTP lỗi (`502 MAIL_DELIVERY_FAILED`), tài khoản vẫn giữ trạng thái `pending_verification` và phục hồi thành công khi gửi lại OTP. |

---

## 2. Bộ kiểm thử tự động & Thực thi

1. **Kiểm thử tích hợp API + Adapter Web/Mobile + MongoDB Replica Set + SMTP thật**:
   - File: [apps/api/src/modules/auth/tests/auth.integration.test.js](../../../apps/api/src/modules/auth/tests/auth.integration.test.js)
   - Sử dụng `MongoMemoryReplSet` (MongoDB 8.0.17), HTTP socket thật (`app.listen(0, '127.0.0.1')`), `SMTPServer` thật và các hàm client nguyên bản của Web (`apps/web/src/features/auth/api/auth.api.js`) cùng Mobile (`apps/mobile/src/features/auth/api/auth.api.js`).
2. **Kiểm thử luồng giao diện Web DOM (Happy DOM)**:
   - File: [apps/web/src/features/auth/tests/auth-flow.test.jsx](../../../apps/web/src/features/auth/tests/auth-flow.test.jsx)
   - Kiểm chứng `AuthProvider`, `AuthModal`, `StaffActivationModal` và `UserNav` qua các bước đăng ký, nhập OTP, xử lý lỗi `ACCOUNT_NOT_ACTIVE` và kích hoạt nhân viên đặt mật khẩu.
3. **Kiểm thử đơn vị và tích hợp nền tảng M1 hiện có**:
   - API: `apps/api/src/modules/auth/tests/auth.api.test.js`, `accounts.model.test.js`, `auth-challenges.model.test.js`, `password.test.js`
   - Web: `apps/web/src/features/auth/tests/auth.api.test.js`, `auth.validation.test.js`, `AuthModal.test.jsx`
   - Mobile: `apps/mobile/src/features/auth/tests/auth.api.test.js`, `auth.storage.test.js`, `auth.validation.test.js`

### Kết quả chạy lệnh kiểm tra

- `npm test --workspace=@sol-hair/api -- src/modules/auth/tests/auth.integration.test.js`:
  ```text
  ✓ src/modules/auth/tests/auth.integration.test.js (6 tests)
    ✓ SOL-020: Tích hợp và nghiệm thu tài khoản (M1 Auth Integration & Acceptance) (6)
      ✓ 1. Luồng khách hàng trên Web & Mobile: đăng ký, chặn active gate trước OTP, kích hoạt nhận phiên trực tiếp, bổ sung tên + SĐT E.164 và đồng bộ đa thiết bị
      ✓ 2. Luồng cấp phát và kích hoạt nhân viên (Owner -> Staff OTP -> Đặt mật khẩu trên Web & Mobile -> Đăng nhập đọc ca làm)
      ✓ 3. Luồng quên/đặt lại mật khẩu và thu hồi phiên (authRevision): vô hiệu mật khẩu cũ và lập tức đăng xuất mọi thiết bị đang mở
      ✓ 4. Kiểm chứng toàn diện bảo mật OTP: hết hạn 5 phút, cooldown resend 60 giây, vô hiệu mã cũ khi resend, khóa sau 5 lần sai và chặn tái dùng
      ✓ 5. Kiểm quyền RBAC 3 vai trò (Customer / Stylist / Owner), chặn leo thang đặc quyền và bảo vệ cổng Admin EJS
      ✓ 6. Giao thức SMTP thực tế: gửi email OTP qua máy chủ SMTP thật và giữ nguyên trạng thái pending khi mail lỗi để phục hồi
  Test Files  1 passed (1)
       Tests  6 passed (6)
  ```

- `npm test --workspace=@sol-hair/web -- src/features/auth/tests/auth-flow.test.jsx`:
  ```text
  ✓ src/features/auth/tests/auth-flow.test.jsx (3 tests)
    ✓ SOL-020 Web Auth UI Flows (DOM Integration) (3)
      ✓ luồng khách hàng: đăng ký -> chuyển sang màn OTP -> nhập sai nhận thông báo lỗi -> nhập đúng kích hoạt trực tiếp vào phiên active
      ✓ active gate: đăng nhập tài khoản chưa kích hoạt hiện nút chuyển sang nhập mã OTP kích hoạt ngay
      ✓ luồng nhân viên (StaffActivationModal): nhập email -> xác minh OTP nhận grant -> tự đặt mật khẩu mới
  Test Files  1 passed (1)
       Tests  3 passed (3)
  ```

- Tổng hợp toàn bộ test suite M1 Tài khoản trên 3 workspace (`@sol-hair/api`, `@sol-hair/web`, `@sol-hair/mobile`):
  ```text
  API (src/modules/auth/):    5 passed (5 files), 55 passed (55 tests)
  Web (src/features/auth/):   7 passed (7 files), 54 passed (54 tests)
  Mobile (src/features/auth/): 3 passed (3 files), 26 passed (26 tests)
  Tổng cộng M1 Auth:          15 test files PASS, 135 tests PASS
  ```

- Kiểm tra `npm run lint` và `npm run build` toàn dự án:
  ```text
  npm run lint  -> PASS across @sol-hair/api, @sol-hair/mobile, @sol-hair/web, shared (0 errors)
  npm run build -> PASS API syntax (89 files), Web Vite build, Mobile Android & iOS export
  ```

---

## 3. Ranh giới triển khai & Giới hạn ghi nhận

- Tuân thủ đúng thiết kế baseline SOL-016 (`accounts`, `auth_challenges`, `customers`; không dùng collection `auth_sessions`, kiểm soát phiên qua `authRevision`).
- Không phát sinh dependency mới, không sửa đổi hợp đồng API hay thay dữ liệu khách thật của salon.
- Mobile adapter (`apps/mobile/src/features/auth/api/auth.api.js`) được kiểm thử trực tiếp qua socket HTTP thật trong môi trường Node; không tuyên bố đã chạy demo iOS hoặc chụp màn hình thiết bị Android vật lý khi chưa mở máy ảo trong lượt chạy này.
