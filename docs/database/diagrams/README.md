# Sơ đồ DB baseline SOL-011

- [PNG](sol-db-baseline.png) cập nhật ngày **13/10/2026**, kích thước **5200 × 3454**, render từ [Mermaid](sol-db-baseline.mmd) bằng Mermaid CLI và Edge; đã mở kiểm tra. PNG hiện tại không phải bản xuất trực tiếp từ VisuaLeaf.
- [JSON do VisuaLeaf xuất](sol-db-baseline.visualeaf.json) được cập nhật trên Chrome, giữ **7 collection, 80 field chính, 11 đường reference và 1 chú giải**, cùng vị trí canvas. Chưa kiểm chứng nhập lại file này vào widget.
- [Schema đầy đủ](../schema.md) là nguồn mô tả field, validation và cardinality; cả hai sơ đồ đều lược các field để dễ đọc và có bố cục khác nhau.

## Cách đọc

- `accounts`, `customers`, `staff`, `services`, `images`, `staff_time_off`, `appointments` là **7 collection**. `service_images`, `items`, `weeklyHours` trong Mermaid là các nút mô tả **dữ liệu nhúng**, không phải collection mới; đường liền có nhãn `EMBEDDED`. VisuaLeaf hiển thị dữ liệu nhúng dưới collection cha.
- Đường nét đứt là reference do ứng dụng kiểm tra, **không phải foreign key do MongoDB enforce**. Ký hiệu chân quạ biểu thị nhiều; vòng tròn biểu thị tùy chọn. Liên kết account của hồ sơ là `0..1 : 0..1`. `skills` là quan hệ nhiều–nhiều giữa staff và services.
- `services.coverImageId → images._id` chọn một ảnh đại diện. `services.images[].imageId → images._id` cho phép dùng chung ảnh giữa nhiều dịch vụ. Gallery có 1–10 ID khác nhau, cover thuộc gallery, thứ tự array là thứ tự hiển thị. `alt` thuộc từng liên kết dịch vụ.
- `images` chỉ lưu metadata, file ở Cloudinary. Archive giữ file/URL và liên kết cũ; không cho chọn mới. V1 không hard-delete, rename hoặc overwrite asset. Người upload có thể vắng mặt với ảnh legacy.
- `items[].serviceId → services.id` là nhiều–một xét theo từng item; một appointment có 1–3 item. `services.id` là String, khác `_id` ObjectId.
- `optional`/dấu `?` nghĩa là có thể vắng mặt, **không có nghĩa được lưu null**. `lastCommand.actorId` nằm trong schema nhưng lược đường reference tới accounts để giảm giao cắt.
- DTO danh mục giữ chính xác 8 field; `imageUrl` được suy ra từ URL ảnh cover. Không còn là field lưu độc lập trong schema đích của services; xem [migration](../migration-plan.md).

## Cách dựng và xuất lần này

Ngày 13/10/2026, xóa các khối sample trên canvas mới của [VisuaLeaf Visual Schema](https://visualeaf.com/tools/visual-schema/widget/?data=sample), nhập metadata giả theo định dạng **Smart Query JSON** do UI công bố, chỉnh vị trí, cardinality, nhãn và chú giải trực tiếp trên web. Không chạy Smart Query/mongosh hay kết nối DB. **Save & Export → Export as JSON** tải được file; đối chiếu 7 collection/80 field/11 reference trước khi thay bản trong repo.

Sau lần tải JSON, công cụ điều khiển Chrome báo `Debugger unattached`, nên chưa xuất được PNG mới trực tiếp từ VisuaLeaf. Để ảnh tài liệu vẫn phản ánh kho images, render source Mermaid đã cập nhật bằng Mermaid CLI có sẵn trong cache, với Edge cục bộ; không cài dependency vào repo. Bằng chứng và giới hạn ở [review](../review.md).

## Giới hạn VisuaLeaf

Smart Query importer đổi nhãn UI sang Tables và ghi `connectionType: "SQL"` trong JSON gốc, dù field giữ kiểu `objectId`, `date`, `array<object>` và đường dẫn nhúng của MongoDB. Thuộc tính `nullable` của công cụ được dùng để hiện dấu `?` theo chú giải. Tên workspace mặc định vẫn là `Sample Schema`; tên database và chú giải bên trong là Sol Hair Studio. Giữ nguyên bản xuất của công cụ; JSON này là **bản xuất sơ đồ**, không phải DDL, validator hay cấu hình áp dụng lên DB.

Nút Save workspace yêu cầu ứng dụng VisuaLeaf. **Chưa kiểm chứng native round-trip**: chưa nhập lại JSON xuất ra vào canvas mới; không cam kết widget hỗ trợ khôi phục từ JSON. Mermaid là source văn bản có thể chỉnh sửa/render lại độc lập. Bản PNG VisuaLeaf 6 collection ngày 29/09 đã được thay, chỉ còn mô tả lịch sử trong review.
