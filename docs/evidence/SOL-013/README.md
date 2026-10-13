# SOL-013 — Danh mục dịch vụ mobile

Ngày kiểm tra: 13/10/2026. Phụ thuộc: SOL-010 (API danh mục), SOL-012 (host API mobile).

## Kiểm tra tự động

| Lệnh | Kết quả |
| --- | --- |
| `npm run lint` | Đạt cả API, mobile và web |
| `npm test` | 45 test đạt: API 12, mobile 25, web 8 |
| `npm run build` | Đạt kiểm tra cú pháp API, xuất bundle Android/iOS và build web |

Sáu test mới ở `apps/mobile/src/features/services/tests/services.api.test.js` kiểm tra DTO chung/host mobile, danh sách rỗng, lỗi 503 và thử lại, hủy request, timeout 8 giây và bỏ qua response cũ hoàn thành sau abort. Không thêm dependency.

## Kiểm tra native đã chạy

Môi trường: Windows, Node 24.15.0, npm 11.12.1; Android Emulator Pixel 4, Android 15/API 35, Expo Go 57.0.9. Ứng dụng chạy native qua Metro; đây không phải bản release/APK đã ký.

1. Mở app: danh mục lấy đúng 3 dịch vụ từ `GET /api/services` của API đang chạy. API health báo `ok`, database `connected`. Không seed hoặc sửa MongoDB trong task này.
2. Cuộn qua Cắt & tạo kiểu, Nhuộm thời trang và Hair spa phục hồi: ảnh Cloudinary, tên, nhóm, mô tả, giá VND và khoảng thời lượng hiển thị được.
3. Bấm **Tải lại**: có spinner/trạng thái tải và nút tải lại bị vô hiệu hóa; sau đó danh mục xuất hiện lại.
4. Bấm **Kiểm tra kết nối** cuối danh sách: màn hình health hiển thị đã kết nối/database connected. Nút Back của Android đưa về danh mục.
5. Tắt Wi-Fi và mobile data chỉ trên emulator, bấm **Tải lại**: hiện lỗi bằng tiếng Việt và nút **Thử lại**, không đưa thông tin lỗi Java/địa chỉ host lên danh mục.
6. Khôi phục Wi-Fi/mobile data rồi bấm **Thử lại**: danh mục 3 dịch vụ xuất hiện lại. Cấu hình mạng emulator đã được khôi phục.

Trong kiểm tra mất mạng, dùng ADB reverse cổng Metro để giữ kết nối dev server; API vẫn đi qua host tự nhận của SOL-012. Không đổi `.env` hoặc cấu hình API của repository. Thử tăng độ trễ bằng emulator console không tạo được timeout trên kết nối API hiện có; không tính thao tác đó là bằng chứng timeout native.

## Ảnh bằng chứng

- [Danh mục sau khi phục hồi kết nối](android-catalog.png).
- [Dịch vụ cuối và đường tới health](android-catalog-bottom.png).
- [Trạng thái tải](android-loading.png).
- [Trạng thái mất mạng](android-offline.png).

Biểu tượng bánh răng nổi thuộc Expo Go, không thuộc giao diện sản phẩm.

## Giới hạn

- Chưa chạy UI trên iOS hoặc thiết bị thật; xuất bundle không thay thế kiểm tra native.
- Danh sách rỗng, 503, timeout và kết quả cũ được kiểm tra tự động; chưa kiểm chứng các tình huống đó bằng UI native. Bộ duyệt tự động từ chối lệnh khởi chạy Expo với API URL giả phục vụ kiểm thử, chỉ trả `blocked by policy`; không sửa dữ liệu thật để tạo trạng thái rỗng.
- Chưa kiểm tra TalkBack, font hệ thống lớn hoặc tablet.
- Không triển khai đặt lịch, đăng nhập, quản trị, DB baseline, thay đổi API/DTO, model MongoDB hoặc tài nguyên Cloudinary.

Task bàn giao qua PR và giữ trạng thái `Chờ duyệt` cho đến khi được nghiệm thu/merge.
