# Quản lý khách hàng (Owner)

Trang EJS `/admin/khach-hang` dùng phiên Owner hiện có; menu Khách hàng nằm sau Nhân sự. Trang gọi JSON API bằng Bearer token giống trang nhân sự. Không gửi token trong URL. API kiểm tra vai trò owner, trả Cache-Control: no-store.

## Hợp đồng bổ sung

Các endpoint dưới `/api/customer-management` trả `{ status: 'success', data }`; lỗi nghiệp vụ trả `{ status: 'error', code: 'CUSTOMER_ERROR', message }`.

- `GET /`: query `q` (tối đa 120 ký tự, tìm literal tên/điện thoại), `type=all|account|guest`, `page` (1–99999). Sáu hồ sơ mỗi trang, sắp ngày tạo giảm dần rồi ID. `data={items,total,page,summary:{total,account}}`. Summary là toàn bộ khách hàng, total áp dụng bộ lọc. Tìm điện thoại Việt Nam đủ 10 chữ số đầu 0 được đổi sang +84.
- `GET /:id?page=1`: hồ sơ và tối đa sáu lịch hoàn tất, mới nhất trước. `data={id,displayName,phone,hasAccount,visits,totalSpentVnd,lastVisit,email,history,historyPage}`. Mỗi history gồm `id,names,startAt,totalPriceVnd`. Email lấy từ tài khoản liên kết, không nhận email do Owner nhập. Lịch sử có nút phân trang và liên kết chi tiết lịch hẹn.
- `POST /`: tạo khách vãng lai, body `{displayName,phone?}`, trả 201 và `{id}`. Không tạo tài khoản, không gộp khách theo điện thoại.
- `PATCH /:id`: thay thế tên và điện thoại trong hồ sơ, body tương tự POST; bỏ trống phone sẽ xóa phone. Trả `{id}`. Không cho sửa accountId, vai trò, email, trạng thái hoặc trường nội bộ. Lịch hẹn đã lưu giữ nguyên snapshot.

Tên bắt buộc, trim, tối đa 120 ký tự. Điện thoại bỏ dấu cách/dấu chấm/gạch ngang; nhận E.164 hoặc 10 chữ số Việt Nam đầu 0. ID sai trả 400, không tìm thấy trả 404. API xác thực dùng quy tắc 401/403/503 chung.

`visits`, `lastVisit` và `totalSpentVnd` chỉ tính lịch `completed`, dựa giá snapshot; không coi lịch hủy/no-show là lượt ghé. Ngày hiển thị theo Asia/Ho_Chi_Minh. Không tuyên bố đây là số tiền thanh toán thực thu.

## Tương thích và kiểm thử

Không đổi `GET /api/customers` dùng cho đặt lịch, model dữ liệu hay API web/mobile hiện có. Mobile có thể tái sử dụng các endpoint mới với cùng Bearer auth; không thêm giao diện mobile.

Test tích hợp `customers-management.test.js` chạy với MongoDB tạm bằng mongodb-memory-server; xác thực được mock để kiểm tra quyền Owner/Customer, không thay thế nghiệm thu đăng nhập hay MongoDB môi trường triển khai. Test bao phủ CRUD, số điện thoại trùng không gộp, phân trang, tìm literal, thống kê completed và trang EJS.

Chờ đối chiếu sau audit website với [Sheet phân công](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit). Chưa xác minh hàng SOL liên quan; không suy diễn người phụ trách hoặc ngày hoàn thành.

## Avatar và popup chi tiết

Bảng khách hàng dùng toàn bộ chiều rộng nội dung; nhấn tên/ảnh mở native dialog chi tiết. Dialog hỗ trợ nút đóng và Escape, giữ nguyên bộ lọc/phân trang phía sau. Avatar không có hoặc tải lỗi dùng chữ cái tên khách.

Model Customer bổ sung optional `avatar: {url, publicId}`. Không cần migration hồ sơ cũ. List/detail bổ sung `avatarUrl: string|null`, không trả publicId. Các hợp đồng đang có vẫn giữ nguyên; trang hồ sơ khách hàng tự chỉnh sửa chưa nằm trong thay đổi này.

`PUT /api/customer-management/:id/avatar` (Owner Bearer) nhận `{image: "data:image/png;base64,..."}`. Chấp nhận JPEG/PNG/WebP tối đa 2 MiB, kiểm tra base64 và chữ ký định dạng phía server; không nhận URL từ client. Ảnh được gửi qua helper Cloudinary hiện có tới folder `sol-hair-studio/customer-avatars`; chỉ lưu URL/publicId sau khi upload thành công. Trả `{id,avatarUrl}`. Cloudinary lỗi trả 502 với thông báo chung, giữ avatar cũ; 400 cho ảnh không hợp lệ, 404 khi thiếu khách, 401/403 theo auth chung. Cần cấu hình Cloudinary cloud name/API key/API secret trên server như luồng ảnh dịch vụ; không đưa secret vào trình duyệt.

Ảnh cũ trên Cloudinary được giữ lại khi thay ảnh (không tự xóa asset). Nếu lưu database thất bại sau upload, asset mới có thể chưa được liên kết; quản lý vòng đời/xóa asset chưa được bổ sung.

Test upload dùng mock helper Cloudinary để kiểm tra validation, phân quyền, lưu hồ sơ và giữ ảnh cũ khi provider lỗi; đây không phải bằng chứng đã upload lên tài khoản Cloudinary thật. Không sửa dữ liệu khách đang dùng để thử upload.
