# SOL-030 — Giờ trống và lọc stylist

API đọc dùng chung cho Web (SOL-032), Mobile (SOL-033) và API tạo lịch (SOL-031).
Nguồn: [hàng SOL-030 trên Sheet](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit?gid=0&range=A30:O30),
[BR-01–04](database/business-rules.md). Đây là kết quả tham khảo tại `generatedAt`, không giữ chỗ.

## Request

`GET /api/availability` với `Authorization: Bearer <session>` của customer hoặc owner active.
Trả `Cache-Control: no-store`. Stylist đơn thuần không có quyền đặt lịch.

| Query | Hợp đồng |
| --- | --- |
| `serviceIds` | Bắt buộc, 1–5 mã khác nhau phân cách bằng dấu phẩy; giữ thứ tự chọn. Mã lowercase/hyphen, tối đa 80 ký tự. |
| `localDate` | `YYYY-MM-DD` theo Asia/Ho_Chi_Minh, bắt buộc với scheduled. Walk-in mặc định hôm nay. |
| `staffId` | Tùy chọn ObjectId; lọc đúng một stylist do người dùng chọn, không tự gán. |
| `mode` | `scheduled` (mặc định) hoặc `owner_walkin` chỉ dành cho owner. |
| `customerId` | Chỉ owner, mã hồ sơ đã chọn để kiểm lịch khách. Không có thì chỉ kiểm lịch stylist; khách vãng lai chưa có hồ sơ được tạo ở SOL-031. Customer luôn lấy hồ sơ từ identity, không nhận mã từ client. |

Không nhận giá, thời lượng, giờ hiện tại, role hoặc `startAt` từ client. Ví dụ:

```http
GET /api/availability?serviceIds=cut,spa&localDate=2026-10-21
```

## Response và ví dụ đã kiểm bằng test

HTTP 200: `{status:"success",data:{generatedAt,timeZone,localDate,mode,items,totalPriceVnd,totalDurationMinutes,bufferAfterMinutes,stylists}}`.
`stylists` gồm `{staffId,displayName,slots:[{startAt,endAt,occupiedUntil}]}`. Mọi timestamp là UTC ISO;
chỉ `localDate` là ngày tại tiệm. Không trả account ID/email, booking revision, hồ sơ/lịch của người khác.

Fixture tổng hợp trong `availability.api.test.js`: server 10:00 ngày 21/10/2026 (UTC+7),
`cut` 30 phút/0đ + `spa` 30 phút/100.000đ, ca active 09:00–13:00, không lịch/nghỉ:

```json
{
  "generatedAt": "2026-10-21T03:00:00.000Z",
  "timeZone": "Asia/Ho_Chi_Minh",
  "localDate": "2026-10-21",
  "mode": "scheduled",
  "items": [
    { "serviceId": "cut", "name": "cut", "priceVnd": 0, "durationMinutes": 30 },
    { "serviceId": "spa", "name": "spa", "priceVnd": 100000, "durationMinutes": 30 }
  ],
  "totalPriceVnd": 100000,
  "totalDurationMinutes": 60,
  "bufferAfterMinutes": 10
}
```

Phần trên trích `data`, lược `stylists` vì ID do MongoDB sinh. Các slot của stylist đủ năng lực bắt đầu
10:30, 10:45, 11:00, 11:15, 11:30, 11:45 giờ tiệm. Slot đầu có `startAt=03:30Z`, `endAt=04:30Z`,
`occupiedUntil=04:40Z`; slot 12:00 bị loại vì dọn kết thúc 13:10, vượt ca.
Ca chưa xếp/đã hủy không mở booking; stylist hợp lệ vẫn được trả với `slots:[]` để UI hiển thị hết giờ.
Không có stylist đủ năng lực/active thì `stylists:[]`.

## Quy tắc tính

- Staff active, account active có role owner/stylist và `serviceIds` chứa đủ tất cả dịch vụ. Chủ kiêm stylist tuân cùng điều kiện.
- Đọc giá và `bookingDurationMinutes` cố định từ dịch vụ active, không dùng min/max làm thời lượng ngầm định.
  Mỗi thời lượng nguyên 1–480 và trong khoảng hiển thị. Tổng 1–5 dịch vụ có thể vượt 480 phút nếu ca đủ dài.
- Khách scheduled: trước ít nhất 30 phút, kể cả đúng mốc. Owner scheduled: không quá khứ, không áp lead-time của khách.
  Grid :00/:15/:30/:45; horizon tính bằng instant `now+168h` bao gồm đúng mốc, không chỉ so ngày.
- Walk-in dùng chính xác server-now, gồm giây/millisecond, chỉ trả tối đa một slot/stylist.
  SOL-031 phải lấy lại server-now khi ghi; timestamp này không phải vé giữ giờ.
- Dịch vụ + dọn 10 phút phải nằm trọn trong một ca active; không nối hai ca, không giao nghỉ.
- Khoảng nửa mở `[from,until)` cho phép lịch liền kề. Staff có dọn, customer chỉ có giờ phục vụ.
  Đối chiếu mã hồ sơ, không số điện thoại.
- Confirmed giữ giờ dự kiến; in_progress dùng actual sớm nhất và planned/ETA lớn nhất;
  completed giải phóng phần giờ dự kiến chưa dùng sau actual completion + dọn.
  Cancelled/no_show không chặn. In_progress đã tới/quá planned/ETA mà chưa xong thì chưa biết giờ rảnh:
  chặn từ occupiedFrom trở đi cho staff và khách, kể cả stored occupiedUntil đã ở quá khứ.

## Lỗi

`{status:"error",code,message}` theo quy ước API hiện có:

| HTTP | Code / trường hợp |
| --- | --- |
| 400 | `INVALID_QUERY`, `INVALID_SERVICE_IDS`, `INVALID_LOCAL_DATE`, `INVALID_STAFF_ID`, `INVALID_CUSTOMER_ID`, `INVALID_MODE`, `DATE_OUT_OF_RANGE` |
| 401/403 | Session không hợp lệ/không active hoặc thiếu quyền; customer không được giả walk-in/chọn hồ sơ khác |
| 404 | `CUSTOMER_NOT_FOUND` khi owner chọn hồ sơ không có |
| 409 | `SERVICE_UNAVAILABLE` khi mã dịch vụ không có/đã ẩn |
| 409 | `SERVICE_BOOKING_NOT_CONFIGURED` khi thiếu/sai giá hoặc thời lượng cố định |
| 503 | `DATABASE_UNAVAILABLE` qua middleware auth khi DB chưa kết nối |

## Tương thích, phụ thuộc và giới hạn

- Thêm field optional `services.bookingDurationMinutes` cho catalog cũ tiếp tục hoạt động.
  SOL-021 phải cung cấp UI/API cấu hình giá trị cố định do chủ chọn và dữ liệu hợp lệ;
  SOL-030 không backfill bằng cách chọn min/max, không sửa DB/Cloudinary thật.
- Chuyển public services projection sang allowlist để giữ đúng 8 field DTO cũ, tránh lộ field mới.
- Dùng cùng Staff/Shift/Appointment model và đọc collection `staff_time_off` theo baseline;
  không thêm model lịch, kho lịch hay dependency. API nghỉ chưa có writer trong task này.
- Đây là các lần đọc thông thường, có thể lỗi thời ngay sau response. SOL-031 phải ghi guard customer/staff
  và đọc lại catalog/quyền/năng lực/ca/nghỉ/lịch trong cùng transaction trước commit, cùng receipt 24h.
  Chưa tạo lịch/chống trùng ghi đồng thời/idempotency; chưa có UI booking hoặc kiểm thử tích hợp toàn MVP SOL-034.
- Test dùng MongoDB 8.0.17 replica set tạm, dữ liệu giả và HTTP Supertest. Không tuyên bố đã chạy browser,
  Android/iOS UI, thiết bị thật, Atlas hay dữ liệu production. Xem [bằng chứng](evidence/SOL-030/README.md).
