# Schema baseline v1 — PROPOSED

Đây là nguồn chuẩn về field. [Quy tắc ghi](business-rules.md), [query/index](queries-and-indexes.md), [mẫu giả](examples/README.md) phải khớp với tài liệu này.

## Quy ước chung

- `R`: bắt buộc, không null. `O`: được thiếu, **không lưu null**. Default chỉ áp dụng khi tạo; không dùng default để che dữ liệu cũ sai.
- Mọi collection có `_id`: BSON ObjectId / Mongoose `Schema.Types.ObjectId`, R, server sinh, immutable; `createdAt`, `updatedAt`: BSON date / `Date`, R, server UTC, `createdAt <= updatedAt`, tương ứng `timestamps:true`.
- Number là JS `Number`, BSON có thể `int` hoặc `double` theo driver. Validator chấp nhận hai BSON type đó nhưng bắt số nguyên hữu hạn theo giới hạn cụ thể; không giả định Mongoose Number luôn tạo BSON int32. Extended JSON mẫu dùng số JSON nguyên (relaxed).
- String trim, không rỗng khi R; kích thước ghi dưới đây tính ký tự. Ngày local `YYYY-MM-DD` phải là ngày hợp lệ, không chỉ regex. Mọi subdocument nhúng dùng schema con `{_id:false}`, không tự thêm `_id`.
- `__v` hiện có trong Mongoose services: trường nội bộ tùy có, Number nguyên >=0, không dùng làm khóa nghiệp vụ/DTO. Đề xuất tắt versionKey cho collection mới; lịch hẹn có `revision` riêng với conditional write.
- DTO chỉ chọn field cho từng quyền. `_id` nếu xuất ở endpoint mới phải serialize thành chuỗi hex 24 ký tự; **services.id vẫn là String hiện có**. Biết ID không cấp quyền truy cập.
- Tài liệu không chứa validator/model thực thi. Quy tắc validation ở đây là đặc tả để triển khai sau duyệt.

## services

Danh mục đọc chung. `_id` nội bộ vẫn giữ; reference nghiệp vụ tới dịch vụ dùng **`services.id`**, không dùng slug hoặc tự đổi thành ObjectId.

| Field path | BSON / Mongoose | Required/default | Ràng buộc và lý do |
| --- | --- | --- | --- |
| `id` | string / String | R, không default | Unique, 1–80, `^[a-z0-9]+(?:-[a-z0-9]+)*$`; public id immutable, giữ nguyên dữ liệu hiện có |
| `slug` | string / String | R | Unique, 1–120, cùng mẫu chữ thường/gạch ngang; địa chỉ đọc được, không làm reference. V1 giữ immutable để tránh hỏng URL |
| `name` | string / String | R | 1–120; tên hiện tại |
| `description` | string / String | R | 1–2000; nội dung danh mục |
| `category` | string / String | R | 1–80; nhãn có kiểm soát tại service layer; chưa có collection riêng |
| `durationMinutes` | object / schema con | R | Nhúng khoảng thời lượng hiển thị |
| `durationMinutes.min` | int/double / Number | R | Nguyên 1–480; <= max |
| `durationMinutes.max` | int/double / Number | R | Nguyên 1–480 |
| `bookingDurationMinutes` | int/double / Number | R sau backfill, không default | Nguyên 5–480, bội 5, nằm trong min/max; chủ tiệm chọn cụ thể. Không tự lấy trung bình |
| `priceVnd` | int/double / Number | R | Nguyên 0–100000000 VND, không nhận chuỗi/âm/lẻ; không cần Decimal128 cho v1 |
| `coverImageId` | objectId / ObjectId | R sau backfill | Reference `images._id`; phải có trong `images[].imageId`; một ảnh đại diện/dịch vụ |
| `images` | array<object> / [schema con] | R sau backfill | 1–10 ảnh khác nhau; thứ tự array là thứ tự hiển thị, không thêm position thứ hai |
| `images[].imageId` | objectId / ObjectId | R | Reference `images._id`; cùng ảnh có thể dùng ở nhiều dịch vụ |
| `images[].alt` | string / String | O | 1–200; mô tả ảnh theo ngữ cảnh dịch vụ; khi thiếu, UI có thể dùng tên dịch vụ |
| `isActive` | bool / Boolean | R, true | Ẩn khỏi danh mục và từ chối booking mới khi false |
| `displayOrder` | int/double / Number | R, 0 | Nguyên 0–100000; thứ tự hiển thị, tie-break id |

Model hiện tại chỉ kiểm min/max >=1 độc lập, price >=0, regex URL và unique id/slug; chưa enforce nguyên, min<=max, độ dài hoặc thời lượng đặt lịch. Không coi các ràng buộc đề xuất là đang chạy.

`imageUrl` hiện là field lưu trong services và là một trong 8 field DTO. Schema đích dùng `coverImageId` + `images`; DTO vẫn trả `imageUrl = images.url` của ảnh đại diện, không xuất các ID/metadata mới. Trong giai đoạn chuyển đổi có thể giữ `services.imageUrl` như field legacy; phải bằng URL ảnh đại diện sau khi backfill và không là nguồn ghi độc lập. Chi tiết ở [kế hoạch chuyển đổi](migration-plan.md). `images` ở đây là mảng liên kết nhúng; collection `images` bên dưới lưu metadata ảnh riêng.

## images

Kho ảnh dùng chung: mỗi document mô tả một asset ảnh trên Cloudinary, có thể chưa được sử dụng hoặc được nhiều dịch vụ sử dụng. File ảnh ở Cloudinary; MongoDB không lưu binary/base64, API secret hay chữ ký upload. V1 chỉ quản lý ảnh công khai của tiệm/dịch vụ; không dùng kho này cho hồ sơ nhạy cảm hoặc ảnh riêng tư của khách.

| Field path | BSON / Mongoose | Required/default | Ràng buộc và ý nghĩa |
| --- | --- | --- | --- |
| `cloudName` | string / String | R | 1–100, `^[A-Za-z0-9_-]+$`; môi trường Cloudinary đã cấu hình, server xác nhận; không nhận cloud tùy ý từ client |
| `cloudinaryAssetId` | string / String | R | 1–128; ID asset do Cloudinary trả; immutable; unique cùng cloudName |
| `publicId` | string / String | R | 1–255; public ID từ upload/kiểm kê đã xác minh, không suy đoán từ URL; unique cùng cloudName trong v1 chỉ `image/upload` |
| `url` | string / String | R | 1–2048; HTTPS, host chính xác res.cloudinary.com, không userinfo; path bắt đầu `/<cloudName>/image/upload/`; lưu secure_url của asset |
| `originalName` | string / String | R | 1–255; tên file hiển thị/tìm kiếm, không đường dẫn máy hoặc thông tin riêng tư |
| `width` | int/double / Number | R | Nguyên 1–20000 pixel, từ metadata Cloudinary |
| `height` | int/double / Number | R | Nguyên 1–20000 pixel |
| `bytes` | int/double / Number | R | Nguyên 1–10485760 (10 MiB); giới hạn upload đề xuất của ứng dụng, không phải giới hạn gói Cloudinary |
| `format` | string / String | R | Enum jpg/png/webp; ảnh raster được phép trong v1; server kiểm nội dung/metadata, không chỉ phần mở rộng |
| `uploadedByAccountId` | objectId / ObjectId | O | Reference accounts._id; R cho upload mới có đăng nhập; thiếu chỉ khi import asset legacy chưa biết người upload, không bịa tài khoản |
| `isActive` | bool / Boolean | R, true | Có thể chọn/gắn mới; false nghĩa archive khỏi bộ chọn, vẫn giữ URL và mọi liên kết hiện có |

`_id`, createdAt, updatedAt theo quy ước chung. V1 không có gallery ngược `serviceIds` trong images: tra nơi dùng qua `services.images.imageId`; không lưu hai danh sách phải đồng bộ. Chưa thêm avatarImageId vào staff/customers hoặc collection banner vì chưa có yêu cầu các tính năng đó; sau này có thể tham chiếu cùng kho sau khi thiết kế quyền và truy vấn nơi dùng tương ứng.

Asset identity/URL/metadata kỹ thuật được giữ nguyên sau đăng ký; thay nội dung ảnh tạo asset/document mới rồi thay liên kết. Không rename/overwrite/delete trực tiếp trên Cloudinary ngoài quy trình được quản lý. Archive không xóa file, không làm URL mất hiệu lực và không yêu cầu ảnh đang tham chiếu phải active. Các quy tắc upload, liên kết, archive và lỗi hai hệ thống ở [B7](business-rules.md#images).

## accounts

Chỉ cần để gắn người đăng nhập với khách/nhân viên và quyền. Đây là mô hình dữ liệu đề xuất, không phải triển khai auth.

| Field path | BSON / Mongoose | Required/default | Ràng buộc và tính nhạy cảm |
| --- | --- | --- | --- |
| `emailNormalized` | string / String | R | <=254, trim/lowercase, cú pháp email hợp lệ; unique; riêng tư, không public |
| `passwordHash` | string / String (`select:false`) | R | 20–255; chỉ hash từ thuật toán mật khẩu được chọn khi triển khai auth; không plaintext; không log/DTO. Mẫu là placeholder không đăng nhập được |
| `roles` | array<string> / [String] | R, không default | 1–4 phần tử khác nhau: `customer`, `stylist `, `receptionist`, `owner`. Phần tử String enum, không null |
| `isActive` | bool / Boolean | R, true | Khóa đăng nhập; không xóa lịch sử |

Không tạo token/session/reset collection trước khi chốt auth. Public DTO tuyệt đối không serialize nguyên document dù có `select:false`.

## customers

Một hồ sơ dùng lại qua nhiều lịch; không nhúng danh sách lịch sử.

| Field path | BSON / Mongoose | Required/default | Ràng buộc và ý nghĩa |
| --- | --- | --- | --- |
| `accountId` | objectId / ObjectId | O, không default | Reference `accounts._id`; tối đa một customer/account; service layer xác nhận role customer. Khách vãng lai thiếu field |
| `displayName` | string / String | R | 1–120; dữ liệu cá nhân, chỉ chủ hồ sơ/nhân sự được phép xem |
| `phone` | string / String | O | E.164 `^\+[1-9][0-9]{7,14}$`, <=16; riêng tư; **không unique**, không chứng minh quyền sở hữu tài khoản |

Không tự gộp khách cùng số điện thoại. Vãng lai do lễ tân tạo; có thể thiếu phone nếu khách tới trực tiếp. Gắn tài khoản vào hồ sơ phải xác minh thủ công/quy trình auth sau duyệt, không dựa vào phone trùng.

## staff

Một document/stylist, không dùng cho lễ tân không thực hiện dịch vụ. Ca lặp lại và năng lực được đọc chung, số lượng có giới hạn.

| Field path | BSON / Mongoose | Required/default | Ràng buộc và ý nghĩa |
| --- | --- | --- | --- |
| `accountId` | objectId / ObjectId | O | Reference accounts._id; unique khi có; role stylist; chưa có tài khoản vẫn được lễ tân phân lịch |
| `displayName` | string / String | R | 1–120, tên hiển thị stylist |
| `isActive` | bool / Boolean | R, true | Có thể nhận lịch mới; khi tắt phải xử lý các lịch tương lai |
| `serviceIds` | array<string> / [String] | R, [] | 0–50 id khác nhau, từng id theo kiểu services.id; rỗng nghĩa chưa đủ điều kiện nhận booking |
| `weeklyHours` | array<object> / [schema con] | R, [] | 0–7 ngày khác nhau; thiếu ngày là nghỉ |
| `weeklyHours[].weekday` | int/double / Number | R | Nguyên ISO 1=thứ hai..7=chủ nhật |
| `weeklyHours[].intervals` | array<object> / [schema con] | R | 1–3 ca/ngày, đã sort, không overlap; không ca qua ngày |
| `weeklyHours[].intervals[].startMinute` | int/double / Number | R | Bội 5, 0–1435, phút từ 00:00 local |
| `weeklyHours[].intervals[].endMinute` | int/double / Number | R | Bội 5, 5–1440, >startMinute; 1440 chỉ làm biên phải |
| `bookingRevision` | int/double / Number | R, 0 | Nguyên 0..Number.MAX_SAFE_INTEGER; `$inc:1` thật trong mọi transaction ghi lịch/ca/nghỉ. Đến trần thì từ chối ghi và xử lý vận hành; không reset âm thầm |

`bookingRevision` là điểm tranh chấp MongoDB, không phải khóa trong RAM hoặc lease có hạn. Document cố định kích thước (max 50 serviceIds, 21 ca); không mảng lịch tăng mãi. Nhược điểm: cùng stylist khác ngày cũng tuần tự hóa; chấp nhận cho một tiệm, cần đo trước khi mở rộng.

## staff_time_off

Nghỉ ngoại lệ tách khỏi ca tuần và lịch hẹn. Không tạo lịch nghỉ lặp vô hạn trong mảng staff.

| Field path | BSON / Mongoose | Required/default | Ràng buộc và ý nghĩa |
| --- | --- | --- | --- |
| `staffId` | objectId / ObjectId | R | Reference staff._id, kiểm tra tồn tại bởi service layer |
| `startAt` | date / Date | R | UTC instant, giây/millisecond =0 |
| `endAt` | date / Date | R | >startAt; tối đa 31 ngày/lần nghỉ, cho phép nhiều ngày |
| `reason` | string / String (`select:false`) | O | <=200; nội bộ, chỉ nội dung tối thiểu, không ghi chẩn đoán sức khỏe |

Không có status/soft-delete: nghỉ tương lai có thể sửa/xóa dưới cùng khóa stylist; lịch đã qua giữ theo chính sách lưu trữ chờ duyệt. Một tiệm đóng cửa được biểu diễn bằng nghỉ của các stylist, thao tác cho tất cả phải khóa theo thứ tự và transaction; chưa có nghiệp vụ quản trị hàng loạt trong v1.

## appointments

Lịch hẹn là nguồn chuẩn cho khoảng đã giữ (`startAt`..`occupiedUntil`), không có collection slot hoặc staff-day sao chép cùng dữ liệu. Một lịch 1 stylist, 1 customer, 1–3 dịch vụ nối tiếp, không trùng dịch vụ.

| Field path | BSON / Mongoose | Required/default | Ràng buộc/nguồn |
| --- | --- | --- | --- |
| `customerId` | objectId / ObjectId | R | Reference customers._id |
| `staffId` | objectId / ObjectId | R | Reference staff._id |
| `createdByAccountId` | objectId / ObjectId | R | Reference accounts._id; người đặt có quyền; immutable |
| `requestKey` | string / String | R | 16–100, UUID hoặc chuỗi ngẫu nhiên; idempotency tạo, không public; immutable |
| `requestHash` | string / String | R | SHA-256 hex 64; server tính từ payload chuẩn hóa được mô tả ở business-rules; không hash giá do client gửi; immutable |
| `customerSnapshot` | object / schema con | R | Snapshot thông tin liên hệ riêng tư lúc đặt |
| `customerSnapshot.displayName` | string / String | R | 1–120 |
| `customerSnapshot.phone` | string / String | O | Cùng quy tắc phone của customer |
| `staffNameSnapshot` | string / String | R | 1–120, tên hiển thị tại lần phân công |
| `items` | array<object> / [schema con] | R | 1–3, thứ tự array là thứ tự thực hiện |
| `items[].serviceId` | string / String | R | Reference services.id, khác nhau trong array |
| `items[].name` | string / String | R | 1–120; snapshot tên |
| `items[].priceVnd` | int/double / Number | R | Nguyên 0–100000000; snapshot giá |
| `items[].durationMinutes` | int/double / Number | R | Nguyên 5–480, bội 5; snapshot bookingDurationMinutes |
| `totalPriceVnd` | int/double / Number | R | Derived server: tổng items.priceVnd, 0–300000000 nguyên |
| `totalDurationMinutes` | int/double / Number | R | Derived: tổng items.durationMinutes, <=480 |
| `bufferAfterMinutes` | int/double / Number | R, server 10 | Snapshot chính sách v1=10 phút cuối cả lịch; không buffer giữa dịch vụ |
| `startAt` | date / Date | R | UTC instant, bội 5 phút, ngày local trong phạm vi đặt |
| `endAt` | date / Date | R | Derived: startAt + totalDurationMinutes |
| `occupiedUntil` | date / Date | R | Derived: endAt + bufferAfterMinutes; biên phải khoảng giữ |
| `timeZone` | string / String | R, Asia/Ho_Chi_Minh | Snapshot múi giờ của tiệm, enum một giá trị ở v1 |
| `localDate` | string / String | R | Derived từ startAt theo timeZone; phục vụ lịch theo ngày |
| `status` | string / String | R, confirmed | Enum confirmed/in_progress/completed/cancelled/no_show |
| `revision` | int/double / Number | R, 0 | Nguyên >=0, <=MAX_SAFE_INTEGER; tăng 1 mỗi lần sửa; expectedRevision chống ghi đè |
| `confirmedAt` | date / Date | R | Server tại tạo, <= startAt; giữ nguyên khi đổi lịch |
| `startedAt` | date / Date | O | Có khi in_progress/completed; startAt<=startedAt<endAt, cùng ngày local; timestamp thực tế server |
| `completedAt` | date / Date | O | Chỉ completed; >=startedAt; ghi nhận thực tế kể cả muộn |
| `cancelledAt` | date / Date | O | Chỉ cancelled; >=confirmedAt và <startAt |
| `noShowAt` | date / Date | O | Chỉ no_show; >=startAt+15 phút |
| `lastRescheduledAt` | date / Date | O | Lần đổi gần nhất; >=confirmedAt, <startAt mới; không phải toàn bộ lịch sử |
| `lastCommand` | object / schema con | Thiếu khi revision=0; R khi revision>0 | Biên nhận lệnh sửa gần nhất; không mảng vô hạn |
| `lastCommand.key` | string / String | R khi có parent | 16–100; key của actor gửi |
| `lastCommand.actorId` | objectId / ObjectId | R khi có parent | Reference accounts._id |
| `lastCommand.hash` | string / String | R khi có parent | SHA-256 payload gồm operation/appointmentId/expectedRevision/nội dung sửa |
| `lastCommand.resultRevision` | int/double / Number | R khi có parent | Bằng revision sau commit |

Các mốc timestamp không liên quan phải thiếu, không null. `updatedAt` >= mọi mốc sự kiện. Trạng thái hoàn tất vẫn giữ reservation tới occupiedUntil; dữ liệu thực tế đã làm là `[startedAt, completedAt)`. Thực tế có thể vượt khung đã giữ; ghi nhận đúng mốc và báo lễ tân xử lý lịch kế tiếp, không tự sửa snapshot/thời gian đã hẹn. Xem quy tắc bắt đầu và quá giờ ở business-rules; không hứa thiết kế tự ngăn được việc làm tóc thực tế kéo dài.

## Cardinality và kiểm tra reference

| Quan hệ | Cardinality/optional | Cách lưu và người kiểm tra |
| --- | --- | --- |
| accounts → customers | Account 0..1 customer; customer 0..1 account | customers.accountId O; service xác minh account/role, unique partial bảo vệ 1:1 |
| accounts → staff | Account 0..1 staff; staff 0..1 account | staff.accountId O; như trên; một account có thể có cả hai hồ sơ |
| staff ↔ services | M:N; staff 0..50 services | serviceIds nhúng reference String một chiều; service layer kiểm tồn tại, không lưu staffIds ngược |
| accounts → images | Account 0..N ảnh; ảnh 0..1 người upload | uploadedByAccountId O cho legacy, upload mới bắt buộc actor có quyền |
| services ↔ images | M:N; service 1..10 ảnh; ảnh 0..N dịch vụ | services.images nhúng imageId/alt; coverImageId đúng 1 và là thành viên gallery; không mảng ngược trên images |
| staff → staff_time_off | 1:N; mỗi nghỉ đúng 1 staff | Reference required, đọc cùng transaction; không cascade |
| customer/staff → appointments | Mỗi parent 0..N lịch; lịch đúng 1 mỗi loại | Reference required; không nhúng lịch sử parent |
| accounts → appointments | Account 0..N lịch tạo; lịch đúng 1 người tạo | createdByAccountId, kiểm quyền; lastCommand.actorId là 0..1 người thao tác gần nhất |
| appointments → items | 1..3 embedded; item đúng 1 service | Snapshot không đồng bộ ngược; reference dịch vụ String vẫn được giữ |
| staff → weeklyHours → intervals | 0..7 embedded ngày → 1..3 embedded ca/ngày | Cấu trúc con có giới hạn; validate whole document |

Mongoose `ref`/`populate` không enforce sự tồn tại. Service layer kiểm reference trong session; v1 không hard-delete services/staff/customers/accounts/images, kể cả chưa thấy reference (tránh race với booking/link vừa tạo). Reference sai trả lỗi nghiệp vụ, không tạo document mồ côi. Liên kết account/hồ sơ có unique index nhưng role vẫn do service layer kiểm tra. Image IDs phải unique trong từng gallery, cover phải thuộc gallery; multikey index không tự enforce các quy tắc này. Allowlist DTO phải có trước mọi field backfill mới.

## Trách nhiệm validation

| Lớp | Trách nhiệm |
| --- | --- |
| HTTP/service | Từ chối input sai type trước Mongoose casting; xác thực/quyền; reference; giờ làm; timezone; trạng thái; tính tiền/duration; khóa stylist + transaction |
| Mongoose | Required, enum, lengths, số nguyên/range, subdocument, validator nhiều field trên document hoàn chỉnh |
| MongoDB validator đề xuất | `$jsonSchema` required/types/enum/maxItems/uniqueItems; số nguyên dùng `multipleOf:1`, bội 5 dùng multipleOf:5. `$expr` cho min<=max, endAt>startAt và totals/derived; cùng schema cho insert/update, strict/error sau backfill |
| Unique index | id/slug/email/account link/request key; bắt E11000, không coi `unique:true` là validator |

Không chỉ thêm `runValidators:true`: update validators chỉ xét path/toán tử được hỗ trợ, `this` là query, không bảo vệ toàn bộ ràng buộc nhiều field. Đề xuất load+merge+validate toàn document, tính lại field derived, rồi conditional update `{_id,revision}` trong transaction. Guard `$inc bookingRevision` kiểm tra trần trong filter. Raw bulkWrite/update phải đi cùng quy tắc hoặc validator DB; task này không thay seed hiện hành. [Mongoose validation](https://mongoosejs.com/docs/validation.html), [MongoDB validation](https://www.mongodb.com/docs/manual/core/schema-validation/).
