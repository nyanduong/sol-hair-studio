# Thu tiền bằng QR tại salon

Theo yêu cầu 03/11/2026: chuyển khoản trực tiếp vào QR chủ tiệm, người vận hành máy salon dùng phiên Owner để kiểm tra và xác nhận nhận tiền. Tài khoản stylist thuần vẫn không đăng nhập web; không mở rộng UI mobile. Nhật ký ghi tài khoản Owner đang đăng nhập, không khẳng định cá nhân stylist nào bấm khi dùng chung phiên.

## API

Bearer auth, Cache-Control: no-store. Response thành công `{status:'success',data}`; lỗi theo AppointmentError hiện có `{status:'error',code,message}`.

- `GET /api/appointments/:appointmentId/payment`: Owner xem mọi lịch; Customer chỉ lịch thuộc hồ sơ gắn với chính account. Stylist không được truy cập. Lịch không thuộc khách trả 404. Trả `appointmentId,revision,appointmentStatus,status: unpaid|paid,amountVnd,transferContent,qrPath,receivedAt`. Owner được thêm receivedByAccountId khi đã thu; không trả commandKey cho client. Số tiền lấy từ snapshot dịch vụ, không đọc catalog hiện tại. Chỉ trả qrPath khi completed và chưa thu. Lịch legacy thiếu referenceCode dùng appointmentId làm nội dung đối chiếu, không giả làm mã SOL chính thức.
- `POST /api/appointments/:appointmentId/payment/confirm`: Owner, header `Idempotency-Key` 16–100 ký tự chữ/số/gạch ngang/gạch dưới; body `{expectedRevision: number, receivedConfirmed: true}`. Không nhận amount/status/actor/timestamp từ client. Chỉ lịch completed và đúng revision mới được xác nhận. Ghi nguyên tổng giá trị lịch, ngày/giờ server và account xác nhận. Không hỗ trợ thanh toán từng phần, hoàn tiền, tự xóa hoặc sửa xác nhận trong phạm vi này.

Sai ID/body/key trả 400; thiếu phiên 401; sai vai trò 403; không thấy lịch 404; sai trạng thái/revision, lịch đã thu bởi lệnh khác hoặc tranh chấp trả 409. Retry cùng key và cùng account trả lại receipt đã lưu, kể cả sau khi trạng thái phục vụ được sửa; key khác không ghi đè receipt. Atomic conditional update trên cùng document bảo đảm chỉ một lần thu khi hai máy gửi đồng thời. Payment không tăng revision phục vụ và không ghi đè lastCommand; là luồng độc lập. GET sau lỗi mạng dùng để đối chiếu, không yêu cầu khách chuyển lại chỉ vì request timeout.

## Dữ liệu và tương thích

Appointment bổ sung optional `payment: {amountVnd,receivedAt,receivedLocalDate,receivedByAccountId,receivedByRole:'owner',commandKey}`. Không đổi enum lịch `confirmed/in_progress/completed/cancelled/no_show`. Không cần backfill: thiếu payment nghĩa là chưa có xác nhận thu tiền trong Sol, không phải bằng chứng ngân hàng cho rằng khách chưa trả. Cần đối chiếu thủ công các lịch cũ trước khi thu.

Sửa bắt đầu/hoàn tất nhầm giữ nguyên payment. Lịch có thể đang phục vụ lại nhưng đã nhận tiền; UI vẫn hiện receipt, không cho chuyển thêm. Xác nhận chỉ kiểm tra trạng thái phục vụ tại thời điểm ghi; thao tác sửa sau đó không hoàn tác thu tiền. Không có tự đối soát ngân hàng, callback, webhook hay thao tác hoàn tiền.

Các DTO và endpoint lịch cũ giữ nguyên. Web đọc trạng thái thanh toán bằng endpoint riêng; API mobile hiện có tiếp tục dùng được. API base URL vẫn do từng client cấu hình. Kiểm tra tương thích mobile bằng test/bundle, không tuyên bố đã nghiệm thu native.

## Giao diện và QR

Ảnh chủ tiệm cung cấp ở `apps/api/public/qr/qr-code.jpg`, phục vụ qua `/admin-assets/qr/qr-code.jpg`. Đây là QR tĩnh: UI hiển thị số tiền và nội dung riêng, không khẳng định QR tự điền hai giá trị này hoặc đã xác minh đích ngân hàng. Chủ tiệm và khách kiểm tra tài khoản đích trong ứng dụng ngân hàng. Không gửi dữ liệu tới dịch vụ tạo QR bên ngoài.

EJS chi tiết lịch có popup Thu tiền, checkbox xác nhận đã kiểm tra tiền vào tài khoản, nút Xác nhận đã nhận tiền và tải lại trạng thái. Khách ở web Chi tiết lịch hẹn xem QR sau completed, trạng thái/receipt, nút Cập nhật trạng thái; tự tải lại khi quay về cửa sổ. Khách không có nút tự đánh dấu đã thanh toán. Khi lỗi đọc, UI báo không xác định thay vì coi là chưa thu.

## Báo cáo

- Giá trị dịch vụ: lịch completed, nhóm/lọc theo localDate ngày hẹn.
- Tiền chưa thu: tổng snapshot của các lịch completed thiếu payment trong khoảng ngày hẹn đã chọn, tính ở thời điểm xem hiện tại, không phải số dư lịch sử tại cuối kỳ.
- Tiền đã thu: tổng receipt theo receivedLocalDate (Việt Nam) trong khoảng chọn, gồm lịch ngày khác và receipt của lịch đã sửa hoàn tất nhầm. Không bị mất khi sửa trạng thái phục vụ.

Vì khác mốc thời gian, đã thu + chưa thu không nhất thiết bằng giá trị dịch vụ trong kỳ. Trang báo cáo có bảng tiền đã thu theo ngày/tháng và tối đa 20 liên kết lịch chưa thu để xử lý; tổng chưa thu bao gồm toàn bộ lịch phù hợp. Dashboard thêm hai số liệu đã thu hôm nay và chưa thu của lịch hôm nay. Tổng khách hàng vẫn dựa giá trị dịch vụ completed, đổi nhãn để không nhầm thành tiền thực thu.

## Kiểm thử / giới hạn bằng chứng

Test tích hợp MongoDB tạm kiểm tra quyền, scope, stale revision, thao tác lặp/đồng thời, phân biệt ngày thu/ngày hẹn. Test sửa hoàn tất nhầm chạy qua luồng EJS thật và kiểm tra receipt còn nguyên. Auth được mock ở test payment; bộ auth/hồi quy hiện có kiểm tra riêng. Không thực hiện chuyển khoản ngân hàng hay xác nhận thu tiền trên dữ liệu đang dùng để nghiệm thu.

Chờ đối chiếu sau audit website với Sheet phân công trong README. Chưa xác minh mã SOL/hàng liên quan; không suy diễn người phụ trách hoặc thời điểm hoàn thành.

### Bằng chứng kiểm tra local

- `npm run lint`: thành công toàn repository.
- `npm test`: 817 test API, 495 test mobile và 599 test web thành công.
- `npm run build`: thành công API, bundle Android/iOS và build web; không chạy trình giả lập/thiết bị.
- `npm run build:web`: thành công sau chỉnh nội dung trạng thái lịch hủy/không đến.
- Chrome: mở được popup QR và báo cáo trên database local. Không xác nhận thu tiền trên dữ liệu đang dùng. Phiên trình duyệt hiện có là Owner nên trang Customer chuyển về dashboard theo policy; phần Customer được kiểm tra bằng test API scope và test component/reader, chưa nghiệm thu trình duyệt bằng phiên Customer thật.
