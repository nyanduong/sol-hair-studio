# Kế hoạch chuyển baseline — SOL-016

**Chỉ tài liệu.** PR không kết nối MongoDB, sửa data thật, chạy migration/seed, đọc .env hoặc gọi Cloudinary/mail. Baseline runtime hiện còn ServiceModel cũ; target 11 collection là thiết kế để các module triển khai. Không có tuyên bố rollout đã diễn ra.

## Trình tự tích hợp an toàn

1. Mỗi module bổ sung model/validator của mình theo [schema](schema.md); cùng dùng services.id String, customerId/staffId ObjectId, UTC/Asia_Ho_Chi_Minh. Kiểm replica set/transaction, backup và quy trình restore ở môi trường được phép trước bật booking.
2. M2 đổi public projection sang allowlist đúng 8 field **trước** đưa bookingDurationMinutes/coverImageId/images vào service document. Chạy regression web/mobile và response 503. Không cần chờ mọi module xong mới code UI.
3. Audit service/ảnh: duplicate id/slug/asset, duration thiếu, URL không map asset. Lập dry-run report; owner chọn bookingDurationMinutes cố định và xác nhận metadata. Không tự lấy max duration hay upload lại/overwrite file để backfill.
4. Nếu có dữ liệu accounts/staff ngoài runtime repo: audit role receptionist cũ, email duplicate, trạng thái xác minh, account liên kết owner. **Không tự chuyển receptionist thành owner**, không coi isActive=true legacy là đã OTP; yêu cầu mapping được chủ xác nhận. Không tạo account thứ hai để owner nhận lịch.
5. Chuyển weeklyHours legacy thành ca ngày chỉ khi chủ xác nhận tuần/ngày cụ thể; không tự mở 7 ngày lặp. Giữ bản nguồn đến đối chiếu xong. Dùng staff_shifts cho writer mới, không hai nguồn lịch cạnh tranh.
6. Customers thêm bookingRevision=0 theo batch kiểm soát; phone chuẩn hóa nhưng **không unique/auto merge/link**. Lịch cũ thiếu phone/snapshot phải được xử lý thủ công trước cho thay đổi yêu cầu đầy đủ; không bịa thông tin.
7. Nếu đã có appointment legacy: giữ lịch/snapshot/actual, tạo occupiedFrom/Until đúng status; đối chiếu overlap cùng customer và staff, ca, lifecycle. Event imported phải ghi nguồn gốc thật (cần kế hoạch riêng khi có dữ liệu đó), không giả event server đã từng xảy ra. Runtime repo chưa có collection booking thực thi.
8. Tạo index sau audit, bật validator theo giai đoạn warn rồi error sau khi dữ liệu sạch; migration riêng phải idempotent, dry-run, log không PII/secret, có checkpoint. Không tự chạy script từ tài liệu này.
9. M4/M5 bật mọi writer cùng guard/transaction; không rollout lẫn writer cũ không khóa và writer mới. Test hai request khác key/cùng key, customer khác staff, shift edit race, expiry receipt còn vật lý, unknown commit, correction và overrun trên replica set.
10. Bật theo module sau smoke test; rollback feature booking trước, giữ dữ liệu additive/audit. Không drop collection/event/image hoặc rollback OTP thành bỏ xác minh.

## Tương thích / giới hạn

- Services DTO 8 field và id String giữ nguyên; legacy imageUrl chỉ đọc cho đến cover backfill đã đối chiếu. Chỉ một nguồn ghi URL sau chuyển đổi.
- Không runtime endpoint/model mới trong SOL-016. Fixtures không phải seed: email .invalid, ID/hash/asset đều giả.
- booking_requests TTL không đụng appointments/events; auth_challenges không TTL. Expiry kiểm ở service, không chờ TTL.
- Các case auth/email delivery, replay/transaction/concurrency, topology và dữ liệu thực phải được kiểm tra trong module tương ứng; offline checker không chứng minh chúng.
- [Phân chia module](scope-alignment.md) là ranh giới dữ liệu tối thiểu, không tài liệu API đầy đủ hoặc backlog mới.
