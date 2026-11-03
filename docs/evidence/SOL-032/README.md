# SOL-032 — Web đặt lịch và chủ đặt hộ

Ngày 21/10/2026. Branch `feat/SOL-032-web-booking`.

## Kiểm tra đã chạy

- `npm run lint`: PASS cả ba workspace.
- `npm run test --workspace @sol-hair/web`: 72 test PASS (21 mới), gồm payload allowlist, owner walk-in,
  yêu cầu chọn đúng hồ sơ, validation contact, double click, retry cùng key sau lỗi chưa xác định,
  bỏ key sau definite conflict, API adapter và gate đăng nhập/stylist.
- `npm run build:web`: PASS, Vite build.
- Chrome desktop trên Windows: đã thao tác thật bằng browser UI với server fixture riêng ở localhost;
  không kết nối DB thật hoặc gửi lịch/email cho khách thật. API fixture và tài khoản đều tổng hợp,
  không nằm trong source chạy sản phẩm.
- Đã chạy: gate đăng nhập; giá 0; chọn dịch vụ/stylist/giờ; HTTP 503 sau khi receipt mẫu đã tạo;
  retry cùng key/payload nhận lại mã cũ; HTTP 409 bỏ chọn giờ/stylist và khóa xác nhận tới khi chọn lại;
  owner tìm hai hồ sơ cùng phone, chọn hồ sơ B và đặt tới ngay mà không gửi timestamp preview.
- Audit request mẫu: [retry-audit.json](retry-audit.json), [owner-audit.json](owner-audit.json).
- Ảnh chụp thật từ fixture: [thành công](web-success.png), [xung đột](web-conflict.png).

## Giới hạn

- Không tuyên bố đã tạo lịch thật: POST appointments và tìm hồ sơ owner cần SOL-031 theo
  [hợp đồng bàn giao](../../booking-ui-contract.md). Catalog cần duration cố định từ SOL-021.
- Chưa kiểm responsive ở đầy đủ 320/375/768/1024/1440px hoặc thiết bị thật; layout dùng Tailwind grid/flex responsive.
- Không thay API/DB, không làm lịch sử/đổi-hủy M5, không thanh toán. Android UI thuộc SOL-033.
- CI đầy đủ và merge được ghi tại PR/Sheet; không thay bằng kết quả fixture.
