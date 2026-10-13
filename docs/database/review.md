# Review và bằng chứng — SOL-016

## Phạm vi

Nguồn nghiệp vụ: PHẠM VI trên [Sheet](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit#gid=785319952), đọc trực tiếp ngày 14/10/2026. Công việc SOL-016 tại PHÂN CÔNG hàng15, NhanDuong21. [Đối chiếu thay đổi](scope-alignment.md) phân biệt quyết định MVP với đề xuất kỹ thuật cần review PR.

Baseline SOL-011 được giữ phần service/images, DTO và nguyên tắc snapshot/transaction; cập nhật auth/ca/booking/audit theo MVP. Không tự mở backlog Markdown; không API/Web/Mobile implementation, DB migration/seed/Cloudinary thật hoặc tài liệu hợp đồng API đầy đủ.

## Kiểm chứng

Kết quả lệnh được ghi sau khi chạy ở mục dưới; checker là offline, không chứng minh transaction/concurrency/OTP delivery trên hệ thống thật. PNG cần mở xem sau render; JSON VisuaLeaf sửa offline, chưa import lại widget.

## Rủi ro cần module tích hợp kiểm tra

- M2 đổi projection allowlist trước thêm field, giữ DTO và source ảnh.
- M1 verify/resend/reset race, HMAC/password KDF, email lỗi, proof một lần và reset không kích hoạt disabled.
- M3/M4/M5 tất cả writer dùng cùng guard customer/staff; snapshot transaction không đủ để chống write skew.
- M4 TTL expiry còn document, same-key mismatch, unknown commit, khác key vẫn chống trùng.
- M5 actual/ETA có thể ảnh hưởng lịch thật: cảnh báo chủ, không tự dời; correction chỉ owner/reason/audit và kiểm lại conflict.
- Các giới hạn kỹ thuật (horizon theo localDate, upload limit, bounded fields, index workload) công bố để review; chưa có đo explain hoặc production evidence.

## Kết quả chạy

Ngày 14/10/2026 trên Windows, Node v24.15.0 / npm11.12.1:
- node docs/database/checks/validate-examples.mjs --self-test: PASS — 11 collection, 55 document giả; 45 biến thể sai, 6 biến thể đúng và 4 kiểm tra đích cho customer overlap/contact/correction; 30 liên kết nội bộ; JSON sơ đồ 11 collection/76 field/17 reference.
- npm run lint: PASS cả 3 workspace.
- npm test: PASS 54 test (API12, Mobile28, Web14), 18 file.
- npm run build: PASS API syntax20 file, Expo export Android/iOS, Vite web45 module. Đây là export bundle, không chạy emulator/thiết bị/iOS.
- git diff --check: PASS.
- Mermaid CLI cache + Edge render PNG5200×1802; đã mở kiểm tra 11 collection, nhãn/đường reference và các block không cắt chữ. JSON cập nhật offline, kiểm endpoint/cardinality bằng checker; chưa round-trip VisuaLeaf.

Lệnh app chạy với DOTENV_CONFIG_PATH=NUL, EXPO_NO_DOTENV=1, MONGODB_URI rỗng và CI=1; không đọc .env/kết nối DB thật. Không kiểm thử giao diện mới, SMTP/Cloudinary/OTP/TTL/concurrency thật trong SOL-016. CI GitHub và review/merge theo PR; không tự coi BR đã duyệt là thiết kế hoặc code đã nghiệm thu.
