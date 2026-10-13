# Quy tắc nghiệp vụ — PROPOSED

Các quyết định dưới đây cần chủ task duyệt trong [review](review.md#quyet-dinh). Schema đầy đủ ở [schema.md](schema.md); workload/index ở [queries-and-indexes.md](queries-and-indexes.md).

<a id="booking"></a>
## B1. Đặt lịch và snapshot

- Một tiệm, một stylist/lịch. Có thể chọn 1–3 dịch vụ khác nhau, làm nối tiếp theo thứ tự `items`. Không chia một lịch cho nhiều stylist, không cho xử lý song song thời gian chờ thuốc nhuộm.
- Client gửi customerId (hoặc lấy từ account đang đăng nhập), staffId, serviceIds theo thứ tự, startAt và requestKey. Server kiểm quyền, tồn tại, staff active và làm được mọi dịch vụ; lấy giá/thời lượng từ danh mục. Từ chối giá/duration/tổng/status do client tự gán.
- `bookingDurationMinutes` do chủ tiệm chốt từng dịch vụ; nằm trong khoảng hiển thị và là bội 5. Mẫu đề xuất: cắt 60, nhuộm 120, spa 75 phút. Chưa có field hợp lệ thì **dịch vụ chỉ được xem, chưa cho đặt**. Không fallback sang trung bình hoặc max âm thầm.
- Tối đa 480 phút dịch vụ/lịch; thêm 10 phút dọn cuối cả lịch. `endAt = startAt + sum(items.durationMinutes)`; `occupiedUntil = endAt + 10 phút`. Cả khoảng giữ phải nằm trong một ca liên tục.
- Tiền VND nguyên: mỗi item 0..100000000, tổng <=300000000, server cộng các số nguyên đã kiểm tra. Không có thuế/giảm giá/phí/làm tròn trong v1; giá thập phân bị từ chối, không tự round. Tổng là giá xác nhận lúc đặt, chưa đại diện thanh toán.
- Snapshot item được chốt khi tạo, không đổi khi sửa danh mục. Đổi giờ/người làm giữ nguyên items/giá/duration; chỉ cập nhật staffNameSnapshot nếu đổi stylist. Muốn đổi gói dịch vụ: hủy rồi tạo lịch mới theo giá mới, phải xác nhận rằng không giữ slot cũ qua hai thao tác đó. Không triển khai đổi gói ngầm dưới tên đổi giờ.
- Snapshot liên hệ giữ nguyên cho lịch sử; sửa thông tin liên hệ một lịch confirmed được phép theo quyền, revision và guard. Không tự đồng bộ toàn bộ lịch cũ khi sửa customer.
- Danh mục có thể đổi cùng lúc booking: bản nháp chấp nhận **giá/active của snapshot DB tại transaction tạo**; cập nhật sau đó chỉ ảnh hưởng lần tạo tiếp theo. Nếu cần giá luôn mới nhất tại thời điểm commit, phải duyệt thêm cơ chế tranh chấp với cập nhật catalog; v1 chưa chọn chi phí khóa catalog đó.

<a id="schedule"></a>
## B2. Thời gian và lịch làm/nghỉ

Múi giờ tiệm đề xuất `Asia/Ho_Chi_Minh`. UTC Date là instant; ca tuần dùng weekday ISO và phút từ 00:00 địa phương. `localDate` là kết quả chuyển startAt theo timezone, không cắt chuỗi UTC. Ví dụ ngày `2026-10-05` có biên UTC `[2026-10-04T17:00:00Z, 2026-10-05T17:00:00Z)`.

Mọi khoảng dùng **[start, end)**: hai lịch có `new.start == existing.occupiedUntil` được liền kề; bắt đầu tại existing.endAt còn nằm trong buffer nên bị từ chối. Đặt trước tối đa 90 ngày địa phương; startAt >= thời gian server hiện tại, giây/millisecond=0, bội 5 phút. Không đặt qua 00:00 local; biên phải occupiedUntil được bằng 00:00 ngày sau (biên kết thúc, không chiếm ngày sau). Các ca không vượt ngày. Không kéo lịch qua giờ nghỉ giữa hai ca.

Ca lặp ở staff.weeklyHours; staff_time_off là nghỉ ngoại lệ UTC, cho phép tối đa 31 ngày/document. Chặn khi khoảng nghỉ giao khoảng giữ. Khi cập nhật ca/năng lực/nghỉ/isActive, lấy cùng guard staff rồi kiểm mọi lịch đang bảo vệ: **mọi in_progress bất kể startAt**, cùng confirmed có occupiedUntil>now. Có lịch vi phạm thì từ chối thay đổi kèm danh sách cần xử lý; không sửa hồi tố các lịch completed theo ca hiện tại. Chủ tiệm phải chủ động xử lý từng lịch trước. Không xóa lịch tự động; transaction không chứa thao tác chờ con người.

Tách rõ ba thứ: ca làm cho biết có thể làm; reservation `[startAt,occupiedUntil)` cho biết đã hứa thời gian; startedAt/completedAt ghi nhận thực tế. Hoàn tất sớm vẫn giữ buffer/khung cũ để không thay đổi lịch trống bất ngờ. Không cho bắt đầu lịch kế tiếp khi stylist còn một lịch in_progress hoặc chưa hết 10 phút sau completedAt gần nhất. Tạo/đổi và màn hình lịch trống cũng phải kiểm new.startAt >= completedAt gần nhất +10 phút khi mốc đó còn ở tương lai; kiểm dưới guard khi ghi. Với lịch in_progress đã quá endAt, từ chối tạo/đổi vào phần còn lại của **ngày local hiện tại của server**, kể cả lịch bắt đầu từ ngày trước, và báo lễ tân; ghi completedAt thật dù muộn. Các lịch đã hẹn kế tiếp có thể bị chậm thực tế: phải xử lý thủ công, không giả vờ có thể sửa sự kiện thực tế bằng unique index. V1 không tự dời dây chuyền, không có gia hạn tự động.

V1 bảo vệ tài nguyên stylist. Chưa chốt chính sách chặn một customer có hai lịch đồng thời trên hai stylist, nên không tuyên bố customer-level concurrency được bảo vệ. Bộ mẫu dùng khách khác nhau cho ca song song; nếu yêu cầu chặn theo customer, cần duyệt guard customer cùng thứ tự khóa trước khi triển khai.

<a id="states"></a>
## B3. Trạng thái, quyền và timestamps

Quyền được kiểm ở service layer từ account tin cậy, cùng trên web/mobile. Khách chỉ xem/sửa lịch thuộc customer gắn account; lễ tân/chủ tiệm xem lịch vận hành; stylist chỉ xem lịch được giao. Không trả toàn bộ hồ sơ khách cho public.

| Từ → đến / thao tác | Ai | Điều kiện | Timestamp/giữ lịch |
| --- | --- | --- | --- |
| tạo → confirmed | Khách của chính mình; receptionist/owner đặt hộ | B1/B2 và transaction thành công | confirmedAt=server now; chặn lịch |
| confirmed → confirmed (đổi lịch) | Cùng quyền đặt | server now < cả startAt cũ và mới; expectedRevision đúng; gói giữ nguyên | lastRescheduledAt; chặn khung mới sau commit |
| confirmed → confirmed (sửa liên hệ) | Khách sở hữu; receptionist/owner | Trước startAt; expectedRevision đúng; chỉ sửa customerSnapshot, không đổi customerId | updatedAt và lastCommand; khung giữ nguyên |
| confirmed → cancelled | Khách sở hữu; receptionist/owner | server now < startAt; không đang phục vụ | cancelledAt; giải phóng reservation sau commit |
| confirmed → in_progress | Stylist được giao; receptionist/owner | startAt<=now<endAt; cùng localDate; staff active, không nghỉ; không có lịch in_progress khác, buffer thực tế trước đã hết; không backdate | startedAt; chặn lịch |
| in_progress → completed | Stylist được giao; receptionist/owner | now>=startedAt; ghi thời gian thực tế | completedAt; vẫn chặn khung đã giữ tới occupiedUntil |
| confirmed → no_show | Receptionist/owner | now>=startAt+15 phút; chưa startedAt | noShowAt; giải phóng reservation |

`cancelled`, `no_show`, `completed` là trạng thái cuối; không mở lại. Chặn overlap theo trạng thái **confirmed, in_progress, completed**, bao gồm buffer. Completed giữ khoảng đã được dùng trong lịch sử; chỉ xét tương lai khi đặt mới. Lịch confirmed bị bỏ quên từ ngày trước không được bắt đầu hôm nay; lễ tân ghi no_show rồi đặt lịch mới nếu khách tới. Không có pending/hold/paid. Chuyển sai state hoặc revision trả conflict; role sai trả forbidden. Không cho stylist tự đổi giá/gói. Nếu chủ tiệm cần hủy sau giờ bắt đầu hoặc cutoff khác, đó là quyết định mới, chưa tự cho phép.

<a id="concurrency"></a>
## B4. Chống chồng lịch bằng guard trên staff

Điều kiện interval giao nhau:

```text
existing.start < new.end AND existing.end > new.start
// start = startAt; end = occupiedUntil (có buffer)
// cùng staffId và status ∈ {confirmed, in_progress, completed}
```

**Cơ chế chính:** trong transaction, trước khi kiểm lịch trống, thực sự ghi `$inc:{bookingRevision:1}` vào document `staff._id=S`. Mọi đường ghi làm thay đổi lịch, trạng thái, ca hoặc nghỉ của S bắt buộc làm như vậy. Hai request trên cùng stylist cùng ghi **một document**, vì vậy không thể độc lập commit hai appointment mới dựa trên cùng ảnh chụp “trống”. Request bị write conflict phải khởi động transaction mới và đọc lại. Không coi unique(staffId,startAt), tìm-trống-rồi-insert hoặc transaction chỉ ghi hai appointment khác nhau là đủ.

Thiết kế cần replica set hỗ trợ transaction, `readPreference:primary`, `readConcern:snapshot`, `writeConcern:majority`, collections/indexes được tạo và xác minh trước khi mở booking. Chưa kiểm topology/FCV/transaction thật. Standalone không được bật chức năng đặt lịch theo thiết kế này. MongoDB mô tả việc sửa document trong transaction để tạo write conflict tại [production considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/).

Pseudocode thiết kế (không import/chạy ứng dụng):

```text
createBooking(actor, payload, requestKey):
  validate input types, authenticate actor; normalize payload; compute hash
  if receipt exists by (actor.id, requestKey): verify hash, return same appointment
  newAppointmentId := allocate ONCE outside retry loop
  transactionWithBoundedRetry(session):
    staff := findOneAndUpdate({_id: payload.staffId,
                              bookingRevision: {$lt: MAX_SAFE_INTEGER}},
                             {$inc: {bookingRevision: 1}},
                             {session, returnDocument: "after"})
    require staff exists and active
    receipt := find appointment by (actor.id, requestKey), using session
    if receipt: verify hash; return same appointment
    load/validate actor, customer, active services in session
    validate staff skills and build immutable item snapshots; compute money/times
    require future, within horizon/one shift, not time_off, not overdue service day
    require startAt >= latest completedAt + 10 minutes if cooldown is still active
    require no appointment overlap in blocking states, using session
    insert appointment with id, request identity, snapshots, confirmed/revision=0
  return success only after confirmed commit
```

Giá trị receipt phải đối chiếu quyền kể cả khi trả sớm. Account/profile không hard-delete; account bị khóa ngăn request mới tại lớp xác thực. Việc thu hồi quyền một request đã xác thực đang chạy có thể đợi request đó kết thúc, chưa thiết kế cơ chế thu hồi tức thì.

| Thời điểm | Request A: 09:00–10:10 | Request B: 09:30–10:40 |
| --- | --- | --- |
| 1 | Ghi guard staff S | Cũng ghi guard S: chờ hoặc write conflict |
| 2 | Đọc trống, insert lịch A trong transaction | Không được bỏ qua guard để đọc rồi insert |
| 3 | Commit majority | Retry **toàn bộ** transaction với snapshot mới |
| 4 | Trả lịch A | Ghi guard, thấy lịch A overlap → abort, trả SLOT_UNAVAILABLE |

Nếu A abort thì B retry có thể đặt. Staff T khác S ghi document khác nên cùng giờ có thể commit. Cùng S khác ngày vẫn tranh guard; đây là chi phí đơn giản hóa. Không có mảng staff-day/slot nên không có nguy cơ tích lũy reservations tới 16 MB hoặc chiếm thiếu ô. Không dùng lease RAM hoặc TTL unlock.

<a id="reschedule"></a>
## B5. Đổi/hủy đồng thời và idempotency

**Tạo:** unique `(createdByAccountId,requestKey)` bắt buộc. Hash chuẩn hóa theo thứ tự key cố định `{customerId,staffId,serviceIds,startAt}`; IDs dạng canonical, startAt UTC ISO, giữ thứ tự serviceIds. Không chứa snapshot giá hiện thời: retry vẫn trả lịch cũ dù danh mục vừa đổi. Cùng key/hash trả cùng appointment hiện tại, kể cả đã cancelled; cùng key khác hash trả IDEMPOTENCY_KEY_REUSED. Muốn đặt lại sau hủy dùng key mới. RequestKey không có TTL và giữ suốt vòng đời appointment v1; không xóa lịch tùy tiện làm key được dùng lại.

**Sửa:** mọi lệnh có key, hash gồm operation/appointmentId/expectedRevision/payload và expectedRevision. Chỉ lưu `lastCommand` một phần tử, bắt buộc khi revision>0. Nếu khớp key+actor+hash thì trả cùng resultRevision trước khi xét expectedRevision. Cùng actor/key với **biên nhận hiện tại** nhưng khác hash bị từ chối; không phát hiện reuse key đã bị receipt mới thay thế. Nếu đã có lệnh mới hơn, retry lệnh cũ với expectedRevision cũ nhận STALE_REVISION và client GET lại; không hứa phát lại mọi response cũ. Client tạo key mới cho lệnh mới, retry phải giữ nguyên expectedRevision; không tự retry lệnh cũ bằng revision mới. Biên nhận của cancel/complete/đổi gần nhất đủ xử lý mất response, còn revision ngăn retry cũ ghi đè.

```text
changeAppointment(actor, command, expectedRevision):
  pre-read appointment only to learn candidate old staff id (not authority)
  transactionWithBoundedRetry(session):
    for staffId in sortedUnique(candidateOldStaffId, candidateNewStaffId):
      acquire guard by actual bookingRevision increment; require exists
    re-read appointment in session
    if actual staffId differs from locked set: abort and restart with correct set
    authorize actor; if lastCommand matches: return recorded resultRevision
    require appointment.revision == expectedRevision and allowed transition
    for reschedule: validate unchanged snapshots, new staff skills/active,
      new shift/time_off/overlap, actual cooldown and overdue-day rules,
      excluding this appointment._id from reserved-interval overlap
    update appointment filtered by {_id, revision: expectedRevision, status: oldStatus}
      with new fields, revision+1, lastCommand and server timestamps
    require matchedCount == 1
  return only after confirmed commit
```

Cần guard cả stylist cũ và mới theo thứ tự hex để giảm deadlock. Không hủy appointment cũ trước rồi insert appointment mới. Nếu giờ mới kín, validation lỗi, tiến trình chết trước commit: transaction abort giữ nguyên lịch cũ. Cancel và reschedule cùng revision: một lệnh thắng; lệnh còn lại stale, không âm thầm hủy lịch vừa được dời. Bắt đầu hai lịch cùng stylist cũng guard và kiểm chỉ một in_progress. Tạo nghỉ/đổi ca cũng dùng guard trước khi đọc lịch bị ảnh hưởng.

**Retry/lỗi:** dùng một chính sách retry hữu hạn (đề xuất tổng 10 giây, tối đa 3 lần chạy body); không gọi mạng ngoài DB trong transaction, không `Promise.all` các thao tác session. `TransientTransactionError` trước commit: abort và chạy lại body. `UnknownTransactionCommitResult`: retry **commit cùng transaction**, không tự kết luận rollback rồi tạo lại bằng key mới. Hết thời hạn mà vẫn chưa rõ: trả kết quả “chưa xác định, GET lại bằng request key/appointment”, không trả “đã hủy/thất bại chắc chắn”. E11000 trên create receipt: abort, đọc lại receipt có cùng actor/key bằng primary+majority; có và cùng hash thì trả lại; chưa thấy thì yêu cầu retry cùng key. Không nuốt E11000 khác. [Node driver transaction errors](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).

<a id="lifecycle"></a>
## B6. Ngừng hoạt động và lịch sử

- Dịch vụ isActive=false: ẩn danh mục; lịch đã confirmed vẫn giữ nguyên snapshot và được thực hiện. Đổi giờ cùng gói cũ được phép dù dịch vụ inactive nếu stylist còn kỹ năng; tạo lịch mới thì không. Muốn dừng thực hiện hoàn toàn phải xử lý các lịch tương lai bằng thao tác có chủ ý.
- Staff ngừng hoạt động/thu hồi kỹ năng: dưới guard kiểm mọi in_progress và confirmed có occupiedUntil>now, từ chối nếu gây vi phạm; cần giải quyết từng lịch trước. V1 không hard-delete staff/services kể cả chưa có reference, tránh race với booking mới; dùng isActive.
- Customer/account: không hard-delete trong v1, account isActive để khóa truy cập. Không thêm isDeleted vào mọi collection. Yêu cầu xóa/ẩn dữ liệu cá nhân cần quyết định lưu trữ, xử lý cả snapshot, trước triển khai thật; không giữ thông tin nhạy cảm thừa.
- Không có lịch sử vô hạn nhúng ở customer/staff/service; appointments truy vấn bằng index. V1 chỉ lưu trạng thái cuối, mốc cần thiết và lệnh sửa gần nhất; chưa có audit log mọi thao tác. Nếu môn học bắt buộc audit, phải duyệt bổ sung riêng.

<a id="images"></a>
## B7. Kho ảnh dùng chung — cập nhật 13/10/2026

- **Nhu cầu đã yêu cầu:** kho images dùng chung và nhiều ảnh mỗi dịch vụ. Chi tiết giới hạn/quyền/lifecycle dưới đây là PROPOSED D13–D15; SOL-011 không triển khai chức năng này.
- **Quyền đề xuất:** owner/receptionist upload, tìm/chọn, sửa tên hiển thị và archive ảnh; public chỉ nhận URL ảnh dịch vụ trong DTO. Không public danh sách kho, người upload hoặc metadata nội bộ. Account bị khóa không thực hiện thao tác mới. Kho v1 chỉ có nội dung công khai của tiệm; chưa nhận ảnh riêng tư của khách.
- **Upload:** server xác thực actor, kiểm loại ảnh raster jpg/png/webp và giới hạn 10 MiB/20000 pixel mỗi chiều, upload vào cloud cấu hình với resource_type=image, type=upload, overwrite=false và publicId mới. Chỉ đăng ký document images khi upload thành công và metadata do Cloudinary trả được kiểm; uploadedByAccountId lấy từ identity, không từ client. Không nhận tùy ý một URL/asset ID do client tự khai để đăng ký ảnh.
- **Hai hệ thống:** upload Cloudinary và insert MongoDB không cùng transaction. Upload lỗi → không tạo document/link; upload thành công nhưng insert lỗi → không trả thành công, lưu biên nhận asset tối thiểu vào hàng đợi xử lý vận hành riêng ngoài dữ liệu public, đối chiếu trước khi đăng ký lại hoặc dọn asset. Không tự xóa ngay vì có thể insert đã commit nhưng mất response. Retry đăng ký cùng asset phải tra unique (cloudName,cloudinaryAssetId), kiểm cùng actor/nội dung và trả bản ghi đã có; trùng publicId với asset khác là conflict. Chưa thiết kế collection upload job hoặc tuyên bố xử lý end-to-end đã chạy.
- **Gallery:** 1–10 imageId khác nhau/dịch vụ, thứ tự array là thứ tự hiển thị; coverImageId phải thuộc mảng. Alt là mô tả theo ngữ cảnh và nằm ở từng liên kết, không đồng bộ trên toàn kho. Đọc/merge/validate rồi cập nhật cover + gallery trên cùng document services trong một lần ghi atomic; không cập nhật hai field riêng. Khi triển khai trình sửa đồng thời phải dùng điều kiện khớp gallery/cover trước đó, nếu khác trả conflict thay vì ghi đè.
- **Gắn mới:** service layer kiểm mọi ID tồn tại; ảnh mới thêm vào gallery phải isActive=true tại snapshot transaction. Ảnh đã liên kết được giữ lại khi archived, vẫn dùng làm cover. Archive đồng thời không thu hồi yêu cầu gắn đã đọc ảnh active trước đó; đây là semantics chấp nhận của v1 vì asset không bị xóa. Nếu cần archive ngăn tuyệt đối mọi gắn mới tại thời điểm commit phải bổ sung guard ảnh trước triển khai.
- **Tái sử dụng/bỏ liên kết:** một image được nhiều service dùng. Không có ownerType/ownerId polymorphic hoặc mảng serviceIds ngược. Bỏ khỏi gallery không xóa document/file; nếu bỏ cover thì bắt buộc chọn cover khác trong cùng cập nhật. Không cho service có gallery rỗng, kể cả inactive, trong schema đích.
- **Archive:** đặt isActive=false, ẩn khỏi bộ chọn mặc định, vẫn cho quản trị lọc ảnh archived và tra nơi dùng. Có thể khôi phục isActive=true. Không xóa file Cloudinary, không phá URL và không dọn ảnh đang dùng. Archive được cả khi chưa dùng hoặc đang dùng; không cần bộ đếm usage dễ lệch.
- **Xóa vật lý chưa hỗ trợ:** v1 không hard-delete images hoặc asset, kể cả ảnh có vẻ chưa được dùng, nên tránh race check-unused rồi delete. Một thiết kế purge sau này phải kiểm toàn bộ loại liên kết, chặn gắn mới dưới guard và có quy trình phục hồi/lỗi Cloudinary; không tự thêm vào task này.
- **Thay ảnh:** upload asset mới, chọn thay liên kết có chủ ý; không overwrite/rename asset cũ hoặc tự đổi tất cả nơi dùng. Người vận hành cần bảo vệ cấu hình Cloudinary khỏi xóa/đổi ngoài ứng dụng; URL bị sửa ngoài quy trình là lỗi vận hành, API trả lỗi dữ liệu an toàn khi không resolve được cover, không âm thầm lấy URL legacy trong steady state.
- **Tương thích:** DTO GET services giữ nguyên id String/envelope/sort/8 field; imageUrl lấy từ cover.url, kể cả cover archived nhưng còn liên kết. Chưa thêm gallery vào public DTO. Nếu có API gallery sau này cần hợp đồng riêng được duyệt cho web/mobile.
