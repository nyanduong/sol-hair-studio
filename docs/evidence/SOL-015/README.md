# SOL-015 — Home và giao diện mobile

Ngày kiểm tra: 13/10/2026. Nhánh `feat/SOL-015-mobile-ui-refinement`, từ main `6930384` (PR #14). Ảnh và kiểm tra trong tài liệu này thuộc thay đổi SOL-015 đi cùng commit chứa tài liệu.

## Bổ sung theo review Owner ngày 13/10/2026

Thanh dưới có đủ 5 mục và icon Feather; Home/Services điều hướng thật, Đặt lịch/Lịch hẹn/Tài khoản mở modal dùng chung. Chuông và hai CTA Đặt lịch ngay dùng cùng `FeatureUnavailableProvider`/`FeatureUnavailableModal` trong `apps/mobile/src/components`. Home ẩn toolbar tải lại/số lượng; vẫn giữ pull-to-refresh và error retry. Bổ sung duy nhất `@expo/vector-icons` qua Expo installer, lockfile root. Các mô tả hai mục/badge chưa khả dụng bên dưới là bằng chứng vòng đầu, đã được thay theo review này.

Kiểm tra lại trên LDPlayer: CTA hero, CTA banner, Lịch hẹn, Tài khoản và chuông mở modal đúng tên; Đã hiểu, nền ngoài và Android Back đóng modal, giữ nguyên màn phía sau. Health vẫn báo kết nối. Lint, 54 tests và build toàn repo chạy lại PASS. iOS native vẫn SKIPPED.

- [Home với 5 mục, chuông và CTA](android-home-five-items.png)
- [Modal dùng chung](android-feature-modal.png)
- [Banner có CTA Đặt lịch ngay](android-booking-banner.png)

## Kiểm tra tự động

- `npm run lint`: PASS toàn repo.
- `npm test`: PASS 54 test (API 12, mobile 28, web 14).
- `npm run build`: PASS API, web và export Android/iOS.
- Sau chỉnh màu/grid: lint mobile và export Android/iOS chạy lại PASS; test mobile 28/28 PASS.
- `git diff --check`: PASS.

Test mới kiểm tra giá miễn phí/VND, thời lượng cố định/khoảng và chuyển cột ở chiều rộng 320/393/768/1024 với font scale khác nhau. Test HTTP/API hiện có tiếp tục kiểm tra empty, 503/retry, timeout, abort và stale responses.

## Kiểm tra native thực tế

Windows, Expo Go SDK 57, LDPlayer đang mở sẵn của Owner. Không dùng Android Emulator riêng sau khi Owner yêu cầu tránh gây lag. Phiên bản Android/Expo Go binary cụ thể chưa đọc được qua ADB; không suy đoán từ tên LDPlayer. Đây là bản native chạy qua Metro, không phải APK release.

1. Home hiển thị logo, hero local, đúng 3 dịch vụ từ API thật và ảnh từ imageUrl. Không seed/sửa MongoDB.
2. Thanh điều hướng mở Services, đường cuối danh mục mở Health; Health báo API đã kết nối và database connected. Android Back trở về Services; Trang chủ quay về Home.
3. Cuộn Home tới dịch vụ thứ ba và banner đặt lịch: nội dung tới được, thanh dưới không che cuối danh sách. Banner ghi rõ đặt lịch trực tuyến chưa khả dụng.
4. Tăng cỡ chữ trong Settings Android từ nấc thứ hai lên mức tối đa: Home chuyển hero thành cột dọc, danh mục chuyển một cột; tên/mô tả/giá/thời lượng và bottom navigation không bị cắt. Đã khôi phục đúng nấc cỡ chữ ban đầu và trả về Expo Go.
5. Metro lúc đầu giữ lỗi resolve file mới; khởi động lại với `--clear` đã tải bundle thành công. Không thay cấu hình Expo hoặc API để xử lý.

## Ảnh

- [Home, cỡ chữ ban đầu](android-home.png)
- [Danh mục đủ 3 dịch vụ](android-services.png)
- [Cuối Home và banner](android-home-footer.png)
- [Home, chữ hệ thống lớn](android-home-large-text.png)
- [Danh mục một cột, chữ lớn](android-services-large-text.png)

Bánh răng nổi và khung LDPlayer thuộc công cụ chạy thử, không phải UI sản phẩm. Baseline danh mục cũ ở [SOL-013](../SOL-013/README.md); kết quả cũ không được tính là kiểm thử mới của SOL-015.

## Quyết định và giới hạn review

- Dùng logo master và hero poster đã có ở web; palette kem/copper, font serif native hỗ trợ tiếng Việt. Chưa thay app icon/splash vì chưa có bộ asset riêng được chốt.
- Chỉ hai mục điều hướng có màn thật: Trang chủ và Dịch vụ. CTA hero mở Services; banner đặt lịch thông báo chưa khả dụng. Không thêm booking/account/notification hoặc dependency.
- Giữ nguyên DTO, base URL resolver, hooks/API/HTTP/latest-request và database.
- iOS native: **SKIPPED**, Windows không có iOS Simulator/thiết bị iOS. Export không chứng minh UI native.
- Chưa kiểm tra trên điện thoại thật, TalkBack hoặc chiều rộng 320dp bằng native. Quy tắc 320dp được kiểm tra tự động.
- Empty/503/timeout/abort/stale được kiểm tra tự động; chưa tái tạo qua UI LDPlayer. Image fallback giữ xử lý onError hiện có, chưa ép lỗi ảnh bằng native trong lượt này.
- Chờ Owner review thị giác và merge; chưa coi task Hoàn thành.


## Điều chỉnh độ rõ ngày 14/10/2026

Theo phản hồi Owner: tăng weight tiêu đề serif lên 700, tăng cỡ/weight chữ phụ và nhãn điều hướng, giảm độ sáng màu chữ phụ. Logo giữ nguyên PNG master, hiển thị 52dp với tint copper và resizeMethod scale; không tuyên bố đã làm sạch asset nguồn. Không đổi độ phân giải/DPI hoặc font scale LDPlayer.

Đã quan sát Home trên Expo Go/LDPlayer: logo, tiêu đề, tagline, mô tả và giá rõ hơn ở cửa sổ hiện tại, không chồng chữ trong viewport đang kiểm tra. [Ảnh sau chỉnh](android-readability.png). Lint mobile, 28 test mobile PASS; Android/iOS export PASS. Chưa đối chiếu thiết bị thật/iOS; việc LDPlayer thu nhỏ vẫn có thể làm ảnh mềm. Đây là cải thiện hiển thị, không bảo đảm loại bỏ toàn bộ răng cưa của asset hoặc giả lập.
