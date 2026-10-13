# Bộ mẫu GIẢ

Mỗi file collection là một JSON array; tất cả tên, email, số điện thoại, ObjectId, request key/hash và ngày hẹn đều là dữ liệu minh họa. **Không phải seed production**, không dùng để đăng nhập hoặc tải lên DB. URL Cloudinary là địa chỉ giả không được kiểm tra/tải ảnh.

MongoDB Extended JSON relaxed: ObjectId viết `{"$oid":"24-hex"}`, Date viết `{"$date":"ISO-8601-UTC"}`; số nguyên dùng JSON number. Không dùng `ObjectId(...)`, `ISODate(...)`, comment hoặc null thay cho field optional. Hash/password mẫu chỉ minh họa kiểu/quan hệ; password placeholder không phải mật khẩu hoặc hash đăng nhập thật.

| File | Mẫu |
| --- | --- |
| [services.json](services.json) | 3 dịch vụ, giữ public id; thời lượng 60/120/75; cover/gallery tham chiếu kho, không lưu imageUrl trong schema đích |
| [images.json](images.json) | 5 asset giả: 3 cover, 1 ảnh dùng chung ở hai gallery, 1 ảnh archived chưa dùng; một cover legacy thiếu người upload |
| [accounts.json](accounts.json) | Khách, stylist và lễ tân/chủ tiệm giả |
| [customers.json](customers.json) | Một khách gắn account và hai khách vãng lai không account |
| [staff.json](staff.json) | 2 stylist có ca thứ hai/chủ nhật, staff thứ hai không account |
| [staff_time_off.json](staff_time_off.json) | Stylist An nghỉ 12:00–13:00 ngày 05/10 local |
| [appointments.json](appointments.json) | Lịch đơn/liền kề/nhiều dịch vụ, cùng giờ khác stylist, cancelled/completed/no_show |
| [services-response.json](services-response.json) | DTO GET services chính xác 8 field; **không phải collection** |

Nghiệm thu một lượt: theo customer `_id` kết thúc `201` → staff kết thúc `301` → service-cut-style trong appointment kết thúc `501`. Ngày05/10/2026 lúc 09:00 local =02:00Z; cắt 60 phút,450000đ; hết dịch vụ 10:00, hết buffer 10:10. Appointment `502` bắt đầu 10:10 nên liền kề hợp lệ. Appointment `503` dùng hai dịch vụ trên stylist `302` cùng 09:00, tổng 1050000đ,135 phút +10 buffer. Nghỉ trưa staff `301` không giao các lịch đó.

Appointment `504` đã cancelled ở cùng giờ với`501`, minh họa hủy rồi đặt lại bằng key mới. `505` completed và `506` no_show ở ngày 04/10. Bộ mẫu không chứa lịch chồng bị cấm; các đầu vào sai/timeline cạnh tranh nằm trong [checklist review](../review.md#scenarios), không được gọi là integration test.

Kho ảnh: services `service-cut-style` và `service-fashion-color` cùng dùng ảnh chi tiết có `_id` kết thúc `704`; các cover là `701`/`702`/`703`. Ảnh `703` archived nhưng vẫn là cover đã liên kết của hair spa, minh họa archive không phá DTO. Ảnh `705` archived và chưa dùng, vẫn tồn tại trong kho, không hard-delete. Alt chỉ có ở một số liên kết; thứ tự gallery là thứ tự hiển thị. Các giới hạn trên đây là đề xuất. Checker dựng imageUrl từ cover và so sánh toàn bộ DTO hiện có, không đọc URL/Cloudinary/DB. Tổng 7 collection, 23 document giả.

```powershell
node docs/database/checks/validate-examples.mjs
node docs/database/checks/validate-examples.mjs --self-test
```

Lệnh thứ hai làm hỏng bản sao **trong bộ nhớ** để kiểm script thực sự bắt lỗi; không ghi lại JSON. Script không import Mongoose/app, không đọc cấu hình môi trường, không kết nối DB. Kiểm liên kết tài liệu ở cùng script chỉ kiểm đường dẫn file/anchor tường minh; review bằng người đọc vẫn cần để xác nhận ý nghĩa.
