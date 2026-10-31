# SOL-023 — M2 Dịch vụ: Tích hợp dịch vụ và hồi quy danh mục

Ngày 31/10/2026, Windows; Node 22.x/24.x, MongoDB replica set tạm (mongodb-memory-server 8.0.17).
Nguồn: [Sol Hair Studio — Kế hoạch & phân công](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit?gid=0&range=A23:O23).

Nhiệm vụ: Xây dựng bộ kiểm thử tích hợp đầu-cuối (end-to-end integration & regression test) cho Module 2 Dịch vụ, kiểm chứng sự đồng bộ đa nền tảng giữa Web, Mobile và API, đảm bảo an toàn DTO công khai và bảo toàn snapshot lịch hẹn khi danh mục biến động.

---

## 1. Ma trận bằng chứng tích hợp & hồi quy

| Tiêu chí kiểm tra | Kết quả & Bằng chứng | Chi tiết kỹ thuật |
| --- | --- | --- |
| **1. Quản lý dịch vụ chủ tiệm (Owner Service Management)** | **PASS** | Chủ tiệm tạo dịch vụ mới, chỉnh sửa thông tin giá/thời lượng và bật/tắt (ẩn) dịch vụ qua API thực tế kết nối MongoDB replica set. Dữ liệu lưu trữ chính xác. |
| **2. Đồng bộ đa nền tảng (Web & Mobile Client Sync)** | **PASS** | Cả Web client (`apps/web`) và Mobile client (`apps/mobile`) gọi endpoint chung `GET /api/services`. Khi chủ tiệm ẩn dịch vụ, cả 2 nền tảng đều tức thời không còn nhận dịch vụ đó. |
| **3. Hồi quy DTO công khai (Anti-leakage Allowlist)** | **PASS** | Endpoint công khai chỉ trả về đúng **8 trường cho phép** (`id`, `name`, `slug`, `description`, `category`, `durationMinutes`, `priceVnd`, `imageUrl`), tuyệt đối không rò rỉ trường nhạy cảm/nội bộ. |
| **4. Hồi quy bảo toàn lịch hẹn (Snapshot Preservation)** | **PASS** | Khi chủ tiệm tăng giá dịch vụ (vd: từ 200.000đ lên 500.000đ) hoặc ẩn dịch vụ, snapshot của các lịch hẹn đã đặt trước đó trong `AppointmentModel.items` vẫn giữ nguyên giá và tên gốc lúc đặt. |
| **5. Hồi quy sắp xếp danh mục (Catalog Ordering Stability)** | **PASS** | Danh mục dịch vụ trả về luôn được sắp xếp ổn định theo `displayOrder` tăng dần và `id`. |

---

## 2. Kiểm thử tự động

Bộ test tích hợp được triển khai tại:
`apps/api/src/modules/services/tests/services.integration.test.js`

File test sử dụng:
- MongoDB Replica Set thật trong bộ nhớ (`mongodb-memory-server` v8.0.17)
- Express App và HTTP socket thật (`app.listen(0, '127.0.0.1')`)
- API client adapters nguyên bản của Web (`@sol-hair/web/src/features/services/api/services.api.js`) và Mobile (`@sol-hair/mobile/src/features/services/api/services.api.js`)
- Model Mongoose: `ServiceModel`, `ImageModel`, `AccountModel`, `AppointmentModel`, `CustomerModel`, `StaffModel`

### Kết quả chạy kiểm thử

- `npm test --workspace=@sol-hair/api src/modules/services/tests/services.integration.test.js`:
  ```text
  ✓ src/modules/services/tests/services.integration.test.js (5 tests)
    ✓ SOL-023: Tích hợp dịch vụ và hồi quy danh mục (M2 Integration & Regression) (5)
      ✓ Quản lý dịch vụ phía chủ tiệm: thêm, sửa, ẩn dịch vụ và bảo toàn dữ liệu MongoDB
      ✓ Đồng bộ danh mục đa nền tảng: Web và Mobile client nhận cùng dữ liệu API tức thì
      ✓ Hồi quy DTO công khai: Bảo vệ trường nhạy cảm, chỉ trả về đúng 8 field allowlist
      ✓ Hồi quy lịch hẹn: Sửa giá hoặc ẩn dịch vụ không làm thay đổi snapshot lịch đã đặt
      ✓ Hồi quy sắp xếp: Danh mục luôn được sắp xếp theo thứ tự hiển thị displayOrder và id
  Test Files  1 passed (1)
       Tests  5 passed (5)
  ```

- `npm test --workspace=@sol-hair/api src/modules/services/`:
  ```text
  Test Files  5 passed (5)
       Tests  39 passed (39)
  ```

- `npm run lint`:
  ```text
  PASS across all workspaces: @sol-hair/api, @sol-hair/mobile, @sol-hair/web, lint:shared
  0 errors, 0 warnings.
  ```

---

## 3. Ranh giới triển khai & Giới hạn còn lại

- Giữ nguyên ranh giới monorepo JavaScript/JSX thuần, không đưa TypeScript/TSX vào dự án.
- Không phát sinh dependency mới ngoài các thư viện đã thống nhất.
- Kiểm thử đa nền tảng ở tầng adapter mạng và DTO thực tế (Mobile adapter chạy trên môi trường Node, kiểm chứng tính tương thích của API client).

