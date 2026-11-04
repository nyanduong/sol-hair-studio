# SOL-032 / SOL-033 — Hợp đồng giao diện đặt lịch

Web `/booking`: customer và owner. Native `Booking`: chỉ customer, không có quản lý/đặt hộ.
Dùng session M1, danh mục M2 và [availability SOL-030](availability-api.md). Giao diện không tính lại slot,
giá/thời lượng từ khoảng min–max. Chỉ khi khách chọn rõ “Không ưu tiên”, web gộp các giờ server trả về
và chọn một stylist có giờ đó, hiển thị tên trước khi xác nhận. Không có mock/fixture trong code chạy sản phẩm.

Web customer SOL-041: bấm trực tiếp thẻ dịch vụ trên homepage mở `/booking?serviceId=<id>`.
Trang đặt lịch chọn sẵn dịch vụ khi mã còn trong danh mục công khai; mã không tồn tại/đã ẩn được bỏ qua.
URL giữ lựa chọn khi tải lại hoặc đăng nhập tại trang; khách có thể bỏ chọn và chọn thêm dịch vụ như bình thường.
Đi thẳng `/booking` vẫn bắt đầu với lựa chọn trống. Không đổi hợp đồng API hoặc mobile.

## Endpoint đang có

Refine customer desktop: homepage, ba bước đặt lịch và receipt dùng chung SiteHeader/SiteFooter,
khung max-w-6xl, font Plus Jakarta Sans cho nội dung và Cormorant Garamond cho tiêu đề.
Giữ ExperienceSection, EditorialSection và banner cuối homepage. Thông tin liên hệ nằm ở bước 3;
khách thiếu hồ sơ vẫn được chọn dịch vụ/giờ. Khi xác nhận, web kiểm tra và PATCH contact trước,
sau đó POST booking với idempotency key. Nếu PATCH lỗi, không gửi booking và cho phép thử lại.
PATCH và POST không phải một transaction: contact có thể đã lưu dù slot sau đó bị người khác đặt.
Ghi chú tùy chọn tối đa 500 ký tự đi cùng booking, hiện trên receipt và chi tiết admin.
Lịch tháng chỉ bật ngày trong giới hạn 7 ngày; giờ khả dụng luôn lấy từ API.

Ảnh mới tạo bằng imagegen được lưu trong `docs/assets/customer-refine` và phục vụ qua Cloudinary.
Prompt set: hero salon Việt Nam tông kem, chủ thể bên phải và vùng trống bên trái; ảnh dịch vụ
cắt tóc layer, gội thư giãn tại bồn và tóc nhuộm nâu đỏ; tất cả ảnh editorial tự nhiên, không chữ/logo.
`apps/api/scripts/setup-customer-demo.js` chỉ chạy với MongoDB localhost: thêm 3 dịch vụ demo,
Minh Anh/Thu Hà và ca 09:00–12:00, 13:00–18:00 từ hôm nay đến 7 ngày tới. Không thay dữ liệu cũ.
Tài khoản stylist demo có mật khẩu ngẫu nhiên không được in/lưu vào source, chỉ phục vụ availability.

- `GET /api/services`: DTO 8 field hiện có, danh sách công khai.
- `GET /api/auth/me`: profile active và customer (nếu đã có).
- `PATCH /api/auth/me`: `{displayName,phone}`; phone gửi API vẫn là E.164, tên 1–120 ký tự. SOL-043: helper contactInput dùng chung chấp nhận số Việt Nam đầu 0 (di động 10 chữ số, cố định đầu 02 có 11 chữ số), chuẩn hóa sang +84; bỏ khoảng trắng/dấu chấm/gạch nối/ngoặc khi dán. Số +84 kiểm tra cùng độ dài; số quốc tế khác giữ kiểm tra E.164 hiện có. Web tìm khách dùng đúng số đã chuẩn hóa. Dùng M1 để lưu contact.
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
- Khách thiếu contact bổ sung qua M1 ngay bước chọn dịch vụ trước khi được chuyển sang chọn giờ. Stylist-only không có form đặt lịch.
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

## SOL-042 — Giao diện booking customer

Customer Web chia thành ba bước Dịch vụ → Stylist & thời gian → Xác nhận. Chuyển bước chỉ thay trạng thái trình bày; các hook, endpoint, payload và shared booking manager giữ nguyên. Quay lại giữ lựa chọn; đổi dịch vụ/ngày vẫn xóa stylist/slot theo luồng cũ. Sau lưu hồ sơ ở bước 1, UI giữ bước và lựa chọn dịch vụ, không buộc chọn giờ lần nữa. Conflict 409 đưa UI về bước chọn giờ để chọn lại slot. Khi có pending intent hoặc đã thành công, điều hướng bước và lựa chọn bị khóa.

Thẻ dùng ảnh, mô tả, giá và thời lượng danh mục; lỗi ảnh có fallback. Tóm tắt hiển thị tạm tính danh mục khi chưa có availability, ghi rõ là tham khảo. Khi availability thành công, tổng giá/thời lượng dùng nguyên giá trị API, không tính lại giờ trống ở client. Không ẩn bản ghi demo. Owner giữ form đặt hộ/tới ngay hiện tại, không chuyển sang wizard customer; không triển khai thêm admin React hoặc thay đổi EJS.

## SOL-043 — Cập nhật giờ trống qua Socket.IO

API gắn Socket.IO trên cùng HTTP server/port; handshake dùng token phiên qua auth.token và kiểm tra customer/owner bằng authenticate hiện có. Client dùng VITE_API_BASE_URL, không hardcode host. Tín hiệu availability:changed không có payload và không nhận sự kiện ghi từ client. Middleware phát tín hiệu sau response ghi thành công cho appointments/staff/services và admin appointments/services (giữ alias owner tương thích); bao gồm tạo, đổi/hủy, ca và thay đổi năng lực. Không gửi tên, số điện thoại, mã lịch hay token qua broadcast.

Booking Web mở kết nối khi có phiên và lựa chọn dịch vụ, gom tín hiệu trong 150ms rồi đọc lại GET availability. Giữ kết quả đang hiển thị khi refresh nền, latest-request bỏ kết quả cũ. Nếu slot đã chọn không còn hợp lệ, bỏ slot, báo rõ và trở về bước 2. Không tự chuyển lựa chọn khi đang gửi, pending retry hoặc đã thành công. Reconnect/focus đọc lại; kiểm tra định kỳ 60 giây khi kết nối và 15 giây khi mất socket để bù tín hiệu bỏ lỡ. Cleanup listener/timer/socket khi rời màn hình hoặc đổi phiên.

Socket chỉ làm mới UI; transaction/guard/idempotency và 409 vẫn là nguồn bảo đảm chống trùng. Adapter hiện tại chạy trong một API process; nhiều instance cần adapter đồng bộ trước khi triển khai scale-out. Sửa DB trực tiếp không phát tín hiệu, được phản ánh khi đọc lại. Mobile giữ HTTP hiện tại.

## SOL-043 — Refine danh mục đặt lịch theo mockup

Bước chọn dịch vụ có tìm tên/nhóm không phân biệt dấu hoặc hoa thường, lọc nhóm từ category thực của catalog và nhóm Khác cho dữ liệu thiếu category. Bộ lọc chỉ thay danh sách hiển thị; selected serviceIds không bị mất khi đổi nhóm/tìm kiếm. Chip đã chọn và nút bỏ chọn trong tóm tắt đều đi qua changeServices hiện có để giữ giới hạn 5 và vô hiệu giờ cũ.

Desktop giữ tóm tắt bên phải. Dưới breakpoint lg, customer có thanh tổng tiền/nút đi tiếp cố định đáy với safe area; tóm tắt thu gọn ở bước 1–2, mở từ Xem lựa chọn/Xem tóm tắt. Bước 3, lỗi hoặc kết quả thành công vẫn hiện đầy đủ. Cả hai vị trí CTA dùng chung action label, disabled và callback; giữ active/profile/slot gate và pending retry. Owner giữ form đầy đủ và không có thanh customer cố định. Không đổi endpoint, payload, socket, transaction, schema hay dữ liệu catalog.

## SOL-043 — Màn thành công riêng

Sau submission success, BookingSuccess thay toàn bộ form/wizard/summary chỉnh sửa; availability params bị tắt để receipt không phụ thuộc slot vừa biến mất sau khi đã được đặt. Tên khách/stylist, tên dịch vụ, giá, thời lượng, ngày/giờ và referenceCode lấy từ response lịch đã lưu; ảnh chỉ là minh họa từ catalog và có fallback. Focus chuyển đến heading, cuộn đầu trang. Có sao chép mã, link chi tiết lịch bảo vệ quyền và về homepage, CTA cố định safe area trên mobile. Giá trị dịch vụ được phân biệt với xác nhận thanh toán.

Refresh trang booking vẫn bắt đầu một draft mới như luồng hiện có; receipt không có đường dẫn công khai riêng. Khách xem lại lịch qua link chi tiết bảo vệ quyền. Lịch legacy thiếu mã không lộ ID dài dưới nhãn mã khách hàng; chạy backfill để cấp mã. Không đổi payload đặt lịch/transaction/idempotency hoặc tự gửi email.

## SOL-043 — Thông báo giới hạn đặt trước

Hướng dẫn cạnh ô ngày ghi rõ đặt trước tối đa 7 ngày tính từ giờ hiện tại. Lỗi DATE_OUT_OF_RANGE của API phân biệt đặt lịch thường (từ hôm nay, tối đa 168 giờ kể từ hiện tại) và khách tới ngay (chỉ hôm nay). Chỉ thay lời hướng dẫn/thông báo, không đổi quy tắc tính slot hoặc cửa sổ đặt lịch; các client tiếp tục nhận cùng code lỗi.

## SOL-043 — Bổ sung an toàn điều hướng và hướng dẫn customer

- App dùng createBrowserRouter/RouterProvider với root wildcard giữ AppRoutes/AuthProvider hiện có để hỗ trợ useBlocker chính thức. Khi manager còn pending intent, chặn Link/navigate/Back/Forward nội bộ, giữ payload/key/request và hiển thị lý do. Không tự chuyển trang sau khi có kết quả; khách có thể điều hướng lại khi thành công hoặc lỗi xác định. Beforeunload vẫn cảnh báo reload/đóng tab. Chưa có khôi phục intent sau force reload hoặc đổi phiên đăng nhập.
- Contact thiếu nằm ở bước 1, chặn chuyển bước đến khi lưu xong. Không reset slot/chuyển bước khi lưu; luồng owner không đổi.
- Picker ngày có min/max theo ngày Việt Nam hôm nay đến ngày thứ 7; handler từ chối ngày sai/quá giới hạn trước khi gọi availability. Ngày cuối vẫn chỉ có các slot nằm trong 168 giờ do API lọc.
- Empty slot gợi ý đổi ngày, stylist hoặc giảm dịch vụ, nhắc các giờ trùng lịch của chính khách bị loại; không suy đoán nguyên nhân cụ thể của từng slot hoặc lộ lịch người khác.
- Lịch của tôi có nhóm Đến/quá giờ cho confirmed có startAt <= now. Upcoming giữ confirmed tương lai và in_progress; History giữ completed/cancelled/no_show. Chỉ nhóm hiển thị thay đổi, không cập nhật DB/status. Đồng hồ cập nhật đúng mốc bắt đầu, định kỳ và khi focus; số lượng/rỗng vẫn chỉ kết luận sau trang cuối. Nhóm Đến/quá giờ giữ link chi tiết, khóa đổi/hủy theo cutoff hiện có và cho liên hệ tiệm.
- happy-dom chỉ là dev dependency cho test React DOM/router thực; không đưa vào bundle sản phẩm.
