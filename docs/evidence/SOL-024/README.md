# SOL-024 — Dùng chung: Kiểm thử tích hợp và hồi quy 5 module (Sprint 3 Nghiệm thu & Bàn giao)

Ngày 31/10/2026, Windows; Node 24.12.0, MongoDB Replica Set trong bộ nhớ (8.0.17) và MongoDB local (`127.0.0.1:27017`).
Nguồn: [Sol Hair Studio — Kế hoạch & phân công](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit?gid=0&range=A24:O24).

Nhiệm vụ: Xây dựng và thực thi bộ kiểm thử tích hợp đầu-cuối (End-to-End Integration) và kiểm thử hồi quy (Regression Test) liên module xuyên suốt toàn bộ 5 module nghiệp vụ:
- **Module 1 (M1)**: Xác thực, tài khoản và hồ sơ khách hàng (Auth & Profile)
- **Module 2 (M2)**: Dịch vụ và danh mục chuẩn salon (Services & Catalog)
- **Module 3 (M3)**: Nhân sự và phân bổ ca làm việc (Staff & Shifts)
- **Module 4 (M4)**: Đặt lịch hẹn và vòng đời phục vụ (Appointments & Lifecycle)
- **Module 5 (M5)**: Cổng quản trị, kiểm toán và bảo toàn dữ liệu (Admin & Audit)

Đồng thời thực hiện kiểm thử tự động trên trình duyệt thật (**Browser Automation**) với tài khoản quản trị và khách hàng thực tế trên Web UI và Admin EJS Portal.

---

## 1. Ma trận bằng chứng tích hợp & hồi quy 5 module

| Nhóm chức năng | Tiêu chí kiểm tra | Kết quả & Bằng chứng | Chi tiết kỹ thuật |
| --- | --- | --- | --- |
| **M1, M2 & M3** | Phân quyền RBAC, DTO danh mục 8 trường và phân bổ ca nhân sự | **PASS** | - Tạo dịch vụ mới qua ServiceModel.<br>- Khách hàng gọi `GET /api/services` chỉ nhận đúng 8 trường allowlist (`category`, `description`, `durationMinutes`, `id`, `imageUrl`, `name`, `priceVnd`, `slug`), không rò rỉ trường quản trị.<br>- Phân bổ ca làm việc qua `POST /api/staff/:id/shifts`.<br>- Tự động chặn ca trùng lặp với mã lỗi `409 SHIFT_OVERLAP`.<br>- Chặn khách hàng thường gọi các endpoint quản trị (`403 Forbidden`). |
| **M4 & M5** | Luồng khép kín từ Đặt lịch -> Bắt đầu -> ETA -> Hoàn thành và Audit Log | **PASS** | - Khách tra cứu lịch rảnh `GET /api/availability?serviceIds=...&localDate=...`.<br>- Khách tạo lịch hẹn `POST /api/appointments` kèm `Idempotency-Key` tại slot hợp lệ (HTTP 201).<br>- Ghi nhận event `created` trong `AppointmentEventModel`.<br>- Stylist bắt đầu làm (`POST /api/appointments/:id/start`, HTTP 200).<br>- Stylist cập nhật ETA (`POST /api/appointments/:id/eta`, HTTP 200).<br>- Stylist hoàn tất dịch vụ (`POST /api/appointments/:id/complete`, HTTP 200).<br>- Toàn bộ chuỗi audit events được lưu trữ đầy đủ: `created` -> `started` -> `eta_updated` -> `completed`. |
| **Hồi quy liên module 1** | Bảo toàn Snapshot lịch hẹn M4 khi đổi giá / ẩn dịch vụ M2 | **PASS** | Sau khi lịch hẹn được đặt, Chủ tiệm tăng giá dịch vụ từ 300.000đ lên 800.000đ, đổi tên và tắt hiển thị (`isActive = false`). Snapshot lịch hẹn đã đặt trong DB vẫn giữ nguyên vẹn giá 300.000đ và tên ban đầu. |
| **Hồi quy liên module 2** | Bảo vệ ca làm việc M3 khi có lịch hẹn đã xác nhận ở M4 | **PASS** | Chủ tiệm gọi lệnh xóa ca làm việc đang có lịch hẹn `confirmed` của khách. Hệ thống từ chối xóa (HTTP 400/409) và bảo toàn ca làm việc trong cơ sở dữ liệu. |
| **Hồi quy bảo mật liên module** | Chống can thiệp chéo giữa các khách hàng và bảo vệ route Admin | **PASS** | - Khách hàng B cố tình gọi API hủy lịch hẹn của Khách hàng A -> Bị từ chối (HTTP 403/404).<br>- Khách hàng B cố tình gọi route bắt đầu dịch vụ của Stylist -> Bị từ chối (HTTP 403). |

---

## 2. Kiểm thử tự động (Automated Test Suites)

Bộ kiểm thử tích hợp 5 module được triển khai tại:
`apps/api/src/modules/admin/tests/five-modules.integration.test.js`

### Kết quả chạy kiểm thử

- `npm test --workspace=@sol-hair/api src/modules/admin/tests/five-modules.integration.test.js`:
  ```text
  ✓ src/modules/admin/tests/five-modules.integration.test.js (5 tests)
    ✓ SOL-024: Kiểm thử tích hợp và hồi quy 5 module (Cross-Module E2E Regression) (5)
      ✓ M1, M2 & M3: Phân quyền RBAC, kiểm tra DTO danh mục 8 trường và phân bổ ca nhân sự
      ✓ M4 & M5: Luồng khép kín từ Đặt lịch -> Bắt đầu -> ETA -> Hoàn thành và ghi nhận Audit Event
      ✓ Hồi quy liên module 1: Thay đổi giá hoặc ẩn dịch vụ M2 không ảnh hưởng đến snapshot lịch hẹn M4
      ✓ Hồi quy liên module 2: Chặn xóa hoặc vô hiệu ca làm việc M3 nếu có lịch hẹn confirmed/in_progress ở M4
      ✓ Hồi quy bảo mật liên module: Khách hàng không thể can thiệp lịch của khách khác hoặc gọi route admin
  Test Files  1 passed (1)
       Tests  5 passed (5)
  ```

- `npm run lint`:
  ```text
  PASS across all workspaces: @sol-hair/api, @sol-hair/mobile, @sol-hair/web, lint:shared
  0 errors, 0 warnings.
  ```

---

## 3. Bằng chứng kiểm thử giao diện bằng Browser Automation

Thực hiện kiểm thử tự động điều khiển trình duyệt Google Chrome trên giao diện thật:
- **Server API**: `http://localhost:4000` (kết nối MongoDB local)
- **Web Client**: `http://localhost:5173` (React Vite)
- **Cổng Quản trị Chủ tiệm (Admin EJS)**: `http://localhost:4000/admin`

### Nhật ký kiểm thử tự động trên giao diện (Browser Automation Execution Log)

| Bước kiểm thử | Thao tác tự động | Kết quả đạt được |
| --- | --- | --- |
| **1. Trang chủ Web** | Mở trình duyệt Chrome truy cập `http://localhost:5173` | Tải trang chủ Sol Hair Studio thành công, danh mục dịch vụ hiển thị đầy đủ |
| **2. Mở Modal Đăng nhập** | Tìm và click nút "Đăng nhập" trên Header (`SiteHeader.jsx`) | Modal xác thực (`AuthModal.jsx`) mở mượt mà, focus trường email |
| **3. Điền form Khách hàng** | Tự động nhập tài khoản khách hàng `truongkhang1412@gmail.com` | Giá trị form hợp lệ, không phát sinh lỗi validate client-side |
| **4. Xác thực Khách hàng** | Gửi form đăng nhập lên API `POST /api/auth/login` | Nhận JWT token thành công, đóng modal, UserNav hiển thị trạng thái đã đăng nhập |
| **5. Trang Đặt lịch** | Điều hướng vào luồng đặt lịch trực tuyến `/booking` | Trang đặt lịch hiển thị danh mục và các bước lựa chọn lịch hẹn |
| **6. Cổng Quản trị Admin** | Mở tab mới truy cập `http://localhost:4000/admin/login` | Hiển thị giao diện đăng nhập dành riêng cho Quản trị viên/Chủ tiệm |
| **7. Điền form Chủ tiệm** | Tự động nhập tài khoản quản trị `truongkhanglq@gmail.com` | Form quản trị nhận thông tin chính xác |
| **8. Bảng điều khiển Quản trị** | Gửi form đăng nhập quản trị `POST /admin/login` | Nhận cookie phiên quản trị, chuyển hướng thành công vào `/admin/services` quản lý danh mục |


