# Phạm vi môn học và các giả định

Tài liệu này tách thông tin đã biết khỏi giả định kỹ thuật và những quyết định còn chờ rubric chính thức. Nội dung này không khẳng định bài tập của môn nào đã hoàn thành.

## Bối cảnh đã biết

- Sol Hair Studio là chủ đề sản phẩm dùng chung cho SDN302 và MMA301.
- SDN302 yêu cầu website ReactJS hoàn chỉnh, bao gồm giao diện responsive trên trình duyệt điện thoại.
- MMA301 yêu cầu ứng dụng React Native riêng cho Android và iOS.
- Web và mobile dùng chung máy chủ và dữ liệu, nhưng mỗi môn vẫn cần luồng chạy, demo và bằng chứng yêu cầu riêng.
- Không chia vai trò theo ứng dụng: không mặc định web chỉ dành cho quản trị viên hoặc mobile chỉ dành cho khách hàng.
- Phần sản phẩm dùng chung đầu tiên là API danh mục dịch vụ thật được cả web và mobile sử dụng.

## Giả định kỹ thuật hiện tại

Các lựa chọn dưới đây tạo điểm bắt đầu dễ bảo trì và có thể thay đổi sau khi nhóm đọc rubric:

- Monorepo dùng npm workspaces với `apps/web`, `apps/mobile` và `apps/api`.
- Node.js 24 LTS cho toàn repository.
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
