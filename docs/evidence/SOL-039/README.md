# SOL-039 — Tích hợp vòng đời lịch hẹn và quyền dữ liệu

Ngày thực hiện: 06/11/2026. Nguồn yêu cầu: hàng SOL-039 trong file
`Sol Hair Studio — Kế hoạch & phân công.xlsx` ở thư mục cha repository.
Đây là bằng chứng kỹ thuật, không phải backlog hoặc cập nhật trạng thái Sheet.

## Phạm vi thực tế

Source đã có API SOL-035/036, Web SOL-037 và Mobile SOL-038. Thay đổi này bổ sung
kiểm thử xuyên module M1–M3–M4–M5 và nghiệm thu Web/Android thực tế. Trong lượt
LDPlayer, đã sửa thông báo thành công cũ còn hiện sau một command/correction mới;
không tạo lại endpoint, sửa state machine, thay chính sách quyền hoặc thêm schema.

Suite [appointments-lifecycle.integration.test.js](../../../apps/api/src/modules/appointments/tests/appointments-lifecycle.integration.test.js)
khởi động Express trên cổng loopback ngẫu nhiên và MongoDB **8.0.17 replica set tạm**.
Dữ liệu tổng hợp, mật khẩu fixture được tạo ngẫu nhiên; đăng nhập qua M1 thật để
lấy token. Request đi qua HTTP socket thật bằng adapter JS Web/Mobile hiện có;
không mock fetch, auth, service, repository hoặc DTO. Riêng ca rollback cố ý làm
`insertAppointmentEvent` thất bại để kiểm tính nguyên tử.

Không nhận URI database ngoài; không seed/xóa dữ liệu ứng dụng, không gửi email.
Sau test đóng HTTP server và xóa replica set tạm. Dùng lại fixture M4 và storage/index
preparation hiện có thay vì tạo mô hình lịch/ca hoặc cơ chế khóa riêng.

## Ma trận tự động — 22 trường hợp

| Luồng | Kiểm chứng |
| --- | --- |
| Đọc cùng lịch qua Web/Mobile | Cùng ID, staff, thời gian, trạng thái; DTO khách không chứa contact/audit/receipt |
| Quyền M1 và object scope | Khách khác dù trùng phone và stylist khác không đọc được lịch; audit chỉ Owner |
| Web/Mobile đổi và hủy | 8 ca: 2 client × 2 thao tác × đúng cutoff 2 giờ / trễ 1 ms; cả options và command kiểm phía server |
| Đổi Stylist | Snapshot dịch vụ/khách giữ nguyên; stylist cũ mất quyền, stylist mới có quyền |
| No-show/khách quay lại | Chặn trước 15 phút; Owner ghi đã liên hệ; không Start lại no-show; tạo lịch walk-in mới |
| Bắt đầu/hoàn tất sớm | Mobile cập nhật actual; Web đọc cùng kết quả; M4 tái dùng giờ đã giải phóng, giữ 10 phút dọn |
| ETA ảnh hưởng lịch sau | Owner đọc cảnh báo, khách không nhận dữ liệu lịch khác; lịch sau không tự dời |
| Sửa nhầm Start | Lý do bắt buộc, khách bị cấm; retry cùng key chỉ một correction; giữ event Start cũ |
| Sửa nhầm Complete | Phát hiện booking M4 xen vào giờ đã giải phóng; lỗi không ghi một phần; xử lý booking xung đột rồi mới khôi phục |
| Stylist sửa nhầm | Chỉ Stylist được giao; cả hai correction qua adapter Mobile; Owner đọc audit đúng actor |
| Session bị disabled | Token cũ không thể thay đổi lịch; dữ liệu và event không đổi |
| Tranh chấp Web/Mobile | Cancel và Start cùng revision: chỉ một thao tác thành công, một event mới |
| Retry đồng thời | Cùng key/intent: cùng kết quả, chỉ một revision/event |
| Rollback | Audit lỗi: appointment, receipt và guard Customer/Staff cùng rollback |
| Tích hợp ca M3 | Ca có lịch không được hủy; sau hủy qua M5 thì hủy ca được, availability M4 cập nhật |
| Fixture nghiệm thu native | Lịch lịch sử tổng hợp được seed ở confirmed; no-show vẫn đi qua HTTP API Owner thật |
| Mất response command thật | Proxy bỏ response sau commit; retry cùng key/body chỉ một transition/event; booking transport cũ vẫn tách riêng |

Các dòng mô tả nhiều assertion trong cùng ca, không cộng số assertion thành số test.
Hợp đồng và quy tắc nguồn: [appointments-api.md](../../appointments-api.md),
[business-rules.md](../../database/business-rules.md), [booking-api.md](../../booking-api.md).

## Cách chạy lại

Tại root repository, dùng Node 24 và dependencies hiện có:

```powershell
npm run test:appointments:integration --workspace @sol-hair/api
npm run lint
npm test
npm run build
```

Suite tự quản lý môi trường test; không yêu cầu chạy server ứng dụng hoặc cung cấp `.env`.

## Kết quả ngày 06/11/2026

| Kiểm tra đã chạy | Kết quả |
| --- | --- |
| Suite SOL-039 trong hồi quy cuối | 22/22 PASS |
| `npm test` toàn monorepo | 2.005 tests / 113 files PASS: API 894, Mobile 504, Web 607 |
| `npm run lint` | PASS cho API, Mobile, Web và shared |
| `npm run build` | PASS: kiểm cú pháp API, bundle Android + iOS, build Web |
| Chrome headless, không mock API | Customer login/đổi lịch/quyền đối tượng; Owner EJS no-show, Start/Complete/ETA, cả hai correction, giải quyết conflict và audit |
| Viewport browser | Desktop 1440×1000, mobile viewport 390×844; chi tiết Customer không tràn ngang |
| Android native | Đã chạy trên LDPlayer Android 9/API 28, Expo Go 58.0.5; chi tiết xem mục nghiệm thu native bên dưới |

Runtime kiểm thử: Node 24.12.0, npm 11.6.2. Build Web còn cảnh báo chunk lớn;
test hiện có còn cảnh báo deprecated Mongoose option `new`; cả hai không chặn lệnh.
Không sửa module khác để dọn các cảnh báo ngoài phạm vi.

Ảnh cùng thư mục: [chi tiết desktop](customer-detail-desktop.png),
[viewport mobile](customer-detail-mobile-viewport.png),
[xác nhận hủy](customer-cancel-confirm.png), [hủy thành công](customer-cancel-success.png),
[Owner đọc cùng lịch](owner-schedule-same-booking.png).
[browser-check.json](browser-check.json) ghi phạm vi smoke test và
[db-audit.json](db-audit.json) đối chiếu dữ liệu replica set tạm sau thao tác.
Các mã lịch/hồ sơ trong bằng chứng là dữ liệu tổng hợp của harness, không phải dữ liệu khách thật.

## Nghiệm thu Android và Web còn lại — 06/11/2026

Chạy bằng ứng dụng React Native thật trong Expo Go trên LDPlayer, không phải web
viewport, React Native mock hoặc adapter chạy Node. Metro do người dùng mở trên
8082, API harness riêng 4016; `adb reverse` chuyển tiếp từ emulator. Chrome đọc
cùng Express/MongoDB tạm. Login trên Android và Customer Web qua form thật;
Owner EJS qua handoff session hiện có. Không ghi vào database ứng dụng.

| Luồng thực tế | Kết quả / bằng chứng |
| --- | --- |
| Customer Android | Login → danh sách/chi tiết → xác nhận hủy, server cancelled; đổi giờ và Stylist A → B, cùng ID/revision 1 |
| Đồng bộ Web/Android | Customer Web tiếp tục đổi cùng lịch sang 14:00/Stylist A ở revision 2; Android đăng nhập lại đọc đúng 14:00/A |
| Cutoff Android | Lịch dưới 2 giờ/quá giờ: Đổi/Hủy bị disable, có hướng dẫn liên hệ salon; biên đúng 2 giờ/+1 ms vẫn được kiểm bằng integration HTTP cho cả adapter |
| Stylist Android | Login chỉ thấy lịch được giao; Start yêu cầu xác nhận; actual start được lưu và giữ khi phục vụ tiếp |
| Sửa Start Android | Nhập lý do + xác nhận, trở về confirmed; Start lại được; event Start cũ và corrected cùng tồn tại |
| ETA Android | ETA 12:20 ảnh hưởng booking 12:15: hiện mã/giờ cảnh báo, không có contact khách khác; booking sau vẫn revision 0/giờ cũ |
| Complete sớm Android | Lưu actual completion trước planned end, kết thúc không phải đã thanh toán; lịch sử dịch vụ chỉ hiển thị đúng Customer context |
| Sửa Complete có conflict | Tạo booking M4 trong khoảng vừa giải phóng; correction Android bị 409 và giữ completed/revision; Owner hủy đúng booking xung đột trên Web, Android tải lại và khôi phục được |
| Mất response sau commit | Một response Complete bị bỏ: Android network tự retry cùng key/body, một event. Bỏ hai response correction: UI hiện chưa rõ kết quả, khóa sửa/Quay lại/Back; bấm Thử lại cùng yêu cầu nhận kết quả đã lưu |
| Owner EJS | No-show với thời điểm đã liên hệ + xác nhận; tạo booking mới khi khách quay lại (M4 API), Owner đọc booking mới, lịch cũ vẫn no_show. Start → correct-start → Start → ETA → Complete → correct-complete → Complete trên form EJS, có reason/checkbox/audit |
| Quyền dữ liệu | Customer mở URL lịch khách khác bị từ chối, không hiện tên/contact; HTTP thật trả 404 cho khách/Stylist khác và 403 cho Customer audit. Customer list 6 lịch đúng hồ sơ, không chứa lịch của hồ sơ khác dù trùng phone |
| Lịch sử Customer Android | Hiển thị các lịch cancelled/completed/no_show riêng biệt; không biến no_show thành confirmed khi có booking quay lại |

Đối chiếu cuối: lịch Stylist Android revision **9**, **10 events** liên tục 0–9;
lịch Owner revision **7**, **8 events**. Manual retry correction ghi nhận **3
requests**, hai response đầu bị bỏ, tất cả cùng key hash/body hash; chỉ một event
cho revision 8. Đây là số của dữ liệu nghiệm thu lần này, không phải hằng số sản phẩm.

Các nguồn bằng chứng đã loại credentials trong [native/](native/):

- [Checklist kiểm bằng API/audit](native/acceptance-checks.json),
  [snapshot/audit cuối](native/native-audit.json),
  [transport retry đã hash key/body](native/native-retry-transport.json).
- [Android xác nhận hủy](native/android-customer-cancel-confirm.png),
  [đổi lịch thành công](native/android-reschedule-success.png),
  [cutoff](native/android-customer-cutoff.png),
  [đọc lại thay đổi Web](native/android-reflects-web-reschedule.png).
- [ETA và lịch ảnh hưởng](native/android-eta-impact.png),
  [conflict correction](native/android-correct-complete-conflict.png),
  [correction thành công](native/android-correct-complete-success.png),
  [chưa rõ kết quả](native/android-uncertain-correction.png),
  [retry thành công](native/android-safe-retry-success.png).
- [No-show và booking quay lại trên Android](native/android-no-show-and-return-history.png),
  [Owner audit](native/owner-audit-serving.png),
  [Customer Web desktop](native/web-shared-appointment-final-desktop.png),
  [Customer Web mobile viewport](native/web-shared-appointment-final-mobile.png).

### Lỗi tích hợp đã sửa

Ba command controller Service/ETA/Correction trước đây chỉ giữ `kind: success`
và message, không gắn thông báo với kết quả đã xác nhận. Sau command khác, footer
có thể tiếp tục nói “Đã bắt đầu” hoặc “Đã hoàn tất” dù current revision/status đã đổi.

Controller nay giữ DTO `result`; `isCurrentAppointmentResult` chỉ cho hiện thông
báo khi ID/revision/status trùng dữ liệu hiện tại. Pending intent/key, retry,
navigation guard và domain command không đổi. Bốn test bổ sung cho presentation;
toàn bộ 504 tests Mobile qua. Kiểm lại trên LDPlayer sau correct-complete: chỉ còn
thông báo correction đúng revision, không còn thông báo Complete cũ.

Lần đầu chuyển từ project Expo đang mở sang Metro test gặp `ExpoCrypto` không tìm
thấy. Force-stop tiến trình Expo Go rồi cold launch cùng project đã chạy được;
không clear app data, không sửa dependency, không thay UUID bằng random yếu. Chưa
kết luận nguyên nhân gốc của lỗi warm runtime chỉ từ hiện tượng này.

### Chạy lại trong môi trường biệt lập

```powershell
npm run acceptance:booking --workspace @sol-hair/api -- --lifecycle --port 4016
# Terminal khác tại root:
$env:EXPO_PUBLIC_API_BASE_URL='http://127.0.0.1:4016'
$env:EXPO_NO_DOTENV='1'
npm run start --workspace @sol-hair/mobile -- --localhost --port 8082
adb reverse tcp:4016 tcp:4016
adb reverse tcp:8082 tcp:8082
```

Chọn đúng thiết bị nếu ADB có nhiều thiết bị. Credential tổng hợp chỉ được ghi ở
file tạm mà harness in đường dẫn, không commit. `--lifecycle` seed một lịch
confirmed lịch sử tổng hợp để kiểm no-show mà không chờ 15 phút thật; không coi
việc seed đó là chứng cứ tạo booking trong quá khứ bằng API sản phẩm.

Trong terminal harness: `drop-command-next` bỏ response của lệnh M5 thành công
kế tiếp **sau commit**, tách khỏi `drop-next` của Booking. Android network có thể
tự retry, nên có thể cần hai lượt để thấy UI chưa rõ kết quả. `audit` ghi snapshot,
events và transport đã hash; `stop` dừng HTTP/MongoDB tạm và xóa credentials.
Không có fault/control endpoint trên API sản phẩm. Lệnh này là công cụ nghiệm thu,
không tự dời hoặc sửa appointment. Booking receipts và command receipts không gộp.

## Ranh giới nghiệm thu và bàn giao

- Lượt đầu chưa có thiết bị; lượt tiếp theo đã nghiệm thu LDPlayer thật như trên.
  Chưa thử điện thoại Android vật lý, iOS native hoặc MongoDB/SMTP/upload production.
  Các biên thời gian tới millisecond và transaction races được kiểm bằng automated
  HTTP + replica set, không giả là hai thiết bị được bấm tay cùng millisecond.
- Stylist thuần dùng Mobile theo chính sách hiện tại, không mở thêm quyền Web.
- Không đánh dấu SOL-039 hoàn thành/merge hoặc cập nhật công việc người khác trên Sheet
  chỉ dựa vào lượt local. Đã có Web + Android cho các luồng chính; bàn giao vẫn cần
  review/CI/PR theo quy trình của nhóm. Chưa commit, push, merge hoặc sửa file Sheet.
- Source/tài liệu mới nhất cho phép Owner **hoặc Stylist được giao** thực hiện hai
  correction có reason/attestation, kiểm conflict và audit. Giữ đúng chính sách đó;
  không áp lại giả định cũ chỉ Owner từ mô tả UI trước đây.

### Ma trận nghiệm thu tham chiếu

| Vai trò/nền tảng | Thao tác | Bằng chứng cần giữ |
| --- | --- | --- |
| Customer Web + Android | Cùng tài khoản xem lịch, đổi giờ/stylist, hủy trước/đúng/sau cutoff | ID/revision/status thống nhất, ảnh loading/error/success; không lộ thông tin khách khác |
| Owner Web EJS | No-show trước/sau 15 phút, khách quay lại tạo booking mới | Lịch cũ giữ no_show; mã lịch mới khác |
| Stylist Android | Xem lịch được giao, Start, ETA, Complete sớm | Actual time, cảnh báo; lịch người khác không tự đổi |
| Owner Web / Stylist Android được giao | Cả hai sửa nhầm có reason/xác nhận; thử booking xen vào khoảng đã mở | Conflict rõ ràng, lỗi giữ dữ liệu; audit đủ actor/reason/before/after |
| Hai phiên | Start/Cancel cùng lúc, double-click/retry, mất mạng khi gửi | Một transition/event; giữ key/body để retry, không tự kết luận thành công |
| Customer khác / Stylist khác | Thay appointmentId, thử audit và các command | 403/404 và không có contact/ID ngoài phạm vi trong response |

Chỉ thực hiện các thao tác ghi nghiệm thu trên replica set tạm hoặc môi trường test
được duyệt. Có thể tái dùng harness `acceptance:booking` và hướng dẫn
[booking-acceptance.md](../../booking-acceptance.md) cho dữ liệu biệt lập; dùng phiên bản
Expo SDK hiện tại trong `apps/mobile/package.json`, không suy diễn từ tài liệu cũ.
