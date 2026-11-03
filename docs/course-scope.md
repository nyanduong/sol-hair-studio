# Phạm vi môn học và các giả định

Tài liệu này tách thông tin đã biết khỏi giả định kỹ thuật và những quyết định còn chờ rubric chính thức. Nội dung này không khẳng định bài tập của môn nào đã hoàn thành.

## Bối cảnh đã biết

- Sol Hair Studio là chủ đề sản phẩm dùng chung cho SDN302 và MMA301.
- SDN302 yêu cầu website ReactJS hoàn chỉnh, bao gồm giao diện responsive trên trình duyệt điện thoại.
- MMA301 yêu cầu ứng dụng React Native riêng cho Android và iOS.
- Web và mobile dùng chung máy chủ và dữ liệu, nhưng mỗi môn vẫn cần luồng chạy, demo và bằng chứng yêu cầu riêng.
- Định hướng sản phẩm được người dùng xác nhận ngày 03/11/2026: website phục vụ quản trị và customer; mobile tập trung phục vụ stylist và customer.
- Phần sản phẩm dùng chung đầu tiên là API danh mục dịch vụ thật được cả web và mobile sử dụng.

## Thứ tự triển khai đã xác nhận

Theo yêu cầu ngày 03/11/2026, tập trung hoàn thiện website và API cần thiết trước; sau đó audit commit, diff và PR để ghi nhận task thực tế lên Sheet. Không bắt buộc lập task trước khi triển khai. Vẫn review, kiểm thử và bàn giao từng PR trong quá trình làm website; chỉ ghi `Hoàn thành` khi có bằng chứng kiểm thử, nghiệm thu và merge.

Chỉ triển khai tiếp tính năng mobile sau khi website hoàn tất theo phạm vi đã xác nhận và đã đối chiếu task lên Sheet. Giữ nguyên mobile hiện có, kiểm tra tương thích khi API thay đổi; phần mobile chưa nghiệm thu vẫn giữ trạng thái thực tế. Việc website hoàn tất không đồng nghĩa đã hoàn thành yêu cầu MMA301 hoặc toàn bộ rubric hai môn.

API được thiết kế ngay từ giai đoạn website để cả web và mobile dùng chung nghiệp vụ, mô hình dữ liệu, hợp đồng xác thực, request/response và lỗi. Phân quyền dựa trên vai trò tại server; tránh phụ thuộc trình duyệt để mobile có thể tái sử dụng với ít thay đổi. Không tạo backend riêng cho mobile hoặc xây tầng mở rộng chưa cần thiết.

## Giả định kỹ thuật hiện tại

Các lựa chọn dưới đây tạo điểm bắt đầu dễ bảo trì và có thể thay đổi sau khi nhóm đọc rubric:

- Monorepo dùng npm workspaces với `apps/web`, `apps/mobile` và `apps/api`.
- Node.js 24 LTS cho toàn repository.
- Web khách dùng React, Vite, JavaScript/JSX và Tailwind CSS; các chức năng Admin dùng Express + EJS theo yêu cầu giảng viên.
- Mobile dùng React Native, Expo SDK 57 và JavaScript/JSX.
- Web dùng React, Vite, JavaScript/JSX và Tailwind CSS.
- Mobile dùng React Native, Expo SDK 58 và JavaScript/JSX.
- API dùng Express 5 và JavaScript.
- Dùng MongoDB với Mongoose 9 khi bắt đầu lưu dữ liệu.
- Web và mobile dùng một hợp đồng API chung, nhưng base URL được cấu hình riêng theo môi trường chạy.
- Google Sheet [Sol Hair Studio — Kế hoạch & phân công](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit) là nguồn phân công chính; PR lưu thay đổi mã nguồn và bằng chứng review. Không bắt buộc dùng GitHub Issue, Project, Sprint hoặc milestone cho công việc mới.

## Đối chiếu môn học tạm thời

| Khả năng | Bằng chứng SDN302 | Bằng chứng MMA301 | Trạng thái hiện tại |
| --- | --- | --- | --- |
| Cấu hình và endpoint kiểm tra API dùng chung | Web gọi được API | Mobile gọi được API | Chỉ có nền ban đầu |
| Danh mục dịch vụ | Giao diện React thích ứng | Giao diện native Android/iOS | Đã lập kế hoạch; chưa xác nhận với rubric |
| Xác thực và phân quyền | Chưa rõ | Chưa rõ | Chờ rubric |
| Luồng đặt lịch | Chưa rõ | Chưa rõ | Chờ rubric |
| Quản trị và trang tổng quan | Chưa rõ | Chưa rõ | Chờ rubric |
| Thanh toán | Chưa rõ | Chưa rõ | Chờ rubric |

## Thông tin còn thiếu

- Rubric chính thức của SDN302 và MMA301, chức năng bắt buộc và bằng chứng chấm điểm.
- Hạn chót, hình thức demo, giới hạn triển khai và thư viện hoặc dịch vụ bắt buộc.
- Phiên bản trình duyệt, Android và iOS cần hỗ trợ.
- Khả năng nhận việc, người phụ trách và vòng review đã thống nhất trong nhóm.
- Ràng buộc dữ liệu và quyền riêng tư, vai trò xác thực và việc thanh toán là mô phỏng hay tích hợp thật.

Cho đến khi các thông tin trên được xác nhận, công việc phụ thuộc vào chúng phải giữ trạng thái `Bị chặn` hoặc nội dung `Chưa chốt` trên Sheet và không được tuyên bố đã đáp ứng rubric.

## Bổ sung phạm vi thu tiền tại salon

Yêu cầu ngày 03/11/2026 bổ sung luồng chuyển khoản qua ảnh QR chủ tiệm trên website và API dùng chung. Nhân viên thao tác tại máy salon dùng phiên Owner để xác nhận thủ công đã kiểm tra tiền vào tài khoản; không mở đăng nhập web cho stylist thuần. Nhật ký chỉ nhận diện tài khoản đang dùng, không suy diễn cá nhân thao tác. Khách xem trạng thái thanh toán của lịch mình. Báo cáo phân biệt giá trị dịch vụ, tiền đã thu và chưa thu. Không tích hợp cổng thanh toán, tự đối soát ngân hàng, thanh toán từng phần hoặc hoàn tiền trong thay đổi này. Xem `docs/payments-api.md`; chưa coi là xác nhận rubric hay nghiệm thu/merge hoàn tất.
