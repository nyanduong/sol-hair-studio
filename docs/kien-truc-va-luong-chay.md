# Kiến trúc và luồng chạy

Tài liệu này mô tả cấu trúc đang có trong repository. Phạm vi sản phẩm hiện tại gồm trang chủ web, Home và danh mục dịch vụ native trên mobile và API đọc từ MongoDB, dùng URL ảnh Cloudinary. Đặt lịch, đăng nhập, thanh toán và trang tổng quan chưa được triển khai.

## A. Nhìn tổng thể

### Luồng bổ sung SOL-030

`GET /api/availability` → middleware auth/quyền customer hoặc owner → availability controller →
service validate/tính khoảng trống → repository đọc services, staff/accounts, staff_shifts,
staff_time_off và appointments dùng chung → DTO stylist/slot allowlist.
Mã nằm tại `apps/api/src/modules/availability/{availability.routes,availability.controller,availability.service,availability.repository}.js`.
Không đổi đường dẫn cũ. Public services chuyển projection allowlist, giữ DTO cũ khi thêm bookingDurationMinutes.
Đặc tả/giới hạn và phần cần kiểm lại khi ghi ở [hợp đồng availability](availability-api.md).

### Giao diện đặt lịch SOL-032 / SOL-033

Web có `/booking`, Mobile có screen `Booking`; mỗi app giữ adapter/hook/UI riêng tại feature `booking`.
`shared/booking.js` là module JS thuần được cả hai client dùng thật cho payload/contact, giờ tiệm và
quản lý intent/key khi retry. Module này không chứa UI, HTTP, navigation, trạng thái auth hoặc module native;
Web/Expo truyền nguồn UUID riêng. Không thêm workspace thứ tư. `npm run lint` kiểm cả shared và ba app;
test quy tắc dùng chung nằm trong bộ test booking Web, adapter Mobile có test riêng.
Source Web cũ `apps/web/src/features/booking/booking.js` chuyển sang `shared/booking.js`, import được cập nhật.
Xem [hợp đồng UI và phụ thuộc](booking-ui-contract.md); POST tạo lịch vẫn cần SOL-031.

Repository là một monorepo npm workspaces gồm ba ứng dụng:

- `apps/api` là API Node.js/Express. API cung cấp `GET /api/health`, `GET /api/services` và kết nối MongoDB qua Mongoose nếu cấu hình `MONGODB_URI`.
- `apps/web` là ứng dụng React/Vite/Tailwind chạy trên trình duyệt, có trang chủ và lấy thẻ dịch vụ từ API.
- `apps/mobile` là ứng dụng React Native/Expo dùng cho Android và iOS.

Web và mobile gọi cùng hợp đồng API nhưng đọc base URL riêng từ biến môi trường. Mỗi app giữ HTTP helper và giao diện riêng để không kéo code DOM vào React Native hoặc code backend vào bundle client. Web hiện có hai luồng theo feature: trang chủ tải danh mục qua API; trang kiểm tra kết nối vẫn ở `/health`. Trong feature, page/screen ghép giao diện, hook giữ trạng thái và vòng đời, API của feature chọn endpoint. Các helper cấp app nằm ngoài feature.

Root giữ `package.json` và `package-lock.json` duy nhất để cài cả ba workspace.

## B. Cây thư mục

### API

```text
apps/api/
├── scripts/
│   ├── check-source.js              Quét đệ quy và kiểm tra cú pháp source API
│   ├── data/
│   │   └── services.js              Dữ liệu mẫu và public ID ảnh dùng cho seed
│   └── seed-services.js             Nạp/cập nhật dịch vụ và URL ảnh vào MongoDB
├── src/
│   ├── config/
│   │   ├── env.js                   Đọc, chuẩn hóa và kiểm tra biến môi trường
│   │   ├── cloudinary.js            Tạo URL phân phối ảnh đã lưu trên Cloudinary
│   │   ├── tests/
│   │   │   └── cloudinary.test.js    Kiểm tra URL phân phối ảnh
│   │   └── database.js              Kết nối, ngắt kết nối và đọc trạng thái MongoDB
│   ├── middlewares/
│   │   ├── error-handler.js         Chuẩn hóa lỗi 400/500 và chuyển tiếp khi headers đã gửi
│   │   ├── not-found.js             Trả JSON 404 cho route không tồn tại
│   │   └── tests/
│   │       └── middlewares.test.js  Kiểm tra phản hồi lỗi 400/404/500
│   ├── modules/
│   │   ├── health/
│   │   │   ├── health.routes.js     Khai báo GET /health dưới prefix /api
│   │   │   ├── health.controller.js Tạo phản hồi health và trạng thái database
│   │   │   └── tests/
│   │   │       └── health.test.js   Kiểm tra hợp đồng GET /api/health
│   │   └── services/
│   │       ├── services.routes.js   Khai báo GET /services dưới prefix /api
│   │       ├── services.controller.js Kiểm tra trạng thái DB và trả hợp đồng API
│   │       ├── services.model.js    Lược đồ dịch vụ MongoDB
│   │       ├── services.repository.js Truy vấn dịch vụ đang hoạt động
│   │       └── tests/
│   │           ├── services.api.test.js Kiểm tra hợp đồng endpoint
│   │           ├── services.model.test.js Kiểm tra lược đồ dịch vụ
│   │           └── services.repository.test.js Kiểm tra truy vấn dịch vụ
│   ├── routes/
│   │   └── index.js                 Gom router module dưới prefix /api
│   ├── app.js                       Tạo Express app và ghép middleware/router
│   └── server.js                    Kết nối database, mở cổng và dừng êm
├── .env.example
├── eslint.config.js
└── package.json
```

### Web

```text
apps/web/src/
├── config/env.js                    Đọc và chuẩn hóa VITE_API_BASE_URL
├── routes/AppRoutes.jsx             Ánh xạ / tới HomePage và /health tới HealthPage
├── layouts/MainLayout.jsx           Giữ nền, kiểu chữ và khung trang
├── features/home/
│   ├── pages/HomePage.jsx            Ghép các phần của trang chủ theo prototype
│   └── components/                   Header, phần dịch vụ, trải nghiệm, bài viết, footer
├── features/services/
│   ├── components/ServiceCard.jsx    Hiển thị một dịch vụ lấy từ API
│   ├── hooks/useServices.js          Tải, thử lại và cleanup request dịch vụ
│   ├── api/services.api.js           Gọi GET /api/services
│   └── tests/services.api.test.js    Kiểm tra endpoint do feature chọn
├── features/health/
│   ├── pages/HealthPage.jsx          Ghép nội dung màn hình và trạng thái health
│   ├── components/HealthStatusCard.jsx  Hiển thị trạng thái và nút thử lại
│   ├── hooks/useHealth.js            Tải lần đầu, giữ state, thử lại và cleanup
│   ├── api/health.api.js             Gọi endpoint health qua HTTP helper
│   └── tests/health.api.test.js      Kiểm tra endpoint do feature chọn
├── lib/
│   ├── http.js                       Gọi JSON, timeout, abort và cleanup
│   ├── latest-request.js             Hủy request cũ và bỏ qua kết quả cũ
│   └── tests/                        Test helper HTTP và request mới nhất
├── App.jsx                           Đặt BrowserRouter và AppRoutes
├── main.jsx                          Tạo React root và nạp CSS toàn cục
└── index.css                         Điểm nhập Tailwind
```

### Mobile

```text
apps/mobile/
├── src/
│   ├── config/
│   │   ├── env.js                   Ghép cấu hình API với host Expo và nền tảng
│   │   ├── resolve-api-base-url.js   Ưu tiên URL cấu hình; tự nhận host trong dev
│   │   └── tests/                   Test chọn host, đổi mạng và cấu hình riêng
│   ├── navigation/RootNavigator.jsx  Mở Home; giữ Services và Health trong stack
│   ├── navigation/BottomNav.jsx      5 mục; Home/Services điều hướng, 3 mục mở modal
│   ├── components/FeatureUnavailableProvider.jsx  Một modal dùng chung toàn mobile
│   ├── components/FeatureUnavailableModal.jsx     Báo tính năng đang phát triển, đóng bằng nút/Back
│   ├── theme/tokens.js               Màu Sol và font hệ thống native
│   ├── features/home/
│   │   ├── screens/HomeScreen.jsx    Ghép hero, danh mục và banner đặt lịch chưa khả dụng
│   │   └── components/              HomeHeader và BookingBanner
│   ├── features/services/
│   │   ├── screens/ServicesScreen.jsx  Ghép danh mục và điều hướng
│   │   ├── components/ServicesList.jsx  FlatList thích ứng, trạng thái và đường tới Health
│   │   ├── service-presentation.js   Giá VND, thời lượng và số cột theo font scale
│   │   ├── components/ServiceCard.jsx  Ảnh, mô tả, giá và thời lượng từ API
│   │   ├── components/ServicesStatus.jsx  Tải, rỗng, lỗi và thử lại
│   │   ├── hooks/useServices.js       Giữ state, tải lại và cleanup request
│   │   ├── api/services.api.js        Gọi GET /api/services qua HTTP helper
│   │   ├── styles/                   StyleSheet native của screen và card
│   │   └── tests/services.api.test.js  DTO, lỗi/thử lại, hủy và response cũ
│   ├── features/health/
│   │   ├── screens/HealthScreen.jsx  Ghép màn hình, SafeAreaView và StatusBar
│   │   ├── components/HealthStatusCard.jsx  Hiển thị trạng thái và nút thử lại
│   │   ├── hooks/useHealth.js         Tải lần đầu, giữ state, thử lại và cleanup
│   │   ├── api/health.api.js          Gọi endpoint health qua HTTP helper
│   │   └── tests/health.api.test.js   Kiểm tra endpoint do feature chọn
│   └── lib/
│       ├── http.js                   Gọi JSON, timeout, abort và cleanup
│       ├── latest-request.js          Hủy request cũ và bỏ qua kết quả cũ
│       └── tests/                    Test helper HTTP và request mới nhất
├── App.jsx                            Đặt SafeAreaProvider và NavigationContainer
├── index.js                           Đăng ký component gốc với Expo
├── app.json
└── package.json
```

`assets/` chứa hình ảnh giao diện Expo, không liệt kê từng ảnh ở đây.

## C. Thứ tự đọc code

- API: `apps/api/src/server.js` → `apps/api/src/app.js` → `apps/api/src/routes/index.js` → `apps/api/src/modules/services/services.routes.js` → `services.controller.js` → `services.repository.js` → `services.model.js`.
- Web: `apps/web/src/main.jsx` → `App.jsx` → `routes/AppRoutes.jsx` → `features/home/pages/HomePage.jsx` → `components/ServicePreview.jsx` → `features/services/hooks/useServices.js` → `api/services.api.js` → `lib/http.js`.
- Mobile: `apps/mobile/index.js` → `App.jsx` → `src/navigation/RootNavigator.jsx` → `features/home/screens/HomeScreen.jsx` hoặc `features/services/screens/ServicesScreen.jsx` → `features/services/components/ServicesList.jsx` → `hooks/useServices.js` → `api/services.api.js` → `lib/http.js`. Liên kết cuối danh mục mở `features/health/screens/HealthScreen.jsx`.

## D. Luồng chạy trang chủ và danh mục dịch vụ

Web vào `main.jsx`, nơi tạo React root và render `App` trong `StrictMode`. `App.jsx` đặt một `BrowserRouter`; `AppRoutes` chọn `HomePage` tại `/` và vẫn giữ `HealthPage` tại `/health`. `HomePage` ghép header, phần mở đầu, danh mục, trải nghiệm, bài viết mẫu, lời mời liên hệ và footer. `ServicePreview` gọi `useServices`; hook quản lý trạng thái `loading`, `success` (gồm cả danh sách rỗng), `error`, thử lại và hủy request khi rời trang.

`services.api.js` gọi `GET /api/services` qua HTTP helper. Khi MongoDB đã kết nối, máy chủ trả `{ data: [...] }` từ các dịch vụ đang hoạt động; mỗi mục có `id`, `slug`, `name`, `description`, `category`, `durationMinutes`, `priceVnd` và `imageUrl`. URL ảnh được tạo từ Cloudinary cloud name/public ID lúc nạp seed vào MongoDB; web dùng `imageUrl` trả về từ API. Khi database chưa được cấu hình hoặc kết nối, endpoint trả `503` với mã `DATABASE_UNAVAILABLE`, còn health check vẫn cho biết trạng thái database.

Mobile mở `HomeScreen` trước với logo, hero và danh mục thật; thanh điều hướng chuyển Home ↔ Services. Hai màn dùng `ServicesList`, tự chuyển hai cột xuống một cột theo chiều rộng và font scale. Home dùng ảnh/logo đóng gói cùng ứng dụng, font serif của hệ điều hành và banner có CTA Đặt lịch ngay. Hai CTA, ba mục Đặt lịch/Lịch hẹn/Tài khoản và chuông thông báo gọi `useFeatureUnavailable` để mở một modal dùng chung ở `src/components`; modal nêu rõ tính năng đang phát triển, không tạo route hoặc dữ liệu nghiệp vụ giả. Home ẩn toolbar số lượng/tải lại; kéo xuống tải lại và error retry vẫn giữ. `FlatList` dùng public `id` làm key; `ServiceCard` hiển thị ảnh qua `imageUrl`, tên, nhóm, mô tả, giá VND và khoảng thời lượng. Giao diện native dùng `StyleSheet`, không dùng component DOM hoặc CSS web. Lỗi ảnh chỉ thay phần ảnh bằng thông báo; dữ liệu dịch vụ vẫn xem được.

`useServices` quản lý `loading`, `success` (gồm danh sách rỗng), `error` và tải lại. `services.api.js` chỉ chọn endpoint và lấy `data` từ envelope chung. HTTP helper tiếp tục dùng base URL môi trường/SOL-012, timeout 8 giây và abort. Cleanup hủy request khi unmount; `latest-request.js` bỏ qua kết quả cũ. Nút tải lại bị vô hiệu hóa lúc tải. Task này không đổi DTO, route API, model MongoDB hoặc tài nguyên Cloudinary.

## E. Luồng chạy health

### Mở màn hình

Web vào `main.jsx`, nơi tạo React root và render `App` trong `StrictMode`. `App.jsx` đặt một `BrowserRouter`; `AppRoutes` chọn route `/health`, rồi `MainLayout` giữ nền và khung trang. `HealthPage` gọi `useHealth`. Hook khởi tạo state `loading` và chạy `loadHealth` trong `useEffect`.

Mobile vào `index.js`, Expo đăng ký `App.jsx`. `App` đặt một `SafeAreaProvider` và một `NavigationContainer`; `RootNavigator` mở `Home` với header tắt; `Services` cũng ẩn header. Thanh điều hướng quay về Home bằng `popTo` để không chồng thêm màn hình. Liên kết **Kiểm tra kết nối** mở `Health` với native header và nút quay lại. `HealthScreen` dùng `SafeAreaView` theo cạnh phải, dưới và trái (header xử lý cạnh trên), rồi gọi `useHealth` để bắt đầu cùng luồng tải.

### Bấm “Kiểm tra lại”

`HealthStatusCard` gọi callback `retry` được truyền qua props. `useHealth` bỏ qua callback nếu state vẫn `loading`; nếu không, đặt lại `loading` rồi gọi `loadHealth`. Nút cũng bị disable trong lúc tải để không tạo lượt bấm chồng nhau.

### API không phản hồi hoặc timeout

`health.api.js` chọn đường dẫn `/api/health` rồi gọi `requestJson` trong `lib/http.js`. HTTP helper tạo `AbortController` cho fetch, đặt timeout hữu hạn 8 giây, nối signal do hook quản lý và trong `finally` xóa timer cũng như listener. Khi hết thời gian, helper đổi lỗi abort do timeout thành thông báo có thể thử lại; hook chuyển lỗi thành state `error` để card hiển thị.

### API trả lỗi

Nếu response có HTTP status ngoài khoảng thành công, `requestJson` ném lỗi `API trả về HTTP <status>.` Feature không tự xử lý fetch hoặc timeout; hook nhận lỗi và đặt state `error`. Khi người dùng thử lại, cùng hook chuyển về `loading` và thực hiện một request mới.

### Rời màn hình hoặc bắt đầu request mới

`useHealth` cleanup gọi `requestManager.cancel()` khi component unmount. `latest-request.js` tăng mã request và abort controller đang chạy; vì vậy kết quả sau cleanup bị đánh dấu `ignored` và không cập nhật giao diện. Nếu request mới bắt đầu, request manager cũng hủy request cũ và chỉ trả kết quả của mã mới nhất. HTTP helper chịu việc abort fetch và dọn tài nguyên của chính request; request manager chịu vòng đời và tính mới nhất của kết quả.

### Luồng API

`server.js` gọi `connectToDatabase(config.mongoUri)`; nếu URI trống, database giữ trạng thái `not-configured` và API vẫn khởi động. `app.js` lần lượt gắn CORS, JSON parser, `apiRouter`, `notFound` và `errorHandler`. `healthRouter` ánh xạ `/health` tới `getHealth`, controller trả JSON hiện có cùng timestamp ISO.

Parser JSON không hợp lệ được `errorHandler` nhận diện và trả 400 `INVALID_JSON`. Endpoint không tồn tại đi qua `notFound` trả 404 `NOT_FOUND`. Lỗi khác được log thông tin an toàn rồi trả 500 `INTERNAL_ERROR`; nếu header đã gửi, middleware chuyển lỗi cho Express qua `next(error)`.

## F. Hướng dẫn thêm tính năng sau này

Ví dụ dưới đây mô tả nơi tiếp tục mở rộng feature danh mục; các mục này chưa nằm trong phạm vi hiện tại.

- API: mở rộng `apps/api/src/modules/services/` khi cần lưu trữ bền vững hoặc quy tắc nghiệp vụ; đăng ký router tại `apps/api/src/routes/index.js`.
- Web: trang chủ hiện dùng danh mục MongoDB từ API. Trang danh mục đầy đủ có thể đặt page, component, hook, API và test trong `apps/web/src/features/services/` khi được giao.
- Mobile: mở rộng danh mục hiện có trong `apps/mobile/src/features/services/` khi được giao; screen được đăng ký trong `src/navigation/RootNavigator.jsx`.
- Cả hai client gọi cùng hợp đồng API; mỗi client tiếp tục dùng base URL riêng theo môi trường. Không chuyển component DOM sang mobile.

Không cần tạo đủ mọi tệp trước khi tính năng cần chúng.

## G. Quy tắc chọn vị trí code

- **Page/screen** ghép nội dung của một màn hình. **Component** trình bày một phần giao diện qua props; component không tự gọi endpoint.
- **Hook** giữ state, vòng đời và thao tác của feature. **Hàm API của feature** biết endpoint nào cần gọi và chuyển tham số sang HTTP helper.
- **HTTP helper** xử lý cơ chế chung như URL, response JSON, timeout, abort và cleanup. Nó không chứa endpoint health cụ thể.
- **Controller** nhận request/response HTTP và tạo phản hồi. **Service** chứa quy tắc nghiệp vụ độc lập với `req`/`res`; chỉ thêm khi nghiệp vụ có logic cần tách.
- Chỉ đưa component lên thư mục dùng chung khi có ít nhất hai feature thật sự sử dụng cùng component. Web và native không dùng chung UI.
- Tạo các tệp theo nhu cầu feature; không thêm service/model giả, barrel export, helper tổng quát hoặc tầng bổ sung chỉ để hoàn tất một cây thư mục.

## H. Đường dẫn cũ → mới

| Đường dẫn trước refactor | Vị trí sau refactor |
| --- | --- |
| `apps/api/src/config.js` | `apps/api/src/config/env.js` |
| `apps/api/src/database.js` | `apps/api/src/config/database.js` |
| Handler health trong `apps/api/src/app.js` | `modules/health/health.routes.js` và `health.controller.js` |
| Handler 404/500 trong `apps/api/src/app.js` | `middlewares/not-found.js` và `middlewares/error-handler.js` |
| `apps/api/src/app.test.js` | `modules/health/tests/health.test.js` và `middlewares/tests/middlewares.test.js` |
| `apps/web/src/App.jsx` | `routes/AppRoutes.jsx`, `layouts/MainLayout.jsx`, `features/health/pages/HealthPage.jsx`, `components/HealthStatusCard.jsx`, `hooks/useHealth.js` |
| `apps/web/src/api.js` | `features/health/api/health.api.js`, `lib/http.js`, `lib/latest-request.js`, `config/env.js` |
| `apps/web/src/api.test.js` | `features/health/tests/health.api.test.js` và `lib/tests/` |
| `apps/mobile/App.jsx` | `src/navigation/RootNavigator.jsx`, `features/health/screens/HealthScreen.jsx`, `components/HealthStatusCard.jsx`, `hooks/useHealth.js` |
| `apps/mobile/src/api.js` | `src/features/health/api/health.api.js`, `src/lib/http.js`, `src/lib/latest-request.js`, `src/config/env.js` |
| `apps/mobile/src/api.test.js` | `src/features/health/tests/health.api.test.js` và `src/lib/tests/` |
