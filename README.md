# Sol Hair Studio

Nền tảng dùng chung cho bài tập SDN302 và MMA301. Repository này chứa ba phần độc lập nhưng dùng chung API và dữ liệu:

| Phần | Công nghệ hiện tại | Vai trò trong nền ban đầu |
| --- | --- | --- |
| `apps/web` | React + Vite + JavaScript/JSX + Tailwind CSS | Trang chủ thích ứng, lấy danh mục dịch vụ từ API |
| `apps/mobile` | React Native + Expo + JavaScript/JSX | Danh mục dịch vụ native Android/iOS và màn hình kiểm tra kết nối API |
| `apps/api` | Node.js + Express + JavaScript | API dùng chung, MongoDB và ảnh dịch vụ trên Cloudinary |

Repository có trang chủ web, danh mục dịch vụ trên mobile và API dùng chung. MongoDB lưu dịch vụ; Cloudinary phân phối ảnh dịch vụ. API tài khoản/OTP/phân quyền được triển khai ở SOL-017; giao diện tài khoản thuộc SOL-018/SOL-019. Đặt lịch có UI Web/Mobile và API tạo lịch SOL-031; nghiệm thu native/dữ liệu thực tế tiếp tục ở SOL-034. Trang tổng quan chưa triển khai, thanh toán ngoài MVP. Đây chưa phải tuyên bố đáp ứng rubric. Phạm vi hai môn và các giả định đang được ghi tại [docs/course-scope.md](docs/course-scope.md).

## Runtime và cài đặt

- Node.js `24.15.0` (dòng Node 24 LTS; xem `.nvmrc`).
- npm `11.12.1` (được ghi trong `packageManager`).
- MongoDB lưu danh mục dịch vụ; API vẫn phục vụ health check khi chưa cấu hình database.
- Ảnh dịch vụ được phân phối trực tiếp từ Cloudinary qua trường `imageUrl`; ảnh nội dung trang chủ nằm trong `apps/web/public/images/`, video hero được phục vụ trực tiếp từ `apps/web/public/video/`.

Trên Windows PowerShell:

```powershell
nvm install 24.15.0
nvm use 24.15.0
npm ci
```

Nếu không dùng NVM for Windows, cài một bản Node 24 LTS tương thích với trường `engines` trong `package.json` rồi chạy `npm ci` ở thư mục gốc. Repository dùng một `package-lock.json` chung; không cài dependency riêng trong từng app. Chỉ dùng `npm install` khi chủ động thay đổi dependency và phải commit lockfile tương ứng.

## Cấu hình môi trường

Không commit file `.env` hoặc thông tin MongoDB thật. Các file mẫu có thể sao chép bằng PowerShell:

```powershell
Copy-Item apps\api\.env.example apps\api\.env
Copy-Item apps\web\.env.example apps\web\.env
Copy-Item apps\mobile\.env.example apps\mobile\.env
```

API vẫn khởi động và trả kết quả kiểm tra khi chưa có `MONGODB_URI`; trạng thái cơ sở dữ liệu khi đó là `not-configured`, còn `GET /api/services` trả `503`. Nếu dùng MongoDB cục bộ, URI khuyến nghị là `mongodb://127.0.0.1:27017/sol_hair_studio`. Nếu dùng MongoDB Atlas, đặt chuỗi kết nối trong `apps/api/.env`, không đưa tên đăng nhập hoặc mật khẩu vào Git.

Để nạp danh mục mẫu có URL Cloudinary vào MongoDB, điền `MONGODB_URI` và `CLOUDINARY_CLOUD_NAME` trong file `apps/api/.env` cục bộ rồi chạy:

```powershell
npm run seed:services --workspace @sol-hair/api
```

`CORS_ORIGIN` nhận `*` hoặc danh sách nguồn phân cách bằng dấu phẩy. Vite mặc định dùng `http://localhost:5173` và có thể chuyển sang `http://localhost:5174` nếu cổng 5173 đang bận; cấu hình mẫu cho phép cả hai.

## Chạy từng phần

Mở ba cửa sổ PowerShell tại thư mục gốc:

```powershell
npm run dev:api
npm run dev:web
npm run dev:mobile
```

- API mặc định: `http://localhost:4000`; endpoint kiểm tra `GET /api/health` và danh mục `GET /api/services` (cần MongoDB đã nạp dịch vụ).
- Web mặc định: `http://localhost:5173` và đọc `VITE_API_BASE_URL`.
- Ứng dụng di động đọc `EXPO_PUBLIC_API_BASE_URL`.

Trang `/quan-ly/nhan-su` hiện mặc định dùng phiên và HTTP giả lập, dữ liệu chỉ ở trong bộ nhớ; tải lại trang sẽ mất thay đổi và không tạo tài khoản thật. Giao diện đi qua `staff-client.js`, các hàm API SOL-025 và HTTP helper trước khi nhận phản hồi mẫu, bao gồm lỗi xung đột. Phiên mẫu không đăng nhập vào API thật; route chưa có phiên SOL-018 để cấp client thật và link xử lý từng lịch M5 chưa có. Cần ghép phiên SOL-018, kiểm thử API thật và kết nối M5 trước khi nghiệm thu.

Mobile mở Home với thương hiệu Sol, ảnh hero và dịch vụ từ `GET /api/services`. Thanh điều hướng chuyển giữa **Trang chủ** và **Dịch vụ**; danh mục tự xuống một cột khi màn hẹp hoặc chữ hệ thống lớn. Cả hai màn giữ trạng thái tải, rỗng, lỗi, thử lại và tải lại. Liên kết **Kiểm tra kết nối** cuối danh sách mở Health; nút quay lại trở về màn trước. Thanh dưới có thêm Đặt lịch, Lịch hẹn, Tài khoản; **Lịch hẹn** mở màn **Ca làm của tôi** cho stylist đã đăng nhập, đọc đúng hồ sơ và ca của phiên hiện tại. Với khách hàng, mục này vẫn thông báo tính năng đang phát triển. Chuông thông báo và hai CTA Đặt lịch ngay cũng dùng modal này trong `apps/mobile/src/components/`. Home ẩn toolbar tải lại để bám prototype, vẫn có kéo xuống tải lại và nút thử lại khi lỗi. Không cần đăng nhập để xem dịch vụ.

Trong bản mobile dev, để trống `EXPO_PUBLIC_API_BASE_URL` để tự lấy host từ Expo/Metro và gọi API ở cổng `4000` trên cùng máy. Cách này theo địa chỉ Expo khi đổi Wi-Fi, tránh giữ IP LAN cũ trong `.env`. Trên Android Emulator, Expo host loopback được đổi thành `10.0.2.2`; khi không có host Expo, Android dev cũng dùng địa chỉ này, iOS dùng `localhost`.

Giá trị `EXPO_PUBLIC_API_BASE_URL` không rỗng luôn được ưu tiên. Nếu `.env` hiện có IP cũ, xóa giá trị đó để bật tự nhận host, rồi reload app; nếu Expo vẫn giữ giá trị cũ, dừng và chạy lại `npm run start --workspace @sol-hair/mobile -- --clear`. Dùng URL cụ thể nếu API ở máy/cổng khác hoặc chạy Expo qua tunnel (tunnel Expo không chuyển tiếp cổng API). Bản release phải đặt URL API có thể truy cập được; tự nhận host chỉ áp dụng trong dev.

Địa chỉ API cho ứng dụng di động phụ thuộc môi trường, không dùng một giá trị cho mọi thiết bị:

| Nơi chạy ứng dụng di động | Ví dụ `EXPO_PUBLIC_API_BASE_URL` |
| --- | --- |
| iOS Simulator trên cùng máy Mac | `http://localhost:4000` |
| Android Emulator mặc định | `http://10.0.2.2:4000` |
| Điện thoại thật cùng Wi-Fi | `http://<IPv4-của-máy-chạy-API>:4000` |

Với điện thoại thật, cho phép Node.js qua Windows Firewall nếu được hỏi và bảo đảm hai thiết bị cùng mạng. Không dùng `localhost` trên điện thoại vì địa chỉ đó trỏ về chính điện thoại.

## Quy ước giao diện

- Giao diện web dùng lớp tiện ích của Tailwind CSS. `apps/web/src/index.css` chỉ nhập Tailwind; không tổ chức giao diện bằng các file CSS viết tay theo từng thành phần.
- React Native dùng `StyleSheet` native vì Tailwind CSS của web không áp dụng trực tiếp cho Android/iOS. Chỉ thêm NativeWind hoặc giải pháp tương tự sau khi nhóm ghi nhận quyết định trong Sheet.
- Thành phần giao diện dùng file `.jsx`; toàn repository không dùng file `.ts` hoặc `.tsx`.

## Quy tắc mở rộng kiến trúc

- API đặt cấu hình trong `src/config`, middleware HTTP chung trong `src/middlewares`, router gốc trong `src/routes` và mỗi miền nghiệp vụ dưới `src/modules/<ten-mien>`.
- Web đặt route và layout ở cấp ứng dụng; mỗi chức năng nằm dưới `src/features/<feature>` theo vai trò page, component, hook và API.
- Mobile đặt navigator ở `src/navigation`; mỗi chức năng nằm dưới `src/features/<feature>` theo vai trò screen, component, hook và API.
- HTTP helper và quản lý request mới nhất nằm trong `src/lib` riêng của từng app. Không dùng component web trong mobile hoặc ngược lại.
- Web và mobile dùng chung hợp đồng dữ liệu, không dùng chung component giao diện. Chỉ tạo package dùng chung khi có mã JavaScript thuần thực sự được cả hai phía dùng và có test bảo vệ hợp đồng đó.
- API base URL luôn đi qua biến môi trường; HTTP helper chịu timeout, hủy và dọn request; quản lý request mới nhất chịu việc bỏ qua kết quả cũ.

Đọc luồng và cây thư mục sau refactor tại [docs/kien-truc-va-luong-chay.md](docs/kien-truc-va-luong-chay.md).

Baseline thiết kế dữ liệu MVP: [DB baseline MVP — SOL-016](docs/database/README.md).

API tài khoản, OTP email, phiên và phân quyền SOL-017: [Hợp đồng và cấu hình auth](docs/auth-api.md). Cần MongoDB hỗ trợ transaction, AUTH_SECRET và SMTP; UI tài khoản thuộc SOL-018/SOL-019.

API lọc stylist và giờ trống SOL-030: [hợp đồng availability](docs/availability-api.md). Cần dịch vụ có thời lượng đặt lịch cố định do chủ cấu hình; kết quả đọc không giữ chỗ. [API tạo lịch SOL-031](docs/booking-api.md) ghi guard khách/stylist, snapshot, receipt 24 giờ và audit trong cùng transaction MongoDB replica set; server chuẩn bị collection/index trước khi nhận traffic.

Giao diện đặt lịch: Web `/booking` (SOL-032), Mobile `Booking` (SOL-033). [Hợp đồng và phụ thuộc API](docs/booking-ui-contract.md) mô tả payload được SOL-031 triển khai; Web đã kiểm tạo lịch qua API và replica set tạm với dữ liệu tổng hợp. Quy tắc payload/contact và retry intent/key thuần JavaScript nằm một nơi tại `shared/booking.js`, dùng thật bởi cả hai client; HTTP/lifecycle và UI vẫn riêng theo app. Không thêm workspace hoặc shared UI.

[Nghiệm thu SOL-034](docs/booking-acceptance.md) có harness DB tạm, proxy gây mất response sau commit và test socket thật với adapter Web/Mobile. [Ma trận bằng chứng](docs/evidence/SOL-034/README.md) ghi Web khách/chủ và DB đã kiểm; Android UI chưa chạy vì lệnh start Expo bị duyệt tự động từ chối, nên SOL-034 còn Bị chặn. Test adapter trong Node và export bundle không thay nghiệm thu native.

## Kiểm tra

```powershell
npm run lint
npm test
npm run build
```

Toàn bộ mã nguồn dùng JavaScript/JSX nên không có bước `typecheck`. ESLint, test và bước build chịu trách nhiệm kiểm tra tự động.

Lệnh `build` tạo gói triển khai web, kiểm tra cú pháp API và xuất gói JavaScript Android/iOS của Expo. Việc xuất gói không thay thế chạy ứng dụng trên trình giả lập hoặc thiết bị thật và không tạo APK/IPA đã ký.

Các lệnh riêng hữu ích:

```powershell
npm run test:api
npm run build:web
npm run bundle:mobile
```

## Cộng tác

[Sol Hair Studio — Kế hoạch & phân công](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit) là nguồn phân công chính. Mỗi công việc có mã cố định dạng `SOL-xxx`; nhóm thống nhất người làm và hạn trước khi điền vào Sheet.

Luồng làm việc chuẩn:

1. Chọn công việc trên Sheet và chuyển trạng thái sang `Đang làm` sau khi nhóm thống nhất.
2. Tạo nhánh riêng, ví dụ `feat/SOL-003-service-catalog` hoặc `fix/SOL-008-api-timeout`.
3. Triển khai, chạy kiểm tra liên quan và mở pull request có mã việc cùng liên kết Sheet.
4. Review, sửa phản hồi và chỉ merge khi check `Lint, test and build` thành công theo policy repository.
5. Sau khi nghiệm thu/merge, cập nhật trạng thái và bằng chứng trên Sheet.

GitHub Issues hiện có được giữ làm lịch sử hoặc nguồn tham chiếu. Không bắt buộc tạo issue, GitHub Project, Sprint hay milestone cho công việc mới và không push thẳng vào `main`. Quy tắc đầy đủ dành cho thành viên và trợ lý mã nguồn nằm trong [AGENTS.md](AGENTS.md).
