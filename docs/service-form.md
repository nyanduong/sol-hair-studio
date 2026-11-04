# Tạo và nhân bản dịch vụ

Form admin gồm tên, danh mục chọn từ dropdown quản lý tập trung, giá, một thời lượng giữ chỗ, ảnh và mô tả tùy chọn. Trạng thái hiển thị cho khách nằm ngay trước nút lưu. Mã dịch vụ và thứ tự không xuất hiện trên form vì server tự sinh mã và tự xếp dịch vụ mới ở cuối.

Khoảng thời gian linh hoạt không còn xuất hiện trên giao diện quản trị. Khi sửa một dịch vụ cũ đang có khoảng thời gian, form thông báo trước và lần lưu tiếp theo sẽ quy về thời lượng cố định đang hiển thị. Snapshot của lịch đã đặt không bị thay đổi. API vẫn chấp nhận `durationMinutes.min/max` từ client cũ để giữ tương thích.

Nhân bản mở bản nháp trong form tạo mới: sao chép tên có hậu tố bản sao, danh mục, giá, thời lượng, mô tả, ảnh và trạng thái. Không sao chép mã, slug hoặc thứ tự; không ghi database trước khi bấm Lưu. Ảnh có thể thay; dùng lại URL ảnh không phát sinh upload Cloudinary mới. Nhân bản không gán stylist, không đổi lịch đã đặt.

## API dùng chung

`POST /api/services` vẫn chỉ dành cho owner. Các client đang gửi đầy đủ payload tiếp tục hoạt động. Bổ sung khả năng bỏ qua:

- `id`: server sinh từ tên không dấu kèm hậu tố ngẫu nhiên; khi id tự sinh và không truyền slug, slug bằng id. Unique index vẫn bảo vệ mã/slug; xung đột ghi trả 409.
- `displayOrder`: server lấy thứ tự lớn nhất hiện có cộng một (database rỗng bắt đầu từ 0). Hai yêu cầu đồng thời có thể cùng thứ tự; danh sách vẫn có tie-break `id` như trước.
- `durationMinutes`: dùng `{ min: bookingDurationMinutes, max: bookingDurationMinutes }`. Giá trị ngoài 1–480 hoặc thời lượng giữ chỗ ngoài khoảng vẫn bị từ chối.
- `description`: mặc định chuỗi rỗng, tối đa 2.000 ký tự. Response giữ trường description; model cho phép mô tả rỗng.

Mã dịch vụ cũ không thay đổi. Mobile không cần đổi request hoặc response reader. Không có endpoint nhân bản riêng; bản nháp gửi qua API tạo dịch vụ hiện có sau khi người dùng kiểm tra.

## Quản lý danh mục

Trang `/admin/service-categories` có tạo, đổi tên, ngừng dùng và mở lại danh mục; có liên kết trong sidebar và trong form dịch vụ. Không xóa cứng danh mục đang tham chiếu. Nút cập nhật dropdown tải các danh mục đang dùng qua route admin có xác thực, giữ nguyên phần form khác.

Collection `service_categories` gồm name, normalizedName (unique, chuẩn hóa NFC/chữ thường/khoảng trắng), isActive, revision và timestamps. Dịch vụ mới từ form lưu categoryId tham chiếu danh mục và category là tên tương thích DTO hiện có. Tạo/sửa dịch vụ theo categoryId khóa revision danh mục trong transaction cùng ghi dịch vụ; đổi tên danh mục và cập nhật tên trên dịch vụ liên quan cũng dùng transaction, không đổi snapshot lịch hẹn. Danh mục ngừng dùng không được chọn khi tạo/nhân bản; dịch vụ đang tham chiếu vẫn sửa được với danh mục đó.

API owner: `GET/POST /api/service-categories`, `PATCH /api/service-categories/:id` (name/isActive). POST/PATCH dịch vụ thêm categoryId tùy chọn; khi có ID, server lấy tên từ danh mục, không tin tên client gửi và từ chối ID thiếu/không hợp lệ/ngừng dùng. Payload legacy chỉ gửi category dạng chuỗi tiếp tục được hỗ trợ để không phá client cũ; form web mới chỉ gửi categoryId. Public DTO category vẫn là chuỗi, không đổi reader mobile.

Dữ liệu cũ có nút **Nhập danh mục từ dịch vụ cũ**: lệnh POST chủ động bổ sung các tên hiện có vào danh sách chung, không tự tạo dữ liệu khi GET trang và không bật lại danh mục đã ngừng dùng. Không tự chạy lệnh này trên database local của người dùng.

## Kiểm chứng

Test tích hợp dùng Express và MongoDB replica set tạm: tạo cùng tên có mã khác nhau, xếp cuối, mặc định thời lượng, mô tả trống; gửi form EJS tạo/sửa thật và kiểm tra trạng thái ngừng nhận lịch. Test Happy DOM chạy script từ EJS thật, kiểm tra nhân bản, reset bản nháp mới, giữ khoảng thời gian cũ và chuyển về thời lượng cố định. Không coi Happy DOM là nghiệm thu Chrome hoặc upload ảnh thật. Không thêm dữ liệu vào MongoDB local của người dùng.

Chờ đối chiếu sau audit website với [Sheet phân công](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit); chưa xác minh mã SOL phù hợp cho đợt refine này.
