# Quy tắc ghi và đồng thời — MVP SOL-016

BR chốt theo [đối chiếu](scope-alignment.md). Đây là thiết kế để code, chưa chứng minh DB/mail/transaction thật hoạt động.

<a id="booking"></a>
## BR-01. Tạo lịch và snapshot

Khách đăng nhập active, đúng customerId từ identity, có tên+phone. Chủ tìm phone/chọn đúng hồ sơ, chưa có tạo vãng lai; không tự link/gộp theo phone. Chọn 1–5 dịch vụ khác nhau, một stylist (kể cả chủ) làm được tất cả. Không thêm quy tắc nghề nghiệp về uốn/duỗi hay xử lý song song thuốc; thứ tự hiển thị items không tự là lịch công đoạn.

Server đọc dịch vụ active, tính tổng giá/thời lượng từ bookingDurationMinutes cố định. Lưu name/price/duration từng item và tên/phone liên hệ; không nhận total/status/duration từ client. Sửa/ẩn danh mục không đổi snapshot/giờ kết thúc lịch cũ. Đổi stylist/giờ giữ snapshot dù service đã ẩn, người mới đủ năng lực/giờ trống; đổi dịch vụ hủy rồi tạo mới dùng catalog hiện tại. Không cọc/thanh toán/fee/no-show penalty.

<a id="time"></a>
## BR-02. Thời gian và khoảng giữ

- Timezone Asia/Ho_Chi_Minh, server UTC instant. Giới hạn startAt≤server now+7×24 giờ (168 giờ), kiểm bằng UTC instant; ngày hiển thị/xếp ca dùng timezone địa phương. Vẫn phải có ca cụ thể, không tự mở tuần chưa có ca.
- Khách startAt≥server now+30 phút; giờ bắt đầu :00/:15/:30/:45, giây/millisecond 0. Chủ đặt tương lai dùng grid; **owner_walkin** lấy now server khi ghi nhận, không cho client backdate hoặc giả role.
- Thời lượng dịch vụ là tổng item; buffer sau cả lịch 10 phút, không tính vào giá/thời lượng dịch vụ. Toàn khoảng giữ nằm trong một ca active, không giao nghỉ/ca khác/lịch khác; không tự điền giờ mở cửa chưa cung cấp.
- Khoảng dùng **[start,end)**; tiếp theo có start bằng occupiedUntil được liền kề, rồi chọn mốc 15 phút hợp lệ tiếp theo. Xong 11:00 → dọn tới 11:10 → slot 11:15.

| Status | occupiedFrom | occupiedUntil |
| --- | --- | --- |
| confirmed | startAt | endAt+10 phút |
| in_progress | min(startAt,startedAt) | max(endAt,estimatedEndAt nếu có)+10 phút |
| completed | startedAt | completedAt+10 phút |
| cancelled/no_show | Giữ để đối chiếu | Không tham gia kiểm xung đột mới |

Completed mở phần giờ không dùng sau dọn, không đổi startAt/endAt đã hẹn. Bắt đầu sớm chỉ khi đã có khách, stylist rảnh, trong ca và khoảng vận hành không ảnh hưởng lịch khác. Lịch mới sau mở giờ vẫn đủ dịch vụ+dọn trước lịch kế tiếp, grid/lead-time/horizon đúng.

Nếu in_progress đã quá endAt mà chưa có ETA hợp lệ hoặc ETA cũng đã qua: **chưa biết giờ rảnh**, không quảng cáo slot giao phần đang bận cho cả stylist và mã hồ sơ khách; yêu cầu cập nhật ETA hoặc hoàn tất để tính lại. Không tự hoàn tất, dời hoặc hủy lịch. Actual ghi đúng server, không sửa sự kiện thực tế để làm cho test overlap xanh.

<a id="shifts"></a>
## BR-03. Ca, nghỉ và năng lực

Chủ tạo/xem/sửa/hủy staff_shifts theo ngày, xếp tuần một lần cho nhân viên và chính mình. Nhân viên chỉ xem ca mình. Không ca chồng cùng staff; chưa xếp ngày không mở giờ, không tự lặp weeklyHours.

Sửa/hủy ca, đặt nghỉ hoặc ngừng staff: ghi guard staff rồi kiểm mọi in_progress và confirmed còn hiệu lực bị ảnh hưởng. Không xung đột mới lưu; có xung đột không lưu, trả danh sách, chủ đổi giờ/đổi người/hủy từng lịch trước rồi thử lại. Kiểm lại tại lúc lưu, không có transaction chờ con người. completed/cancelled/no_show không bị đổi trạng thái gián tiếp.

**Không có BR chặn bỏ dịch vụ khỏi năng lực khi còn lịch** (chủ đã loại). Giữ lịch/snapshot hiện có; tạo/đổi mới kiểm năng lực hiện tại. Đây là khác biệt với baseline cũ, không tự khôi phục qua checker. Không chấm công/lương hoặc workflow nhân viên xin nghỉ/đổi ca.

<a id="concurrency"></a>
## BR-04. Chống trùng ở DB

Mọi writer ảnh hưởng availability (create/reschedule/cancel/start/complete/ETA/correction/ca/nghỉ/ngừng staff) dùng cùng quy tắc. Không dựa vào disable nút, unique(staffId,startAt), transaction chỉ ghi hai appointment khác nhau hoặc RAM lock.

1. Xác định tài nguyên từ pre-read, chỉ để biết tập guard, không coi đó là dữ liệu quyền đáng tin cậy.
2. Transaction thực sự `$inc bookingRevision` trên **customers** và **staff** cần bảo vệ; thứ tự toàn cục customer IDs sorted rồi staff IDs sorted. Đổi stylist khóa cả người cũ/mới; sửa ca khóa staff, mọi booking cũng ghi staff guard. Trần MAX_SAFE_INTEGER từ chối, không reset.
3. Đọc lại appointment/role/ca/năng lực/receipt dưới cùng session. Nếu tập tài nguyên thay đổi so với pre-read, abort và chạy lại với tập đúng, không mở khóa khác thứ tự giữa transaction.
4. Cùng staff kiểm khoảng vận hành bao gồm dọn, cùng customerId kiểm khoảng phục vụ: confirmed đến endAt, in_progress đến max(endAt,ETA), completed đến completedAt; không cộng cleanup cho khách. Khách khác chung phone không bị coi là cùng người. Bỏ current appointment khi đổi.
5. CAS `_id,revision,status`, ghi appointment + receipt/event trong cùng transaction; chỉ trả thành công sau commit.

Nếu actual kéo dài làm lịch hẹn kế tiếp bị ảnh hưởng, cho ghi nhận thực tế/ETA và cảnh báo, không giả vờ DB có thể ngăn thực tế đó. **Create/reschedule/correction** không được tạo thêm xung đột; ETA/actual được phản ánh trung thực và chủ xử lý thủ công.

Thiết kế nhắm replica set hỗ trợ transaction; topology/FCV chưa kiểm chứng. primary/snapshot/majority, tạo index trước traffic. TransientTransactionError retry body hữu hạn; UnknownTransactionCommitResult retry commit cùng transaction, không tự tạo key mới; hết retry trả trạng thái chưa xác định và cho tra lịch bằng key. Không gọi SMTP/Cloudinary hoặc Promise.all thao tác session trong transaction. [MongoDB production considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/) và [driver transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

<a id="idempotency"></a>
## Idempotency tạo lịch: 24 giờ

Unique booking_requests(actorId,key), requestHash canonical từ customerId/staffId/serviceIds/startAt/bookingMode; **walkin hash intent không gồm server-now được sinh lại mỗi retry**. Không chứa giá danh mục/snapshot tính lại. Receipt lưu appointmentId, createdAt và expiresAt=createdAt+24h. Retry cùng actor/key/payload trong cửa sổ trả cùng lịch, kiểm quyền hiện tại; khác payload từ chối. Một thao tác mới dùng key mới, retry giữ key cũ.

Receipt claim/replace + appointment insert + event created cùng transaction. Với walkin, giữ thời điểm/id đã cấp trong retry của cùng logical operation; kiểm receipt trước khi gán giờ mới. Expired receipt còn vật lý phải xử lý bằng conditional replacement/unique conflict retry, không xóa rồi insert mù. Hết 24 giờ xử lý như yêu cầu mới, vẫn guard/check trùng; không hứa at-most-once ngoài cửa sổ.

TTL expiresAt expireAfterSeconds:0 **chỉ dọn receipt**, không đảm bảo xóa đúng thời điểm; mọi lookup phải kiểm expiresAt>now. Không TTL appointments/history. [MongoDB TTL](https://www.mongodb.com/docs/manual/core/index-ttl/), [Stripe idempotency tham chiếu](https://docs.stripe.com/api/idempotent_requests).

<a id="reschedule"></a>
## BR-05/06. Vòng đời, đổi/hủy và sửa nhầm

| Thao tác | Quyền / điều kiện |
| --- | --- |
| tạo → confirmed | Customer của chính mình hoặc owner đặt hộ; commit hợp lệ tự xác nhận |
| confirmed → confirmed đổi giờ/stylist | Khách trước ≥2 giờ tính theo **giờ hẹn cũ**, thời gian/nguời mới hợp lệ; owner xử lý sát giờ có lý do; đổi lỗi giữ lịch cũ |
| confirmed → cancelled | Khách trước ≥2 giờ; owner xử lý trước khi phục vụ có lý do khi sát giờ; giải phóng khung |
| confirmed → in_progress | Stylist được giao hoặc owner; có khách/rảnh/trong ca/không ảnh hưởng lịch khác, có thể sớm |
| in_progress → completed | Stylist được giao hoặc owner; thực tế làm xong, ghi completedAt; dọn 10 phút từ lúc xong |
| confirmed → no_show | Chỉ owner, ≥start+15 phút, đã liên hệ, chưa đến/chưa startedAt |
| in_progress → confirmed (corrected) | Owner hoặc Stylist được giao lịch, bấm bắt đầu nhầm, thực tế chưa phục vụ; lý do/audit/kiểm xung đột |
| completed → in_progress (corrected) | Owner hoặc Stylist được giao lịch, bấm hoàn tất nhầm, thực tế chưa xong; lý do/audit/kiểm lại giờ đã được mở cho người khác |

Không mở cancelled/no_show; tạo lịch mới nếu khách tới sau no-show. Không cập nhật đang phục vụ như thao tác reschedule, không khôi phục mọi trạng thái tùy ý. Khi correction cần giữ lại thời gian, phải xác định khoảng cần giữ, kiểm ca/nghỉ/lịch mới; có xung đột thì không lưu, trả danh sách để chủ xử lý trước. Nếu cần ETA để biết khoảng giữ khi mở lại lịch quá giờ, phải cung cấp ETA hợp lệ trong cùng lệnh. Mọi correction lưu actor/time/reason/before/after; không xóa event cũ.

Owner reschedule: new startAt >= server-now (equality allowed on the scheduled 15-minute grid). Persisted data must satisfy lastRescheduledAt <= startAt. Validate against server-now in the service; the stored timestamp does not replace that check. Customer cutoff/lead-time and Owner late-change reason remain unchanged.


### Owner đổi lịch sau khi thống nhất với khách — SOL-037

**[Đã chốt cho Web — yêu cầu điều chỉnh SOL-037 trong phiên làm việc ngày 23/10/2026]**
Owner chỉ đổi giờ/stylist sau khi đã trao đổi và thống nhất lịch mới với khách.
Form Owner bắt buộc nhập lý do (không rỗng, tối đa 500 ký tự) cho mọi lần đổi
lịch và tự tích xác nhận đã trao đổi, thống nhất ngày/giờ/stylist mới. Không tích
sẵn; đổi lựa chọn lịch mới phải xác nhận lại. Đây là khai báo của Owner, không
phải bằng chứng khách đã xác nhận trong hệ thống.

Customer vẫn tự đổi lịch của mình theo cutoff giờ hẹn cũ ≥2 giờ và giờ mới
trước ít nhất 30 phút. Owner không chịu hai giới hạn đó; giờ mới ≥server-now,
có lý do và tuân grid/horizon, trạng thái confirmed, ca/nghỉ, năng lực,
availability, snapshot và revision hiện có. Không sửa dịch vụ hoặc tự đổi
lịch khác; không tự gửi thông báo hay mặc định khách đã đồng ý.

**[Đã triển khai trong API / giới hạn hiện tại]**
POST reschedule nhận reason và lưu vào appointment_events khi gửi; API chỉ
bắt buộc reason khi Owner đổi sát giờ (<2 giờ theo giờ hẹn cũ, kể cả quá giờ).
Web áp dụng yêu cầu lý do chặt hơn ở trên. API chưa nhận/lưu trường xác nhận
đã trao đổi hoặc sự đồng ý của khách; checkbox chỉ được kiểm tra tại Web,
không thêm vào payload và không được coi là audit xác nhận của khách.
Kiểm tra quyền, availability, revision và ghi transaction ở Backend vẫn là
nguồn xác thực cuối cùng cho các điều kiện API đã hỗ trợ.

**[Chưa triển khai / cần quyết định trước khi đổi Backend]**
Chưa có yêu cầu đổi lịch chờ khách duyệt, màn khách xác nhận, thông báo tự động
hoặc dữ liệu xác nhận trao đổi có cấu trúc trong audit. Muốn lưu/kiểm tra xác
nhận ở server hoặc bắt buộc lý do cho mọi Owner request ở API cần chốt contract
riêng trước khi triển khai; đây chưa phải contract được duyệt. Không mở rộng MVP
bằng các chức năng đó trong bước này.

Giữ lastCommand(key,actorId,hash,resultRevision) trên appointment để retry lệnh gần nhất và CAS expectedRevision ngăn ghi đè. Không hứa replay mọi lệnh cũ; stale thì GET lại, không retry mù bằng revision mới. Key tạo 24 giờ là cơ chế riêng, không áp TTL cho lastCommand/audit.

<a id="history"></a>
## BR-07/08. Lịch sử và quyền đọc

Customer chỉ lịch mình; owner toàn tiệm; stylist lịch được giao, tên/phone/thông tin cần phục vụ và lịch sử **dịch vụ đã hoàn tất** của khách đó. Không email khách, lịch hủy/no-show hoặc duyệt mọi khách. API kiểm quyền/field allowlist, không chỉ UI. Stylist chỉ đọc lịch sử khách trong ngữ cảnh lịch được giao. Không tự liên kết hồ sơ vãng lai với account mới theo số phone.


### Owner xem toàn salon và lịch trực tiếp phục vụ — SOL-037

**[Yêu cầu UX đã chốt trong phiên SOL-037 ngày 23/10/2026]**
Web Owner tách "Lịch toàn salon" (quản lý) và "Lịch của tôi" (trực tiếp phục vụ).
Lịch cá nhân phải khớp staffId của hồ sơ staff có accountId bằng accountId của
Owner đang đăng nhập; không đối chiếu tên/email, không yêu cầu thêm role stylist
cho Owner đã có hồ sơ staff. Chưa có hồ sơ liên kết thì không hiển thị lịch cá
nhân và không fallback về toàn salon. Có hồ sơ nhưng không có lịch thì danh sách rỗng.

Start/Complete cá nhân chỉ hiển thị ở tab "Lịch của tôi", khi lịch được giao đúng
hồ sơ và trạng thái lần lượt confirmed/in_progress. Tab toàn salon giữ quản lý
đổi/hủy/no-show, không bổ sung thao tác hỗ trợ Start/Complete thay stylist.
Đây là phân tách UX, không thu hẹp quyền Owner của API SOL-036. Backend vẫn quyết
định quyền, trạng thái, revision, ca/nghỉ và xung đột. Không có chức năng hỗ trợ
phục vụ thay stylist riêng được triển khai trong bước này.

Ẩn service không hủy/đổi lịch cũ; snapshot name/price/duration không cập nhật theo catalog. Ngừng staff chặn nếu còn lịch chưa kết thúc; xử lý trước, giữ lịch sử. Lịch completed không đồng nghĩa đã thanh toán; không trạng thái paid. Không giới hạn tái phạm/đếm no-show để khóa khách.

<a id="overrun"></a>
## BR-09. ETA và audit

Stylist phụ trách/owner cập nhật estimatedEndAt mới khi in_progress, server kiểm giờ tương lai và after planned end; không sửa startAt/endAt hoặc item duration. occupiedUntil=max(planned end,ETA)+10 phút; hiển thị lịch affected, chủ liên hệ đổi/hủy, không tự dời. actual/ETA không tự chuyển status. Hoàn tất sớm giảm khoảng vận hành tới completedAt+10 phút; giữ hẹn sau, slot mới phải đủ dịch vụ+dọn trước hẹn sau.

appointment_events append-only theo revision, ghi trong cùng transaction. Bounded before/after chỉ field lịch cần đối chiếu; không copy toàn hồ sơ hoặc secret. Lưu created và thay đổi để theo dõi correction; unique appointmentId+revision. Audit giữ dài hạn theo chính sách lưu trữ sẽ xác định, không TTL 24 giờ. Sửa nhầm không được delete dấu vết để làm dữ liệu trông chưa từng xảy ra.

<a id="auth"></a>
## OTP và khôi phục

OTP email 6 chữ số cryptographically random, hạn 5 phút, dùng một lần; resend sau 60 giây thay generation/digest và vô hiệu mã cũ; sai đủ 5 lần vô hiệu mã, xin lại vẫn phải chờ cooldown. Check expiry/attempt/generation/account/purpose tại backend, atomic conditional write để không hai verify cùng thành công.

Khách signup pending với password hash, OTP đúng mới active. Staff do chủ tạo email, OTP đúng mới được proof hạn chế để tự đặt password; chỉ active khi verify+hash cùng được hoàn tất. Reset proof một lần chỉ đổi password của đúng account; không tự active disabled account hoặc nâng role. Dùng password KDF phù hợp, OTP digest có secret server chống vét 1 triệu mã khi DB lộ; secret không ở DB. TTL/delete không phải điều kiện bảo mật. [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [OTP guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

Owner một account gắn staff; quên password qua OTP; mất email hỗ trợ thủ công xác minh/biên nhận vận hành, không tự cấp lại từ phone. Gửi email lỗi không kích hoạt. Không log code/hash/grant/password. UI gửi lại không thay backend rate limit.

<a id="images"></a>
## Ảnh và tính tương thích

M2 owner upload ảnh khi thêm/sửa service. Giữ metadata/URL Cloudinary, không overwrite asset hoặc làm mất lịch sử; upload ngoài DB transaction. Upload thành công nhưng DB chưa rõ commit phải đối chiếu asset receipt trước cleanup/retry, không xóa ngay có thể đang dùng. Ngưỡng file và gallery thuộc đặc tả kỹ thuật review ở M2; không tự triển khai kho ảnh tổng/gallery/purge hay bắt ảnh lịch sử theo ảnh mới. Public DTO vẫn đúng 8 field, URL cover archive đã liên kết vẫn resolve.
