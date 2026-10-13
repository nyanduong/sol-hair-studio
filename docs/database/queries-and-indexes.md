# Query và index — SOL-016

Đặc tả triển khai, chưa tạo index hoặc chạy explain trên DB. Giới hạn page dưới đây là lựa chọn kỹ thuật cho một tiệm; BR lấy từ [scope](scope-alignment.md).

## Luồng dữ liệu và quyền

| Luồng | Query / dữ liệu | Writer và lưu ý |
| --- | --- | --- |
| Danh mục public | services: isActive=true; sort displayOrder,id; resolve cover images theo tập ID | M2 owner thêm/sửa/ẩn; public DTO vẫn 8 field |
| Auth / OTP | accounts.emailNormalized; auth_challenges(accountId,purpose) | M1 atomic generation/attempt/expiry; hash/digest/proof không trả DTO |
| Hồ sơ khách | customers.accountId từ identity; owner tìm phone rồi chọn profile | M1 account profile; M4 khách vãng lai; phone không unique/không auto merge |
| Chọn stylist | staff.isActive=true, serviceIds $all 1–5 IDs | M3 quản lý; M4 kiểm lại trong transaction |
| Ca / nghỉ | staff_shifts(staffId,status,startAt), endAt giao ngày; staff_time_off(staffId,startAt), endAt giao ngày | M3 owner; stylist chỉ đọc mình |
| Slot / tạo lịch | staff + ca/nghỉ + appointments cùng staff/customer giao khoảng | M4 đọc lại dưới guard customer và staff; ghi receipt, appointment, event |
| Lịch khách | customerId identity; sort startAt desc,_id desc | Customer chỉ lịch mình, page 20/max50, cursor cặp giờ/ID |
| Lịch tiệm | localDate eq, tùy staffId; sort startAt asc,_id asc | Owner toàn tiệm; stylist thêm staffId bắt buộc; page50/max100 |
| Lịch sử phục vụ | customerId,status=completed; sort completedAt desc,_id desc | Stylist chỉ trong ngữ cảnh lịch được giao; allowlist, không email/hủy/no-show |
| Đổi/hủy/trạng thái/ETA/correction | _id + revision + status; receipt lệnh gần nhất lastCommand | M4 tạo/availability; M5 reschedule/cancel/lifecycle; chung guard và event format |
| Retry tạo | booking_requests(actorId,key); kiểm expiresAt>serverNow và requestHash | M4; hết hạn vẫn kiểm overlap, TTL chỉ dọn |
| Audit lịch | appointment_events(appointmentId,revision) asc | M4/M5 append-only cùng transaction, owner correction cần reason |

Không đặt API quản trị kho ảnh/gallery/purge làm điều kiện MVP. images giữ kho metadata dùng chung; tham chiếu gallery cũ là tương thích thiết kế.

## Public services và runtime hiện tại

[Repository](../../apps/api/src/modules/services/services.repository.js) đang find isActive, sort displayOrder/id và **exclude** metadata. Thêm field mới vào DB trước khi đổi projection sẽ làm lộ field mới. Task M2 phải chuyển sang allowlist trước backfill, gom cover ID rồi resolve URL theo tập (tránh một query mỗi thẻ).

DTO chính xác: id, slug, name, description, category, durationMinutes, priceVnd, imageUrl trong {data:[...]}. id vẫn String. Cover archive vẫn resolve liên kết cũ; cover mất là lỗi integrity, không âm thầm bỏ thẻ. Giữ response 503 DATABASE_UNAVAILABLE khi DB chưa sẵn sàng. Web và mobile đã có consumer services; SOL-016 không sửa chúng hoặc runtime model.

## Index đề xuất

MongoDB tự có _id unique. Chỉ cài sau audit duplicate/shape; optional account dùng partial type objectId để nhiều guest cùng thiếu field không đụng unique. Không dùng sparse với null như giải pháp.

| Collection | Key / option | Mục đích |
| --- | --- | --- |
| services | {id:1} unique; {slug:1} unique | Identity String và slug |
| services | {isActive:1,displayOrder:1,id:1} | Danh mục sort hiện có |
| images | {cloudName:1,cloudinaryAssetId:1} unique; {cloudName:1,publicId:1} unique | Identity asset/đường dẫn |
| accounts | {emailNormalized:1} unique | Login/email, không unique phone |
| auth_challenges | {accountId:1,purpose:1} unique | Một challenge slot/purpose; **không TTL** |
| customers | {accountId:1} unique, partialFilterExpression:{accountId:{$type:'objectId'}} | Một hồ sơ/account; guest thiếu account |
| customers | {phone:1,_id:1} non-unique | Owner tìm/chọn đúng hồ sơ |
| staff | {accountId:1} unique | Owner hoặc stylist profile |
| staff | {isActive:1,serviceIds:1} | Multikey năng lực; đo explain trước khi thêm sort index |
| staff_shifts | {staffId:1,status:1,startAt:1} | Ca giao ngày; endAt residual |
| staff_time_off | {staffId:1,startAt:1} | Nghỉ giao khoảng; endAt residual |
| appointments | {staffId:1,status:1,occupiedFrom:1} | Staff overlap, occupiedUntil residual |
| appointments | {customerId:1,status:1,occupiedFrom:1} | Customer overlap; actual/planned end residual, không cleanup |
| appointments | {customerId:1,startAt:-1,_id:-1} | Lịch khách |
| appointments | {localDate:1,startAt:1,_id:1} | Lịch tiệm |
| appointments | {staffId:1,localDate:1,startAt:1,_id:1} | Lịch nhân viên |
| appointments | {customerId:1,status:1,completedAt:-1,_id:-1} | Lịch sử đã hoàn tất |
| booking_requests | {actorId:1,key:1} unique | Claim tạo lịch, không partial theo expiry |
| booking_requests | {expiresAt:1}, expireAfterSeconds:0 | Cleanup receipt 24h; check expiry tại app |
| appointment_events | {appointmentId:1,revision:1} unique | CAS audit order, không TTL |

Không unique(staffId,startAt): hai giờ bắt đầu khác nhau vẫn có thể chồng. Không TTL auth_challenges để giữ cooldown; thay code/digest cùng slot khi resend, không lưu mảng lịch sử OTP. Mọi parent reference kiểm ở service trong session, index không phải foreign key.

## Kiểm khoảng đúng

Với interval [from,until), overlap khi existingFrom < until và existingUntil > from. Lọc status confirmed/in_progress/completed rồi xét khoảng [BR thời gian](business-rules.md#time); cancelled/no_show không chặn. Customer dùng giờ phục vụ, staff gồm dọn. Completed vẫn chặn thời gian thực tế đã phục vụ+dọn; không giữ nguyên toàn khoảng dự kiến khi hoàn tất sớm.

Không chỉ query các document occupiedUntil>now rồi quảng cáo slot: in_progress đã quá ETA cần nhánh phát hiện riêng (staffId,status=in_progress), coi giờ rảnh chưa xác định cho đến ETA/complete. Overrun cảnh báo danh sách lịch giao ETA; không tự dời.

Unique index và snapshot transaction riêng lẻ không ngăn write skew. Mọi writer availability thực sự increment cùng guard staff/customer theo thứ tự [đồng thời](business-rules.md#concurrency). Ca/nghỉ khóa staff; booking cũng khóa staff trước đọc ca. Phải kiểm lại trạng thái, references, scope, receipts sau khóa.

## Handoff kỹ thuật

M1 giao identity/account status và customer profile; M2 service reader snapshots/ảnh; M3 staff + shifts reader; M4 booking transaction + availability + receipts; M5 reuse cùng transaction/guard/event để lifecycle. Các module có thể code song song với fixture; các luồng thật chỉ ghép khi reader/model được tích hợp. Không module tự có schema services/customer khác hoặc khóa RAM riêng. Sau triển khai đo explain, index size và duplicate errors ở staging; chưa có số đo trong PR này.
