# Quy ước làm việc trong repository

## Phạm vi và nguồn thông tin chuẩn

- Repository này chứa ứng dụng web, ứng dụng di động và API dùng chung của Sol Hair Studio. Không sao chép từ hoặc sửa repository landing page Next.js cá nhân.
- [Sol Hair Studio — Kế hoạch & phân công](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit) là nguồn phân công chính. Dùng mã việc cố định `SOL-xxx`; không tạo backlog Markdown song song.
- Không tự tạo GitHub Issue, Project, Sprint hoặc milestone để giao việc. Công việc mới chỉ cần một hàng trên Sheet; issue hiện có là lịch sử hoặc nguồn tham chiếu khi hàng đó dẫn tới nó.
- Chưa có rubric chính thức, hạn chót và khả năng nhận việc của từng thành viên. Xem lựa chọn công nghệ và phần đối chiếu môn học trong `docs/course-scope.md` là giả định cho đến khi nhóm xác nhận.
- Không suy đoán người làm, hạn, yêu cầu giảng viên hoặc khả năng nhận việc từ username. Không sửa hàng công việc của người khác nếu chưa được yêu cầu hoặc nhóm chưa thống nhất.
- Giữ phần dùng chung ở một nơi. Không tách thành việc web/mobile trùng nhau nếu không có ranh giới bàn giao thật sự.

## Trước khi thay đổi mã nguồn

1. Đọc yêu cầu người dùng, `README.md`, `docs/course-scope.md`, nhánh hiện tại, `git status` và lịch sử commit gần nhất; tham khảo hàng Sheet liên quan nếu đã có. Không bắt buộc tạo task trên Sheet trước khi triển khai website.
   Nếu không truy cập được Sheet, dùng đúng yêu cầu người dùng đã cung cấp, ghi rõ giới hạn và không giả vờ đã đọc hoặc cập nhật Sheet.
2. Giữ nguyên thay đổi chưa commit hoặc không liên quan của người khác. Không xóa hay ghi đè công việc đó.
3. Xác nhận yêu cầu thuộc repository này và không âm thầm mở rộng phạm vi bài tập.
4. Không in hoặc commit token, file `.env`, thông tin đăng nhập, mã định danh thiết bị hay dữ liệu production.

## Quy trình Sheet, nhánh và pull request

- Ưu tiên triển khai và hoàn thiện website cùng API cần thiết theo phạm vi đã xác nhận. Không chờ chia task hoặc cập nhật Sheet mới được viết code; Sheet vẫn là nơi duy nhất ghi nhận task và phân công.
- Sau khi hoàn thiện website, audit commit, diff và PR để đối chiếu công việc thực tế lên Sheet: tái sử dụng mã `SOL-xxx` phù hợp, chỉ tạo mã mới cho phần chưa có; ghi mục tiêu, phụ thuộc, phần không bao gồm, điều kiện hoàn thành và bằng chứng. Không suy diễn người làm hoặc ngày bắt đầu/hoàn thành; thiếu bằng chứng thì ghi rõ chưa xác minh.
- Dùng nhánh tập trung như `feat/SOL-003-service-catalog`, `fix/SOL-008-api-timeout` hoặc `chore/SOL-001-project-foundation`. Nếu chưa có mã việc, dùng nhánh mô tả thay đổi với tiền tố `nyan/`; gắn mã sau audit, không cần viết lại lịch sử Git.
- Không ai, kể cả admin, được push trực tiếp vào `main`; mọi thay đổi phải đi qua pull request. Không hạ rule bảo vệ nhánh hoặc bỏ qua kiểm tra đang thất bại.
- Trước khi merge, check bắt buộc `Lint, test and build` phải thành công, nhánh phải cập nhật theo rule hiện hành và mọi conversation phải được resolve. Không force-push hoặc xóa `main`.
- `NhanDuong21` là repository owner/admin và được phép merge PR do chính mình tạo khi các điều kiện bắt buộc đã đạt. Với PR của thành viên khác, approval của chính tác giả không được tính là review độc lập; PR phải có ít nhất một approval từ cộng tác viên khác trước khi merge.
- Branch protection hiện dùng `0 approvals` để owner có thể tự merge nên GitHub cũng không chặn collaborator có quyền write tự merge. Đây là giới hạn kỹ thuật phải tuân thủ bằng quy trình cho đến khi nhóm bật ruleset yêu cầu một approval và cho repository admin bypass chỉ qua pull request.
- Giữ mỗi commit tập trung và PR đủ nhỏ để review. PR ghi liên kết Sheet và mã việc nếu đã có; nếu chưa có thì ghi `Chờ đối chiếu sau audit website`, sau audit bổ sung mã và hàng Sheet tương ứng. Chỉ dùng `Closes #<số>` khi thực sự giải quyết đầy đủ một issue lịch sử có liên quan.
- Giai đoạn website ghi bằng chứng triển khai, kiểm thử và review trong commit/PR; sau khi hoàn thiện website mới tổng hợp trạng thái/bằng chứng lên đúng hàng Sheet. Không trì hoãn review/CI đến cuối website. Viết code xong nhưng chưa kiểm thử, nghiệm thu và merge PR chưa phải `Hoàn thành`; không đánh dấu hoàn thành phần mobile chưa nghiệm thu.

## Thứ tự triển khai và vai trò sản phẩm

- Hoàn thiện website phục vụ quản trị và customer trước. Chốt phạm vi website theo yêu cầu đã xác nhận, kiểm thử các luồng thuộc phạm vi đó, xử lý lỗi chặn và bàn giao qua PR trước khi chuyển sang triển khai tính năng mobile.
- Sau khi website hoàn tất và audit commit/PR đã được đối chiếu lên Sheet, mới triển khai mobile phục vụ stylist và customer. Giữ nguyên mã mobile hiện có; chưa mở rộng tính năng mobile trong giai đoạn website. Tiếp tục chạy kiểm tra tương thích liên quan khi API dùng chung thay đổi.
- API được xây dựng cùng website nhưng dùng chung cho cả hai client: nghiệp vụ, validation và phân quyền nằm phía server; không phụ thuộc DOM, điều hướng web hoặc trạng thái chỉ có trong trình duyệt. Giữ hợp đồng request/response, lỗi, xác thực và mô hình dữ liệu nhất quán để mobile tái sử dụng với ít thay đổi.
- Phân quyền theo vai trò người dùng trên API, không dựa vào việc request đến từ website hay mobile. Khi thay đổi hợp đồng, mô tả ảnh hưởng tới client hiện có và cách chuyển đổi; không tạo API hoặc database riêng cho mobile, cũng không tạo trước framework hay endpoint chưa có nhu cầu.

## Ranh giới triển khai

- Ưu tiên monorepo hiện có và module đơn giản; không thêm service, orchestration hoặc tầng framework không cần thiết.
- Web, mobile và API đều dùng JavaScript; component React dùng JSX. Không đưa TypeScript hoặc TSX trở lại nếu chưa có quyết định mới của nhóm.
- Giao diện web dùng utility class của Tailwind CSS. File `apps/web/src/index.css` chỉ là điểm nhập Tailwind hoặc chứa thiết lập toàn cục thật sự cần thiết; không tạo stylesheet CSS viết tay theo từng component nếu chưa có lý do được ghi trên công việc.
- React Native dùng `StyleSheet` native, không dùng CSS web. Chỉ thêm NativeWind hoặc thư viện tương tự khi nhóm ghi nhận quyết định rõ trên Sheet.
- Hợp đồng API và mô hình dữ liệu được web và mobile dùng chung. Mọi thay đổi phải mô tả ảnh hưởng tương thích.
- Base URL của API phải cấu hình được theo môi trường. Không giả định trình duyệt, Android Emulator, iOS Simulator và điện thoại thật dùng cùng một địa chỉ host.
- Chỉ thêm dependency phục vụ trực tiếp cho công việc. Giữ phiên bản tương thích với nền Node/Expo trong repository và commit lockfile ở thư mục gốc.
- Giữ kiến trúc một monorepo với ba workspace `apps/api`, `apps/web`, `apps/mobile`; chỉ dùng `package-lock.json` ở root.
- API: cấu hình ở `src/config`, middleware HTTP ở `src/middlewares`, gom route ở `src/routes`, chức năng theo miền ở `src/modules/<feature>`; `app.js` chỉ ghép middleware và router, `server.js` khởi động server/kết nối database/dừng êm.
- Web: dùng `src/routes/AppRoutes.jsx`, `src/layouts` và `src/features/<feature>/{pages,components,hooks,api,tests}`. `App.jsx` ghép router; `main.jsx` là entry React.
- Mobile: dùng `src/navigation/RootNavigator.jsx` và `src/features/<feature>/{screens,components,hooks,api,tests}`. `App.jsx` đặt một `SafeAreaProvider` và một `NavigationContainer`; navigator hiện ẩn header để giữ giao diện health.
- HTTP helper và kiểm soát request mới nhất nằm riêng trong `src/lib` của mỗi app. Helper HTTP chịu base URL, response JSON, timeout, abort và cleanup; `latest-request.js` hủy request cũ và bỏ qua kết quả cũ. API của feature chỉ chọn endpoint; hook sở hữu trạng thái/lifecycle; page/screen ghép giao diện; controller xử lý HTTP, service mới chứa nghiệp vụ khi thực sự cần.
- Không tạo trước module dịch vụ/đặt lịch/xác thực/thanh toán, shared UI giữa web/mobile, barrel export hoặc tầng framework không có nhu cầu thật. Không phải feature nào cũng cần đủ các file ngay từ đầu.
- Tài liệu mô tả luồng thật và bảng đường dẫn cũ/mới nằm tại `docs/kien-truc-va-luong-chay.md`.
- Không tuyên bố đã kiểm thử trình giả lập, thiết bị, cơ sở dữ liệu hoặc trình duyệt nếu chưa thật sự chạy.

## Kiểm tra bắt buộc và bàn giao

Chạy các kiểm tra liên quan đến phần đã sửa; với thay đổi xuyên suốt, chạy toàn bộ:

```powershell
npm run lint
npm test
npm run build
```

Trong PR, ghi rõ:

- nội dung đã thay đổi và phần chủ động không thực hiện;
- chính xác lệnh nào thành công hoặc thất bại;
- môi trường đã kiểm tra thủ công thật sự: trình duyệt, trình giả lập, thiết bị thật hoặc cơ sở dữ liệu;
- ảnh chụp màn hình hoặc trích đoạn log mà điều kiện hoàn thành yêu cầu;
- rủi ro còn lại, phụ thuộc và mã việc tiếp theo.

Không làm yếu test, nuốt lỗi hoặc thêm test giữ chỗ chỉ để CI hiện màu xanh.
