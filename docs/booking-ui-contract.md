# SOL-032 / SOL-033 — Hợp đồng giao diện đặt lịch

Web `/booking`: customer và owner. Native `Booking`: chỉ customer, không có quản lý/đặt hộ.
Dùng session M1, danh mục M2 và [availability SOL-030](availability-api.md). Giao diện không tính lại slot,
giá/thời lượng từ khoảng min–max hoặc tự chọn stylist. Không có mock/fixture trong code chạy sản phẩm.

Web customer SOL-041: bấm trực tiếp thẻ dịch vụ trên homepage mở `/booking?serviceId=<id>`.
Trang đặt lịch chọn sẵn dịch vụ khi mã còn trong danh mục công khai; mã không tồn tại/đã ẩn được bỏ qua.
URL giữ lựa chọn khi tải lại hoặc đăng nhập tại trang; khách có thể bỏ chọn và chọn thêm dịch vụ như bình thường.
Đi thẳng `/booking` vẫn bắt đầu với lựa chọn trống. Không đổi hợp đồng API hoặc mobile.

## Endpoint đang có

- `GET /api/services`: DTO 8 field hiện có, danh sách công khai.
- `GET /api/auth/me`: profile active và customer (nếu đã có).
- `PATCH /api/auth/me`: `{displayName,phone}`; phone E.164, tên 1–120 ký tự. Dùng M1 để lưu contact.
- `GET /api/availability`: serviceIds phân cách dấu phẩy, localDate/mode, owner có thể truyền customerId đã chọn.
  Tổng giá/thời lượng/items và slot do server trả; UI không cộng thời gian/giá làm dữ liệu authoritative.

## API tạo lịch SOL-031

Hai endpoint sau được triển khai trong SOL-031 theo hợp đồng consumer Web/Mobile;
chi tiết transaction, receipt và lỗi tại [booking-api.md](booking-api.md):

`GET /api/customers?phone=<E.164>` chỉ owner → `{data:{items:[{id,displayName,phone}]}}`.
Owner phải chọn đúng mã hồ sơ khi trùng số; không tự link/gộp. Không có kết quả thì có thể nhập khách vãng lai.

`POST /api/appointments`, Bearer session, `Idempotency-Key`:

```json
{
  "serviceIds": ["service-cut-style"],
  "staffId": "555555555555555555555555",
  "startAt": "2026-10-22T03:30:00.000Z",
  "bookingMode": "customer"
}
```

Owner dùng `owner_scheduled` hoặc `owner_walkin`; bổ sung đúng một trong `customerId` hoặc
`guestCustomer:{displayName,phone}`. `owner_walkin` bỏ `startAt` khỏi request để server gán giờ khi ghi.
Customer không gửi customerId, contact hay tổng giá/thời lượng, server lấy identity/catalog/profile.
Success → `{data:{id,startAt,...}}`; nếu thiếu `id`, UI coi kết quả chưa xác định và giữ cùng key/intent.
Đối với retry, giữ cùng payload và key. SOL-031 phải enforce quyền, snapshot, chống trùng và receipt 24h trong DB transaction;
UI không thay được các bảo đảm này. API hiện ghi guard, snapshot, receipt và event trong cùng transaction.

## Trạng thái và lifecycle

- Tải/rỗng/lỗi/thử lại cho catalog, profile và giờ trống; stale/aborted read không cập nhật màn hình.
- Đổi dịch vụ/ngày/khách/chế độ vô hiệu lựa chọn stylist/giờ cũ; đổi stylist vô hiệu giờ cũ.
- Khách thiếu contact bổ sung qua M1 trước xác nhận. Stylist-only không có form đặt lịch.
- Một yêu cầu đang gửi chia sẻ cùng Promise/key cho double click. Mất mạng/timeout/5xx/response lỗi định dạng:
  khóa chỉnh lựa chọn, cho retry cùng intent/key. Chỉ HTTP 2xx có mã lịch mới báo thành công.
- HTTP 409 loại lựa chọn cũ và tải lại availability; không giữ giờ bị tranh như một lần xác nhận hợp lệ.
- Key được giữ trong bộ nhớ của lần mở màn hình, chưa có receipt recovery sau force reload/app kill.
  Người dùng được nhắc giữ trang trong khi kết quả chưa xác định. Không hứa chống trùng xuyên khởi động lại app.
- Request đọc/profile/save được cleanup khi unmount; đổi session remount draft và bỏ dữ liệu khách trước.

## Phạm vi nghiệm thu

UI có thể bàn giao và kiểm thử độc lập bằng fixture ngoài repository theo kế hoạch song song trên Sheet.
Việc merge UI không chứng minh đã tạo lịch thật. SOL-021/SOL-031 cung cấp dữ liệu/API còn thiếu;
SOL-034 nghiệm thu Web + Android với DB thật, tranh lịch và receipt. Giữ giới hạn này trong PR và Sheet.

## Dùng chung và native SOL-033

- `shared/booking.js` chứa quy tắc payload/contact, định dạng ngày/giờ tiệm và manager retry thuần JS.
  Web/Mobile import trực tiếp cùng module; không shared UI/barrel/package workspace mới.
- Mỗi app có HTTP feature adapter, hook request/latest/abort và hook submission riêng, dùng `src/lib` của app.
- Web cung cấp `crypto.randomUUID`; Mobile cung cấp `randomUUID` của `expo-crypto` phiên bản do Expo SDK 57 chọn.
  [Expo Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/) hỗ trợ native UUID; không lấy device ID, timestamp hoặc Math.random làm key.
- Native chỉ có luồng customer: Home/banner/bottom nav → Booking; Login giữ returnTo=Booking;
  thiếu tên/phone bổ sung qua M1 trong màn hình. Không có tìm khách/đặt hộ/quản lý chủ trên mobile.
- Layout StyleSheet, safe area từ provider hiện có, ScrollView/keyboard avoiding, nút tối thiểu 44dp,
  danh sách dịch vụ về một cột khi chữ lớn hoặc màn hẹp. Pending submit/unknown receipt giữ màn hình
  bằng usePreventRemove; retry cùng key. Không hứa khôi phục receipt sau app kill.
