# SOL-031 — Tạo lịch và receipt 24 giờ

Nguồn phân công: [SOL-031](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit?gid=0&range=A31:O31).
Web SOL-032 và Mobile SOL-033 gọi cùng endpoint, không đổi payload/HTTP helper.

## Hợp đồng

`POST /api/appointments`, Bearer session active, `Idempotency-Key` ngẫu nhiên 16–100 ký tự
ASCII chữ/số/gạch ngang/gạch dưới (UUID của cả hai client tương thích).

```json
{
  "serviceIds": ["cut", "spa"],
  "staffId": "555555555555555555555555",
  "startAt": "2026-10-21T03:30:00.000Z",
  "bookingMode": "customer"
}
```

- Customer chỉ đặt cho hồ sơ gắn với account hiện tại; cần tên và phone E.164 qua M1.
- Owner dùng `owner_scheduled` hoặc `owner_walkin`, chọn đúng một `customerId` hoặc
  `guestCustomer:{displayName,phone}`. Guest tạo hồ sơ mới không account, không tự gộp dù trùng số.
- Scheduled nhận UTC ISO chuẩn, kiểm grid/lead/horizon theo SOL-030. Walk-in không nhận `startAt`,
  dùng chính xác server-now; thời điểm và ObjectId sinh một lần cho các lần retry transaction nội bộ.
- Không nhận snapshot/giá/thời lượng/role từ client. Body/query ngoài allowlist bị từ chối.
- HTTP 201 chỉ sau commit, cả lần tạo và replay; `{status:"success",data:{id,startAt,endAt,customerId,
  staffId,items,totalPriceVnd,totalDurationMinutes,timeZone,localDate}}`. `Cache-Control: no-store`.
  Status/revision vận hành đọc qua API M5. Replay trả cùng mã lịch, không tạo lại lịch đã hủy;
  DTO lấy trạng thái thời gian/snapshot đang lưu của lịch đó, không hứa phát lại nguyên response nếu M5 đổi lịch.

`GET /api/customers?phone=<E.164>` chỉ owner active; khớp chính xác, không regex, không tự chọn/gộp.
Response `{status:"success",data:{items:[{id,displayName,phone}]}}`, sort theo `_id`.
Không lộ email/account/revision. Nếu quá 100 hồ sơ cùng số, trả 409 `CUSTOMER_LOOKUP_LIMIT`
để tránh trả danh sách bị cắt rồi chọn nhầm người.

## Transaction và chống trùng

1. Đọc lại account active/roles/authRevision và hồ sơ gắn account trong session.
2. Tra receipt `(actorId,key)`. Còn hạn và cùng canonical hash trả cùng lịch; khác intent trả 409.
   Quyền hiện tại vẫn được kiểm ở replay; không tính lại giá, lead-time hay availability cho replay.
3. Claim receipt mới hoặc conditional replace receipt đã hết hạn bằng `_id,expiresAt<=now`.
   Receipt, guest nếu có, lịch và event đều rollback khi bước sau lỗi.
4. Tăng thật `customers.bookingRevision`, rồi `staff.bookingRevision`, có kiểm trần safe integer.
   Đây là cùng guard mà M3 và M5 sử dụng. Transaction thua write conflict phải đọc lại lịch sau retry;
   không dùng TTL hoặc unique trên giờ bắt đầu để thay thế kiểm giao khoảng.
5. Đọc lại contact, catalog, staff active/skills/account, ca/nghỉ và appointment trong cùng session.
   Dùng chính phép tính SOL-030, không có thuật toán slot thứ hai. Các thao tác session chạy tuần tự.
6. Ghi một `appointments` confirmed/revision 0 với snapshot, `appointment_events` created/revision 0,
   receipt 24h và guard trong cùng transaction primary/snapshot/majority; chỉ trả sau commit.

Giữ thứ tự customer → staff cho mọi writer availability. Writer nghỉ/ca/đổi stylist mới phải theo
cùng protocol; sửa collection trực tiếp ngoài guard không được bảo vệ bởi thiết kế này.
Snapshot MongoDB đọc catalog/quyền tại transaction; không tuyên bố khóa mọi thay đổi catalog/account ngoài protocol.

Receipt hash canonical giữ thứ tự chọn service, ID chuẩn lowercase, guest contact chuẩn hóa; không chứa
giá hiện tại hoặc server-now của walk-in. Scope theo actor; cùng key của hai actor độc lập.
`expiresAt=createdAt+24h`, không gia hạn replay. Hết hạn xử lý như yêu cầu mới và vẫn kiểm trùng;
TTL chỉ dọn, không xóa lịch/event và không hứa at-most-once ngoài 24h.

Driver retry transient transaction/commit trong giới hạn 15 giây, commit timeout 5 giây.
Unique claim race được mở transaction mới tối đa ba lần để đọc receipt đã commit.
Unknown commit/timeout trả 503 `BOOKING_RESULT_UNKNOWN`: giữ cùng key/payload để tra lại bằng POST replay.
Không gửi email/Cloudinary hoặc tạo side effect ngoài DB trong transaction.

## Storage trước traffic

Khi có MONGODB_URI, server gọi `prepareBookingStorage` trước listen: tạo collection và các index
appointment/event hiện có, unique `booking_requests(actorId,key)` và TTL `expiresAt`.
Không sync/drop index; lỗi tạo index làm startup thất bại thay vì nhận booking thiếu bảo đảm.
DB user cần quyền tạo collection/index. Cần MongoDB replica set hỗ trợ transaction; standalone trả
503 `TRANSACTIONS_REQUIRED`. Không có URI vẫn giữ health/startup behavior cũ, auth/booking trả 503.

## Lỗi và ghép luồng

- 400: payload/key/mode/ID/contact/timestamp không hợp lệ.
- 401/403: session hoặc vai trò/quyền đặt hộ không hợp lệ, gồm replay.
- 409: `IDEMPOTENCY_CONFLICT`, `BOOKING_CONFLICT`, catalog thiếu/ẩn/chưa cấu hình,
  hồ sơ thiếu contact, guard thiếu hoặc vượt trần. Không có partial booking/guest/receipt.
- 503: DB/topology chưa sẵn sàng hoặc kết quả chưa xác định; client giữ intent/key khi chưa xác định.
- 500: lỗi DB/audit khác truyền tới middleware, không nuốt lỗi hoặc báo thành công.

Không thêm dependency/workspace. Model lịch và M5 read/cancel giữ nguyên tương thích;
availability chỉ thêm session optional cho writer. Dữ liệu thiếu thời lượng cố định vẫn bị từ chối,
không lấy min/max làm ngầm định và không sửa catalog thật (SOL-021).
Kiểm thử Web + API + replica set thật với dữ liệu tổng hợp tại [bằng chứng](evidence/SOL-031/README.md).
Android/iOS UI, thiết bị thật và Atlas/dữ liệu salon chưa nghiệm thu; tiếp tục ở SOL-034.
