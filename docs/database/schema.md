# Schema DB baseline MVP — SOL-016

Thiết kế kỹ thuật chờ review, BR đã chốt; chưa là model/validator đang chạy. [Quy tắc ghi](business-rules.md), [query/index](queries-and-indexes.md), [mẫu giả](examples/README.md) dùng cùng field dưới đây.

## Quy ước

- R: bắt buộc, không null. O: được thiếu, không lưu null. Mọi collection có `_id` ObjectId, `createdAt`/`updatedAt` UTC Date, server sinh; createdAt≤updatedAt. EJSON giả dùng `$oid`/`$date`.
- Number là số nguyên hữu hạn; BSON int/double đều được nếu integral. Mọi subdocument nhúng `_id:false`. Không dùng `__v` làm revision nghiệp vụ.
- ObjectId DTO mới serialize chuỗi hex; **services.id vẫn String**. DTO allowlist theo quyền, không serialize nguyên model. Biết ID không cấp quyền.
- Các giới hạn độ dài/technical bounds kế thừa là lựa chọn kỹ thuật, không thêm BR sản phẩm. Snapshot tối đa 5 item nên bounded; lịch sử/events/ca theo ngày không nhúng mảng tăng vô hạn.

## services

Giữ cấu trúc cũ và public DTO. Reference dịch vụ dùng services.id, không tự đổi ObjectId.

| Field | Kiểu / bắt buộc | Quy tắc |
| --- | --- | --- |
| id, slug | String R | Unique, immutable; mẫu lowercase-hyphen; id≤80, slug≤120 |
| name, description, category | String R | Trim, name≤120, description≤2000, category≤80 |
| durationMinutes.min/max | Number R | Khoảng hiển thị hiện có, nguyên 1–480, min≤max |
| bookingDurationMinutes | Number R khi mở booking | Chủ chọn cố định, nguyên 1–480, nằm trong khoảng hiển thị; không tự lấy trung bình/max |
| priceVnd | Number R | Nguyên 0–100000000 VND |
| coverImageId | ObjectId R sau chuyển ảnh | Reference images; URL DTO resolve từ ảnh cover |
| images | Array O | Link gallery kế thừa, nếu dùng 1–10 imageId khác nhau và cover thuộc mảng; không yêu cầu gallery UI trong MVP |
| images[].imageId / alt | ObjectId R / String O | Reference images; alt≤200 theo ngữ cảnh |
| isActive / displayOrder | Boolean R / Number R | Ẩn đặt mới; order≥0, tie-break id |

imageUrl chỉ là field legacy khi chuyển đổi và field DTO, không hai nguồn ghi URL độc lập. Không đổi lịch cũ khi sửa/ẩn danh mục. Runtime hiện chỉ có services cũ; không coi các constraint mới đã enforce.

## images

Giữ metadata baseline, file ở Cloudinary; không binary/base64/secret trong DB. MVP upload/thay ảnh phục vụ service, chưa quản trị kho/gallery/purge.

| Field | Kiểu / bắt buộc | Quy tắc |
| --- | --- | --- |
| cloudName, cloudinaryAssetId, publicId | String R | Unique cloudName+assetId và cloudName+publicId; không rename/overwrite asset |
| url | String R | HTTPS res.cloudinary.com đúng cloudName, resource image/upload; giữ URL legacy khi backfill |
| originalName, format | String R | Metadata server kiểm; format jpg/png/webp là đặc tả kỹ thuật đề xuất |
| width, height, bytes | Number R | Metadata asset, dương; ngưỡng 20000px/10MiB giữ như technical proposal, cần task upload review |
| uploadedByAccountId | ObjectId O legacy | Upload mới lấy actor owner; không nhận từ client |
| isActive | Boolean R | Metadata archive kế thừa; link cũ vẫn resolve, không purge |

## accounts

| Field | Kiểu / bắt buộc | Quy tắc |
| --- | --- | --- |
| emailNormalized | String R | Unique, lower-case/trim; ≤254 |
| passwordHash | String O, select:false | Chỉ hash password KDF phù hợp, không plaintext; thiếu khi nhân viên chưa tự đặt mật khẩu; R nếu active |
| roles | Array<String> R | Chỉ customer, stylist, owner; 1–3 distinct. Owner có staff profile không cần account thứ hai/role stylist thứ hai |
| status | String R | pending_verification, pending_password, active, disabled |
| emailVerifiedAt | Date O | R nếu active/pending_password; OTP đúng mới ghi |
| authRevision | Number R, 0 | Tăng khi đổi password/email/status; dùng để vô hiệu phiên/proof cũ khi triển khai |

Khách signup có hash nhưng pending_verification. Chủ tạo nhân viên chưa có hash, pending_verification; OTP đúng → pending_password, tự đặt hash hợp lệ → active. Owner seed có kiểm soát, không public đăng ký owner. Không lưu mật khẩu chủ đặt sẵn cho nhân viên. Mất email chủ: xác minh thủ công, đổi email có audit vận hành, không cấp quyền từ phone.

## auth_challenges

Một document cố định mỗi (accountId,purpose), replace nội dung khi resend; không mảng OTP lịch sử. **Không TTL document này** để không mất cooldown/attempt guard; expiry ứng dụng độc lập.

| Field | Kiểu / bắt buộc | Quy tắc |
| --- | --- | --- |
| accountId | ObjectId R | Reference accounts |
| purpose | String R | activate_customer, activate_staff, reset_password |
| generation | Number R | ≥1; CAS generation khi verify/resend, mã cũ không hợp lệ |
| codeDigest | String R, private | HMAC/secret-backed digest của account+purpose+generation+code; không lưu OTP 6 số plaintext hoặc bare unsalted hash |
| issuedAt, expiresAt, resendAvailableAt | Date R | expiresAt=issuedAt+5 phút; resendAvailableAt=issuedAt+60 giây |
| failedAttempts | Number R | 0–5; atomic increment, đủ 5 mã vô hiệu; resend không bỏ qua cooldown |
| consumedAt, verifiedAt | Date O | Verify thành công tiêu thụ code một lần, đúng account/purpose/generation, trước expiry |
| grantDigest, grantExpiresAt, grantConsumedAt | String/Date O | Proof ngẫu nhiên hạn chế cho đặt/reset password sau OTP; không phải session đăng nhập. Hạn grant không vượt expiresAt; consume cùng transaction password |

Không cho resend/verify đồng thời tạo hai active generation; send email ngoài transaction sau cập nhật challenge thành công. Gửi email lỗi không tự active. Rate limit tổng theo account/IP cần task auth xác định thêm, không coi 60 giây là biện pháp đầy đủ chống spam. Không log OTP/grant/hash nhạy cảm.

## customers

| Field | Kiểu / bắt buộc | Quy tắc |
| --- | --- | --- |
| accountId | ObjectId O | Reference customer account, tối đa 1 profile/account; vãng lai thiếu |
| displayName | String R | ≤120; tên khách |
| phone | String O trên hồ sơ | Chuẩn hóa E.164, không unique; R trước mọi booking/đặt hộ |
| bookingRevision | Number R, 0 | Guard tăng thật khi tạo/đổi/giải phóng lịch của mã khách |

Tìm phone rồi chủ chọn đúng hồ sơ; chưa có tạo vãng lai bằng tên+phone. Không tự gộp/link account theo phone; hồ sơ mới tạo trùng cho cùng người vẫn là giới hạn nhận diện, không thể suy danh tính chỉ từ số điện thoại. Khách tự đặt phải map đúng customerId từ identity; không nhận customerId tùy ý.

## staff

| Field | Kiểu / bắt buộc | Quy tắc |
| --- | --- | --- |
| accountId | ObjectId R | Unique; account role stylist **hoặc owner**; một owner profile để nhận lịch |
| displayName | String R | ≤120 |
| isActive | Boolean R | Không nhận booking mới khi false; ngừng phải xử lý lịch chưa kết thúc |
| serviceIds | Array<String> R | 0–50 unique reference services.id; rỗng không nhận booking |
| bookingRevision | Number R, 0 | Guard stylist tăng thật trong mọi ghi ảnh hưởng availability |

Không dùng weeklyHours lặp tự động cho tuần chưa xếp. **Không thêm BR chặn bỏ serviceIds khi có lịch**; thay năng lực không tự sửa lịch cũ, booking/đổi mới kiểm năng lực hiện tại.

## staff_shifts

| Field | Kiểu / bắt buộc | Quy tắc |
| --- | --- | --- |
| staffId | ObjectId R | Reference staff, gồm owner profile |
| localDate | String R | YYYY-MM-DD đúng ngày của startAt, Asia/Ho_Chi_Minh |
| startAt, endAt | Date R | Ca theo ngày thực tế, phút nguyên, end>start, không qua ngày trừ biên phải 00:00 hôm sau |
| status | String R | active, cancelled; giữ ca đã hủy để đối chiếu, không tự xóa lịch sử |

Chủ tạo/xem/sửa/hủy ca mọi người, nhân viên chỉ xem ca mình. Chỉ active shift mở giờ, không chồng ca cùng người; không tự sinh ca lặp từ tuần cũ. Unique start không chống overlap: dùng guard staff và kiểm khoảng. Ca/nghỉ thay đổi có lịch hiệu lực vi phạm thì không lưu, trả danh sách. Completed/cancelled không bị đổi trạng thái gián tiếp.

## staff_time_off

Giữ nghỉ ngoại lệ do chủ quản lý từ baseline cũ, không yêu cầu nghỉ/duyệt nghỉ nhân viên. staffId ObjectId R; startAt/endAt Date R, phút nguyên, end>start; reason String O≤200 nội bộ. Mọi sửa/nghỉ dùng guard staff, kiểm lịch hiệu lực trước lưu. Không tạo hàng loạt/notify tự động; không cần module workflow nghỉ trong MVP.

## appointments

| Field | Kiểu / bắt buộc | Quy tắc |
| --- | --- | --- |
| customerId, staffId, createdByAccountId | ObjectId R | Reference hồ sơ khách/stylist/actor, không FK tự enforce |
| bookingMode | String R | customer, owner_scheduled, owner_walkin; quyền server quyết định, không cho khách tự gắn walkin |
| customerSnapshot | Object R | displayName + phone String R; luôn đủ trước tạo lịch |
| staffNameSnapshot | String R | Tên tại lần phân công |
| items | Array<Object> R | 1–5 distinct serviceId String; nhúng name/priceVnd/durationMinutes lúc đặt |
| totalPriceVnd, totalDurationMinutes | Number R | Tổng server từ items; tối đa 5×giới hạn từng item, không cap cả lịch 480 phút mới; ca thực tế quyết định nhận được hay không |
| bufferAfterMinutes | Number R | 10 sau cả lịch, không cộng vào duration dịch vụ |
| startAt, endAt | Date R | Giờ hẹn; end=start+totalDuration; giữ khi cập nhật actual/ETA |
| occupiedFrom, occupiedUntil | Date R | Derived khoảng vận hành; xem BR-02/09. Không dùng endAt lịch hẹn làm actual |
| timeZone, localDate | String R | Asia/Ho_Chi_Minh và ngày giờ hẹn; giữ DTO ngày nhất quán |
| status | String R | confirmed/in_progress/completed/cancelled/no_show |
| revision | Number R, 0 | CAS expectedRevision, tăng mỗi thay đổi |
| confirmedAt | Date R | Server commit lần tạo; không đổi khi reschedule |
| startedAt, completedAt | Date O | Actual server; startedAt có thể trước startAt nếu đủ điều kiện; completedAt≥startedAt |
| estimatedEndAt | Date O | Chỉ in_progress; giờ dự kiến kết thúc mới khi kéo dài, ≥now và >endAt khi cập nhật |
| cancelledAt, noShowAt | Date O | Chỉ trạng thái tương ứng; noShowAt≥startAt+15 phút |
| contactAttemptedAt | Date O | R khi no_show: chủ ghi nhận đã liên hệ, ≤noShowAt; không tự đánh dấu đủ thời gian là đã liên hệ |
| lastRescheduledAt | Date O | Lần đổi gần nhất; audit lưu thay đổi trước |
| lastCommand | Object O/R | R khi revision>0: key, actorId ObjectId, hash, resultRevision=revision; receipt lệnh gần nhất, không lịch sử đầy đủ |

Timestamp không liên quan phải thiếu. Sửa nhầm xóa mốc không còn đúng khỏi current document nhưng giữ before/after trong event, không mất dấu vết. cancelled/no_show có thể giữ khoảng đã hẹn để lịch sử, nhưng không chặn booking mới.

## booking_requests

Receipt **tạo** lịch tách khỏi appointment để xóa sau 24 giờ mà không xóa lịch. Một document mỗi actorId+key, unique dù key expired chưa được TTL dọn.

| Field | Kiểu / bắt buộc | Quy tắc |
| --- | --- | --- |
| actorId, appointmentId | ObjectId R | Reference accounts/appointments; retry vẫn kiểm quyền hiện tại |
| key, requestHash | String R | Key ngẫu nhiên 16–100, hash canonical input; không hash giá client hoặc snapshot danh mục hiện tại |
| expiresAt | Date R | createdAt+24 giờ; không gia hạn theo retry |

Expired receipt còn vật lý được replace có điều kiện trong transaction hoặc cleanup/retry có CAS; không pre-delete rồi insert mù. Hết hạn cho xử lý như yêu cầu mới, vẫn chống trùng hồ sơ/stylist. Không dùng TTL trên appointments hoặc audit.

## appointment_events

Append-only event theo revision, không nhúng mảng tăng vô hạn; created là revision 0. Cùng transaction với appointment/guard, unique appointmentId+revision. Không sửa/xóa event để che bấm nhầm.

| Field | Kiểu / bắt buộc | Quy tắc |
| --- | --- | --- |
| appointmentId, actorId | ObjectId R | Reference appointment/account |
| revision | Number R | Revision sau thay đổi |
| kind | String R | created/rescheduled/started/completed/cancelled/no_show/eta_updated/corrected |
| occurredAt | Date R | Server, không backdate |
| before, after | Object R | Bounded allowlist status/startAt/endAt/occupiedFrom/occupiedUntil/startedAt/completedAt/estimatedEndAt/staffId; created.before={} |
| reason | String O/R | R cho corrected và chủ xử lý đổi/hủy sát giờ; ≤500, không OTP/token/password |

Chỉ owner corrected: in_progress→confirmed hoặc completed→in_progress, phải kiểm xung đột trước khi giữ lại giờ. Audit chuyển khoản/thu tiền không nằm đây. Mất email owner hỗ trợ thủ công phải có biên nhận vận hành riêng, không bịa appointment event.

## Cardinality, validation và tương thích

Account 0..1 customer và 0..1 staff; customer không account vẫn đặt hộ. Staff có nhiều shift/nghỉ, customer/staff có nhiều appointments. Appointment có 1–5 item và nhiều event; receipt có thể hết hạn không còn tồn tại. Không cascade xóa lịch/audit. Mongoose ref không enforce existence; service kiểm role/reference trong session. Không hard-delete parent đang được lịch/history tham chiếu.

HTTP từ chối type sai trước casting, lấy actor từ identity, tính derived, kiểm reference/quyền/ca/expiry. Model kiểm field/enum/bounds và whole-document; MongoDB JSON Schema+expr kiểm shape/derived sau backfill. Unique index bảo vệ identity/receipt, **không bảo vệ interval overlap**. Load+merge+validate rồi conditional write dưới guard; runValidators:true đơn lẻ không đủ. [MongoDB atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/) và [Mongoose validation](https://mongoosejs.com/docs/validation.html).
