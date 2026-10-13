# Ví dụ giả và checker — SOL-016

11 file collection EJSON là **dữ liệu minh họa target**, không seed hoặc data production. services-response.json là DTO envelope, không collection. IDs chỉ ổn định trong bộ ví dụ, có thể trùng giữa collection. Email .invalid, password/digest/asset đều giả và không dùng được để đăng nhập/upload.

## Tình huống

- accounts: khách active, stylist active, owner active và nhân viên pending OTP; không receptionist.
- staff: owner có staff profile nhận lịch; staff_shifts theo ngày thực tế, staff_time_off do chủ ghi.
- customers: khách đăng nhập và guest; hai hồ sơ khác chung phone được giữ riêng.
- appointments: confirmed, cancelled, completed sớm (giải phóng sau actual+10 phút), no_show có đã liên hệ; owner walk-in 13:07 không ép grid; in_progress bắt đầu sớm, ETA và event tương ứng.
- booking_requests: key riêng actor, expiresAt=createdAt+24h; retained lịch sử mẫu receipt đã expired để minh họa TTL có thể chưa dọn.
- appointment_events: chuỗi created/start/complete hoặc cancel/no_show theo revision; hiện trạng khớp event cuối.
- auth_challenges: activate_staff một generation, 5 phút/60 giây/attempt limit; không mã OTP thật.
- services/images giữ mẫu 3 dịch vụ từ SOL-011 để kiểm regression DTO. **Không phải toàn catalog MVP 5 loại cắt/uốn/duỗi/nhuộm/phục hồi**; không tự đổi danh mục runtime từ fixture.

## Chạy

Từ root repository:

```powershell
node docs/database/checks/validate-examples.mjs --self-test
```

Node built-in; không dependency mới, không import app, không đọc biến môi trường/.env hoặc kết nối DB. Checker kiểm shape/reference/derived/lịch/audit/DTO và file links/sơ đồ, cùng các biến thể hợp lệ/không hợp lệ trong bộ nhớ. Kiểm capability tại thời điểm create/reschedule là trách nhiệm service, không so kỹ năng hiện tại với snapshot lịch cũ.

Checker không phải validator deploy, không mô phỏng OTP cryptography, state machine runtime hoặc concurrent transactions. Điều kiện người đã tới/đã làm xong/đã liên hệ là fact vận hành do writer có quyền ghi, không suy ra từ JSON. [BR](../business-rules.md), [schema](../schema.md), [kế hoạch tích hợp](../migration-plan.md).
