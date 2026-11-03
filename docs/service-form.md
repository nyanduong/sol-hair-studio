# Tạo và nhân bản dịch vụ

Form admin mặc định gồm tên, danh mục (gợi ý danh mục hiện có hoặc nhập mới), giá, thời lượng giữ chỗ và ảnh. Trạng thái nhận lịch hiển thị trước khi lưu. Phần Nâng cao chứa khoảng thời gian linh hoạt, mô tả tùy chọn và thứ tự tùy chỉnh. Khi không bật khoảng thời gian, min/max đều bằng thời lượng giữ chỗ. Khi sửa dịch vụ cũ, khoảng thời gian linh hoạt hiện có được giữ nguyên dù phần Nâng cao đang đóng.

Nhân bản mở bản nháp trong form tạo mới: sao chép tên có hậu tố bản sao, danh mục, giá, thời lượng, mô tả, ảnh và trạng thái. Không sao chép mã, slug hoặc thứ tự; không ghi database trước khi bấm Lưu. Ảnh có thể thay; dùng lại URL ảnh không phát sinh upload Cloudinary mới. Nhân bản không gán stylist, không đổi lịch đã đặt.

## API dùng chung

`POST /api/services` vẫn chỉ dành cho owner. Các client đang gửi đầy đủ payload tiếp tục hoạt động. Bổ sung khả năng bỏ qua:

- `id`: server sinh từ tên không dấu kèm hậu tố ngẫu nhiên; khi id tự sinh và không truyền slug, slug bằng id. Unique index vẫn bảo vệ mã/slug; xung đột ghi trả 409.
- `displayOrder`: server lấy thứ tự lớn nhất hiện có cộng một (database rỗng bắt đầu từ 0). Hai yêu cầu đồng thời có thể cùng thứ tự; danh sách vẫn có tie-break `id` như trước.
- `durationMinutes`: dùng `{ min: bookingDurationMinutes, max: bookingDurationMinutes }`. Giá trị ngoài 1–480 hoặc thời lượng giữ chỗ ngoài khoảng vẫn bị từ chối.
- `description`: mặc định chuỗi rỗng, tối đa 2.000 ký tự. Response giữ trường description; model cho phép mô tả rỗng.

Mã dịch vụ cũ không thay đổi. Mobile không cần đổi request hoặc response reader. Không có endpoint nhân bản riêng; bản nháp gửi qua API tạo dịch vụ hiện có sau khi người dùng kiểm tra.

## Kiểm chứng

Test tích hợp dùng Express và MongoDB replica set tạm: tạo cùng tên có mã khác nhau, xếp cuối, mặc định thời lượng, mô tả trống; gửi form EJS tạo/sửa thật và kiểm tra trạng thái ngừng nhận lịch. Test Happy DOM chạy script từ EJS thật, kiểm tra nhân bản, reset bản nháp mới, giữ khoảng thời gian cũ và chuyển về thời lượng cố định. Không coi Happy DOM là nghiệm thu Chrome hoặc upload ảnh thật. Không thêm dữ liệu vào MongoDB local của người dùng.

Chờ đối chiếu sau audit website với [Sheet phân công](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit); chưa xác minh mã SOL phù hợp cho đợt refine này.
