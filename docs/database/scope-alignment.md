# SOL-011 → SOL-016: đối chiếu MVP

Nguồn: [PHẠM VI](https://docs.google.com/spreadsheets/d/1mKBFo0c1PcSJEVwbI80AAsorL47a7VyGk-nE0hIGLbw/edit?gid=785319952#gid=785319952), chủ dự án duyệt 13–14/10/2026. Đây là đối chiếu thiết kế, không phải backlog hoặc bằng chứng code đã có.

| Baseline SOL-011 | MVP / SOL-016 |
| --- | --- |
| Có receptionist | Chỉ customer/stylist/owner; chủ tiếp nhận và quản lý |
| Chủ có thể tách tài khoản stylist | Một account owner gắn staff, áp dụng năng lực/ca như stylist |
| Auth/reset chưa thiết kế | Email/password hash; pending trước OTP; chủ tạo nhân viên email → OTP → tự đặt password → active |
| Chưa có OTP | 6 số/5 phút/một lần; resend ≥60 giây vô hiệu generation cũ; sai 5 lần vô hiệu mã; đúng account/purpose |
| Vãng lai có thể thiếu phone | Hồ sơ chưa hoàn thiện có thể thiếu phone; mọi booking cần tên + phone; tìm/chọn đúng hồ sơ, không tự gộp chung số |
| Chỉ guard stylist | Thêm guard customer theo mã hồ sơ; phone không unique |
| 1–3 dịch vụ | 1–5, một stylist đủ năng lực; không thêm quy tắc nghề nghiệp về kết hợp/thứ tự chưa duyệt |
| Bước 5 phút/horizon 90 ngày | 15 phút, khách trước ≥30 phút/tối đa 7 ngày, đủ dịch vụ+dọn trong ca |
| Mọi start đều grid | Chủ đặt khách tới ngay lấy giờ server thực tế, không nhập quá khứ |
| weeklyHours lặp vô hạn | staff_shifts theo ngày; xếp từng tuần, chưa có ca không mở booking |
| Sửa ca/nghỉ/năng lực đều chặn | Giữ chặn xung đột ca/nghỉ/ngừng staff; bỏ BR chặn bỏ năng lực khi còn lịch đã bị loại |
| Khách đổi/hủy trước start | Cutoff ≥2 giờ; sát giờ liên hệ chủ, xử lý có lý do; đổi dịch vụ hủy/đặt lại |
| Completed giữ khung cũ | Giữ giờ hẹn/snapshot; khoảng vận hành completed kết thúc completedAt+10 phút; mở giờ đủ điều kiện |
| Chỉ bắt đầu từ startAt | Cho sớm nếu khách tới, stylist rảnh, trong ca, không ảnh hưởng lịch khác |
| Quá giờ chặn cả ngày | Stylist phụ trách/chủ nhập estimatedEndAt, cộng 10 phút để cảnh báo; không tự dời lịch |
| Không mở trạng thái cuối | Chỉ chủ sửa nhầm in_progress→confirmed hoặc completed→in_progress; xung đột/lý do/audit; không mở cancelled/no_show |
| lastCommand, chưa audit đầy đủ | Giữ receipt lệnh gần nhất; appointment_events riêng giữ dấu vết |
| requestKey trên appointment, vĩnh viễn | booking_requests 24 giờ; TTL chỉ dọn, service kiểm expiry; không TTL lịch/audit |
| No-show chỉ mốc 15 phút | Chủ đã liên hệ, khách chưa tới/chưa phục vụ; không phạt; tới lại tạo lịch mới |
| Kho ảnh/gallery editor là đề xuất | Giữ metadata; upload dịch vụ M2, không mở scope kho/gallery/purge |

## Ranh giới để code song song

| Module | Ghi / đầu ra | Đọc dùng chung |
| --- | --- | --- |
| M1 | Account/OTP/customer link; identity tin cậy accountId/roles/status | Staff link khi cấp tài khoản; không tạo ca/lịch |
| M2 | Service/ảnh; DTO cũ, bookingDurationMinutes nội bộ | Identity M1; không sửa snapshot lịch |
| M3 | Staff/năng lực/ca/nghỉ/ngừng hoạt động | Service IDs; lịch hiệu lực; cùng guard staff |
| M4 | Khách vãng lai/giờ trống/tạo appointment/receipt | Identity/customer M1, giá/thời lượng M2, ca M3, actual/ETA M5 |
| M5 | Đọc/đổi/hủy/lifecycle/ETA/correction/audit | Cùng appointments/guard/availability M4, không kho lịch thứ hai |

M4/M5 dùng một bộ reservation/transaction trong module lịch hẹn, phân ranh theo thao tác. JSON mẫu giúp làm UI/test song song; endpoint document đầy đủ được sinh/cập nhật cùng code lúc tích hợp.

## Giới hạn

Không payment/cọc/điểm thưởng, chi nhánh/lễ tân/payroll, AI/hold slot hoặc tự thông báo khách. Email OTP thuộc MVP; nhắc lịch và yêu cầu nghỉ/đổi ca là sau MVP. Không đếm/phạt/hạn chế khách bỏ hẹn nhiều lần. Không BR riêng cho đổi stylist khi dịch vụ ẩn: người mới đủ năng lực/giờ trống, giữ snapshot.

Giới hạn ảnh/gallery/pagination và thuật toán password hashing cụ thể là đặc tả kỹ thuật cần review, không giả là BR mới. Môi trường DB/FCV/SMTP/Cloudinary và hiệu năng chưa kiểm chứng; đây không phải lệnh migration hay tuyên bố đạt rubric.

## Bổ sung nền tảng Stylist Web — SOL-037

**Đã được yêu cầu trong phiên SOL-037 ngày 23/10/2026:** ngoài Mobile là nền tảng
chính theo kế hoạch ban đầu, Stylist được hỗ trợ Web tại /nhan-vien/lich-hen và
trang chi tiết tương ứng. Đây là mở rộng nền tảng, không thêm quyền nghiệp vụ.

**Phạm vi đã triển khai:** xem lịch được giao theo ngày salon, cursor pagination,
chi tiết/contact/snapshot/thời gian thực tế theo allowlist và Start/Complete bằng
API SOL-035/036 hiện có. Backend tự scope theo hồ sơ Staff của tài khoản, không
lấy toàn salon rồi lọc ở trình duyệt. Owner vẫn dùng hai tab quản lý/cá nhân riêng;
Stylist không có quyền quản lý toàn salon, đổi/hủy/no-show hoặc sửa nhầm.

**Giới hạn:** API danh sách Stylist chưa hỗ trợ filter status; DTO chưa có ghi chú
phục vụ. Web không dựng các trường đó và không lọc status từ một trang dữ liệu.
ETA được bổ sung riêng ở Bước 9 bên dưới; contextual history UI, correction
và notifications không nằm trong lần bổ sung Stylist Web ban đầu. Không tạo API hoặc sửa schema/DB cho Web.
File Excel kế hoạch tổng không có trong checkout tại thời điểm triển khai; chưa
cập nhật hàng phân công và không tạo một file kế hoạch thay thế.

## Owner/Stylist Web ETA — SOL-037 Bước 9

**Quy tắc đã chốt:** BR-02/04 và API SOL-036 ETA: Owner hoặc Stylist được giao
cập nhật lịch in_progress; ETA > giờ server và > endAt, cộng 10 phút dọn cho
khoảng giữ stylist. Không đổi giờ hẹn/snapshot, không tự dời/hủy lịch khác hoặc
tự hoàn tất. Không mở rộng quyền nghiệp vụ.

**Web đã triển khai:** dialog ETA dùng chung ở chi tiết Owner (cả phạm vi toàn
salon/cá nhân) và Stylist; xác nhận, revision/idempotency/retry, refresh và cảnh
báo theo response Backend. Customer không có thao tác ETA. Start/Complete cá
nhân và các luồng đổi/hủy giữ nguyên.

**API thực tế / bổ sung được duyệt:** POST ETA trả ETA và danh sách bị ảnh hưởng
đúng role; GET chi tiết được bổ sung estimatedEndAt cho Owner/Stylist trên lịch
in_progress để đọc lại ETA sau reload. Không thêm API, sửa thuật toán hoặc DB.

**Đọc lại cảnh báo đã triển khai:** GET chi tiết Owner/Stylist tính lại danh sách
bị ảnh hưởng khi lịch in_progress có ETA, dùng cùng calculator với POST và đọc
cùng snapshot. F5/mở lại trang vẫn có cảnh báo hiện tại; cảnh báo mới từ GET
thay kết quả POST cũ ngay cả khi revision lịch không đổi. Stylist chỉ thấy lịch
cùng Staff; xung đột ngoài phạm vi chỉ có cờ cần Owner xử lý. Customer không có
dữ liệu ETA/cảnh báo. GET không ghi guard/revision/event hoặc tự xử lý lịch.

**Giới hạn:** Cảnh báo cập nhật khi đọc/lưu, chưa đẩy realtime hoặc gửi thông báo. Mobile/correction/notification ngoài bước này. Không cập nhật
Excel phân công vì checkout không có file; không tạo kế hoạch thay thế.

## SOL-037-13 — Chủ sửa nhầm và xem audit trên Web

**Nghiệp vụ đã chốt:** giữ BR-05/06: chỉ Owner sửa in_progress → confirmed khi
chưa thực sự phục vụ, hoặc completed → in_progress khi thực tế vẫn phục vụ.
Bắt buộc lý do/xác nhận; ETA trong cùng request nếu giờ kế hoạch đã hết. Backend
kiểm revision, ca/nghỉ và lịch khác; xung đột thì không ghi. Event cũ được giữ.

**Đã triển khai:** thao tác quản trị riêng ở chi tiết Owner cả salon/cá nhân,
dialog lý do/xác nhận/ETA, lỗi và chi tiết xung đột theo API SOL-036. Revision,
idempotency, retry cùng intent, refresh chi tiết/danh sách/audit dùng lại cơ chế
hiện có. Không thêm quyền Customer/Stylist hoặc khôi phục cancelled/no_show.

**Bổ sung API đã được duyệt trong phiên SOL-037-13:** GET
/api/appointments/:appointmentId/audit, chỉ Owner, chỉ đọc appointment_events.
Trước bước này chưa có API audit; service-history không thay thế audit. Dùng
index appointmentId/revision có sẵn, trang 20 (tối đa 50), mới nhất trước theo
revision, cursor ràng buộc lịch. Không đổi schema/index hoặc dữ liệu hiện có.

**Audit Web đã triển khai:** timeline event thật, actorId, thời gian, hành động,
before/after và reason khi có; loading/empty/error/retry/phân trang; refresh sau
Correction, không bỏ event cũ. Chỉ mount trên Owner detail.

**Giới hạn:** event chưa lưu snapshot tên/vai trò actor, nên không suy diễn từ
tài khoản hiện tại. Không tạo event giả/backfill, chỉnh/xóa audit, realtime hoặc
Mobile. Excel kế hoạch không có trong checkout, không tạo backlog thay thế.
Kiểm thử tự động không thay thế nghiệm thu trình duyệt/dữ liệu salon thực tế.

## SOL-038 — Mobile Appointment Management, Bước 1

**Phạm vi được người dùng xác nhận theo Sheet trong phiên triển khai:**
Customer quản lý lịch của mình; Stylist quản lý lịch được giao và phục vụ.
Owner Mobile ngoài SOL-038. Checkout không có Excel; không tuyên bố đã đọc
hoặc cập nhật hàng phân công chính thức.

**Đã triển khai Bước 1:** màn CustomerAppointments (“Lịch hẹn của tôi”), danh
sách từ GET /api/appointments?limit=20&cursor=..., Bearer session qua helper
Mobile. Chỉ Customer active không có role ưu tiên Owner/Stylist được dùng màn;
trước mỗi trang kiểm tra lại GET auth/me và đúng account của phiên. Backend
vẫn là nơi scope ownership. DTO được allowlist, không đưa contact/audit ra UI.

Sắp tới gồm confirmed/in_progress; lịch sử gồm completed/cancelled/no_show,
không tự đổi trạng thái theo đồng hồ. API chưa có filter tab: giữ cursor DESC
của Customer, hiện “còn trang” và nút tải thêm ở cả tab; không kết luận rỗng
hoặc đếm đầy đủ khi còn trang. Giờ hiển thị theo Asia/Ho_Chi_Minh; giá là snapshot
“Giá theo lịch”, không suy diễn thanh toán.

Pull-to-refresh, focus và foreground đọc lại trang đầu; blur/background hủy
request, bỏ response cũ. Reader theo token/account và xóa dữ liệu khi phiên
không hợp lệ; dedup request/ID và chặn cursor lặp. Nút Customer “Lịch hẹn”
đi vào màn mới, Stylist vẫn giữ màn ca làm. Booking/Profile giữ đường dẫn cũ;
login từ lịch hẹn trả về màn phù hợp role.

**Chưa triển khai trong bước này:** Detail/Cancel/Reschedule, Stylist Appointment
Management, Owner Mobile. Không có route chi tiết Mobile nên card chưa có
nút giả dẫn đến màn khác. Không thêm API, dependency hoặc thay đổi database.
Tests kiểm API adapter/reader/lifecycle/policy/presentation; native export
không được xem là nghiệm thu UI trên thiết bị.

## SOL-038 — Bước 2: Customer Mobile Appointment Detail

**Đã triển khai:** card ở danh sách mở CustomerAppointmentDetail bằng appointmentId.
Native stack định danh màn theo ID để bấm nhanh không tạo nhiều bản cùng lịch;
Back giữ luồng danh sách hiện tại. Params thiếu/sai định dạng được báo rõ và không
gửi request chi tiết.

GET /api/appointments/:appointmentId dùng Bearer qua helper Mobile. Trước khi
đọc, kiểm tra lại account active/role Customer của phiên. Backend vẫn quyết định
ownership; 404 được mô tả chung cho lịch không tồn tại hoặc ngoài phạm vi.
UI chỉ nhận DTO allowlist Customer, giữ revision thật, snapshot dịch vụ/giá,
stylist, thời gian dự kiến theo Việt Nam và actual timestamps nếu API có trả.
Không truy vấn danh mục hiện tại thay snapshot; không suy diễn thanh toán.

Có loading, lỗi/retry, 401/403/404; focus/foreground đọc lại; blur/background,
đổi ID/account/token bỏ request và dữ liệu cũ. Không có nút Cancel/Reschedule
trong bước này. Không sửa Backend/database hoặc thêm dependency.

Kiểm chứng tự động gồm API adapter, reader/lifecycle/isolation, presentation và
native stack router. Expo export chỉ kiểm tra bundle Android/iOS; chưa thay thế
smoke test thao tác/render/back thực tế trên thiết bị hoặc emulator.
