# SOL-042 — Booking refinement

Ngày kiểm tra: 31/10/2026. Giao diện customer theo mockup đã duyệt; không đổi API, dữ liệu, shared booking manager hoặc mobile.

## Kiểm tra

- `npm run lint --workspace @sol-hair/web`: PASS.
- `npm run test --workspace @sol-hair/web`: 600 tests / 33 files PASS.
- `npm run build:web`: PASS; cảnh báo bundle >500 kB hiện có.
- `git diff --check`: PASS.
- Chrome trên localhost: customer đã đăng nhập, homepage service được chọn sẵn; bước 1 → bước 2 hiển thị lỗi cấu hình thời lượng hiện có, không cho tiến tới xác nhận khi chưa có slot.
- Fixture tạm trong tab riêng dùng BookingPage thật + AuthContext tổng hợp, chặn toàn bộ fetch bằng response tổng hợp (không gửi token/hồ sơ/POST đến API thật): chọn giờ → xác nhận; thiếu phone chặn xác nhận; lưu hồ sơ reset slot và đưa về bước 2; lỗi 409 reset slot/đưa về bước 2; lỗi 503 khóa quay lại/chọn dịch vụ, retry 2 POST cùng key và payload, thành công khóa chỉnh sửa.
- Payload retry đã quan sát: serviceIds [s0], staffId staff-a, bookingMode customer, startAt 2026-11-01T03:00:00Z; hai lần gửi cùng intent. Đây là dữ liệu giả, không phải lịch thật.
- Fixture owner: form tìm khách, khách tới ngay, ngày/stylist vẫn hiện đồng thời; không xuất hiện wizard customer. Chưa chạy lại toàn bộ owner flow.
- Chrome emulation 390 × 844: document width = scrollWidth = 390, thẻ và các bước đọc được; ảnh lỗi hiện fallback Sol. Chọn dịch vụ thứ 6 bị từ chối và hiện thông báo tối đa 5.

## Giới hạn

Không tạo lịch thật, không lưu hồ sơ người dùng, không chỉnh dữ liệu danh mục/DB. Dịch vụ thật Cắt & tạo kiểu vẫn bị API từ chối vì chưa có giá/thời lượng booking cố định hợp lệ. Mobile ở đây là responsive Web trong Chrome, không phải nghiệm thu ứng dụng native hay điện thoại thật. Fixture tạm được xóa sau khi kiểm tra, không nằm trong bundle sản phẩm.
