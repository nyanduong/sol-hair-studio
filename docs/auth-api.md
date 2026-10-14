# SOL-017 — API tài khoản, OTP và phân quyền

API dùng chung cho SOL-018 (web) và SOL-019 (mobile). Không có UI trong SOL-017.
Nguồn phân công: https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit

## Cấu hình và chạy

Chạy `npm ci` ở root. Đặt cấu hình trong `apps/api/.env` cục bộ; không commit:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/sol_hair_studio?replicaSet=rs0
AUTH_SECRET=<random secret with at least 32 bytes>
SMTP_HOST=<mail provider host>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<provider username>
SMTP_PASSWORD=<provider password>
MAIL_FROM=<verified sender>
```

Đây là tên biến và placeholder, không phải thông tin đăng nhập thật. SMTP port 465 thường dùng SMTP_SECURE=true; port 587 dùng STARTTLS, production bắt buộc TLS. Không có fallback gửi mail giả. Thiếu secret trả 503; gửi mail lỗi trả 502 và tài khoản vẫn pending. Gửi lại OTP sau 60 giây để phục hồi. Account/customer/challenge được tạo cùng transaction nên lỗi ghi DB không để tài khoản dở dang.

Chạy `npm run dev:api` ở root. MongoDB phải hỗ trợ transaction (replica set hoặc cluster phù hợp). Không chạy auth trên MongoDB standalone. Health và catalog hiện có vẫn giữ đường dẫn cũ.

MongoDB standalone không đủ cho chức năng này. Máy phát triển hiện dùng MongoDB Windows service ở cổng 27017 với replica set `rs0`, không phụ thuộc thư mục `.local/` hoặc DB cổng 27018. Máy khác cần tự cấu hình replica set hoặc MongoDB Atlas. Có thể dùng Postman để đăng ký, nhập OTP nhận qua email, kích hoạt và đăng nhập.

## Hợp đồng HTTP

Prefix `/api/auth`. Thành công: `{status:"success",data:...}`. Lỗi: `{status:"error",code,message}`. Các response auth có `Cache-Control: no-store`.

| Method/path | Body | Kết quả / quyền |
| --- | --- | --- |
| POST /register | email,password,displayName,phone? | 201: account pending customer, gửi OTP |
| POST /activate | email,code | Kích hoạt customer |
| POST /resend-activation | email | Gửi lại OTP customer |
| POST /otp/request | email,purpose | Cấp/gửi lại OTP đúng purpose |
| POST /otp/verify | email,purpose,code | Customer active; staff/reset nhận grant hạn chế |
| POST /password/complete | email,purpose,grant,password | Staff tự đặt password hoặc reset |
| POST /forgot-password | email | Alias request purpose=reset_password |
| POST /reset-password | email,grant,password | Alias complete purpose=reset_password |
| POST /login | email,password | token,tokenType,expiresAt,account |
| POST /logout | {} | Thu hồi phiên hiện tại, cần Bearer |
| GET /me | — | Account và customer của chính mình, cần Bearer |
| PATCH /me | displayName,phone? | Cập nhật customer của chính mình |
| POST /staff | email | 201: stylist pending; chỉ owner active |

purpose chỉ nhận `activate_customer`, `activate_staff`, `reset_password`. Client truyền role/status/actor/accountId không được sử dụng để cấp quyền. Email trim/lowercase; mật khẩu 8–128 ký tự; tên 1–120; phone nếu cung cấp phải E.164. Phone không unique; không tự gộp hồ sơ theo số điện thoại.

### Các luồng

1. Customer: register → nhận OTP → activate → login.
2. Staff: owner gọi /staff → nhân viên nhận OTP → /otp/verify với activate_staff → /password/complete cùng purpose và grant → login. Trước hoàn tất password không được active. Grant không phải phiên đăng nhập.
3. Reset: /forgot-password → /otp/verify với reset_password → /reset-password với grant → login bằng mật khẩu mới. Mật khẩu cũ và mọi phiên cũ mất hiệu lực; disabled không được tự active.

OTP 6 số, hạn 5 phút, dùng một lần; resend sau 60 giây, thay generation/digest và vô hiệu mã/proof cũ. Sai đủ 5 lần vô hiệu generation; hết hạn vẫn phải chờ cooldown. Grant chỉ dùng một lần, đúng account/purpose/generation/authRevision, hạn không vượt hạn OTP ban đầu. Client hết thời gian phải xin OTP mới. OTP tiêu thụ và thay đổi account nằm cùng transaction. Sai OTP được ghi attempt trước khi trả lỗi. Không TTL auth_otps; TTL chỉ dọn auth_sessions, backend vẫn kiểm hạn phiên.

### Phiên và tích hợp quyền

Gửi `Authorization: Bearer <token>`; token ngẫu nhiên 256 bit, hạn 8 giờ, DB chỉ lưu SHA-256 digest. Client giữ token theo cơ chế lưu trữ an toàn của nền tảng, xóa khi logout/401; không đưa vào URL hoặc log. Logout thu hồi phiên hiện tại. Password/email/status thay đổi cần tăng authRevision để vô hiệu tất cả phiên/proof cũ. Không có refresh token; hết phiên cần đăng nhập lại.

`requireAuth` từ `apps/api/src/middlewares/auth.js` xác minh phiên và account active, gắn `request.identity` gồm accountId,roles,status,authRevision,sessionId và customerId nếu có. `requireRoles('owner')` hoặc `requireRoles('stylist','owner')` kiểm role. Không tin role hoặc identity do body/header tùy ý gửi lên.

M2 chỉ cho owner ghi service/upload. M3 gọi `createStaffAccount({actorId,actorRevision,email,ip})`, dùng accountId trả về để gắn staff; M3 chịu hồ sơ/năng lực/ca và xử lý staff không active. Gửi mail thất bại vẫn có account pending: tìm lại theo email và resend, không tạo account khác. Chức năng này chưa tạo hồ sơ staff thay M3.

M4/M5 lấy customerId từ identity; stylist phải map staff.accountId rồi kiểm lịch được giao. Role gate không thay kiểm ownership hoặc allowlist trường dữ liệu: customer chỉ lịch mình, stylist chỉ lịch được giao và lịch sử completed liên quan; không email khách/lịch cancelled/no_show. Các endpoint ca/lịch do module tương ứng triển khai, không tạo endpoint giả trong M1. Owner không cần role stylist thứ hai.

Rate limit hiện tại: tối đa 20 yêu cầu/IP và 10 yêu cầu/email mỗi 15 phút trong một process API; IP lấy `req.ip`, không tự tin X-Forwarded-For. Chạy nhiều replica phải chuyển limiter sang kho dùng chung trước khi triển khai. Reverse proxy cần cấu hình trust proxy theo topology cụ thể, không bật tin mọi proxy.

## Khởi tạo owner

Không có public signup owner và không có script seed owner. Người vận hành cần khởi tạo account owner bằng quy trình quản trị DB được nhóm thống nhất, dùng passwordHash tạo bằng hàm hashPassword của dự án, email đã được xác minh và một staff profile liên kết để nhận lịch. Không lưu mật khẩu thô vào DB. Unique partial index bảo vệ một owner; không tạo owner thứ hai hoặc ghi đè tài khoản có sẵn. Owner quên password dùng reset; mất email phải xác minh thủ công, có biên nhận/audit vận hành và tăng authRevision, không cấp quyền từ phone.

## Kiểm chứng và bàn giao

`npm test --workspace @sol-hair/api` chạy unit/model và integration HTTP với mongod 8.0.17 replica set tạm, dữ liệu giả, không dùng MONGODB_URI của người dùng. Lần đầu cần tải MongoDB binary. Kiểm tra unique index thật, transaction rollback, OTP đồng thời/resend/attempt, grant sai purpose/account/hết hạn/tái dùng, staff/owner/customer gates, reset, session expiry/logout/disabled, ownership hồ sơ và SMTP qua server nhận mail cục bộ.

Nghiệm thu ngày 15/10/2026: SMTP Gmail đã gửi tới hộp thư do người dùng chỉ định; người dùng cung cấp OTP nhận trong email mới nhất và API activate đã được gọi thành công. Các bước chặn mã tái dùng, login, me, chặn customer cấp nhân viên, logout và từ chối phiên cũ đều PASS. Dùng replica set dev thật trên loopback với DB smoke riêng đã tự xóa, không ghi vào DB nhóm. Không lưu mã, địa chỉ email, mật khẩu hoặc token thật trong tài liệu này.

Các lệnh `npm run lint`, `npm test` (106 test: API 64, mobile 28, web 14), `npm run build` và checker DB baseline đã PASS. Export Android/iOS không chứng minh UI native đã chạy. Nghiệm thu UI Web/Android và luồng xuyên module theo SOL-020 cần bằng chứng riêng. Chỉ đánh dấu Hoàn thành trên Sheet sau review/CI/nghiệm thu/merge PR.

MongoDB cũ cổng 27017 đã chuyển sang `rs0`, giữ dữ liệu và được kiểm tra HTTP login, đọc hồ sơ bằng token, logout thành công cho 7 tài khoản mẫu (1 owner, 3 stylist, 3 customer). Không thêm file seed hoặc mật khẩu mẫu vào source.

Tham khảo triển khai: [Node crypto](https://nodejs.org/api/crypto.html), [Mongoose transactions](https://mongoosejs.com/docs/transactions.html), [Nodemailer SMTP](https://nodemailer.com/smtp).

Tên runtime `auth_otps` thay cho `auth_challenges` trong baseline SOL-016 để dễ hiểu: lưu trạng thái OTP và proof đặt/reset mật khẩu. Đây là đổi tên collection, không đổi nghiệp vụ hoặc hợp đồng HTTP. DB có dữ liệu cũ cần rename collection, không xóa mã/cooldown.
