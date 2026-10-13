# Review và nghiệm thu — PROPOSED

Chủ task duyệt: **NhanDuong21**. Bản nháp chưa APPROVED, chưa chứng minh ràng buộc MongoDB thực tế. Base phân tích `e742630382df97d44e74321d8af82a52e506450f`, PR #10 MERGED. Sheet chỉ chỉnh SOL-011 tại PHÂN CÔNG hàng 10; không sửa các quyết định PHẠM VI đang “Chưa chốt”.

**Bổ sung 13/10/2026:** chủ task yêu cầu collection images làm kho ảnh dùng chung, sửa sơ đồ/tài liệu, chưa triển khai code. Baseline hiện có 7 collection; schema đích services dùng cover/gallery, DTO cũ giữ 8 field. D1–D12 vẫn chưa duyệt; giới hạn, quyền và lifecycle ảnh D13–D15 là đề xuất chi tiết. Các bằng chứng ngày 29/09 bên dưới là lịch sử, không thay thế kiểm tra bản cập nhật; kết quả mới ghi ở mục cuối.

<a id="quyet-dinh"></a>
## Quyết định cần duyệt

| Mã | Khuyến nghị chính của bản nháp | Ảnh hưởng cần chấp nhận | Trạng thái |
| --- | --- | --- | --- |
| D1 | Một tiệm, Asia/Ho_Chi_Minh | Không branchId/multi-tenant; đổi nhiều chi nhánh cần thiết kế lại truy vấn/quyền | PROPOSED |
| D2 | Một stylist, 1–3 dịch vụ nối tiếp | Không chia stylist, không đặt song song thời gian chờ nhuộm; tối đa 480 phút +10 buffer | PROPOSED |
| D3 | bookingDuration cụ thể 60/120/75 cho ba dịch vụ mẫu | Chủ tiệm phải duyệt từng số; trường min/max chỉ hiển thị; chưa có giá trị thì không nhận booking | PROPOSED |
| D4 | Giá VND nguyên, snapshot lúc tạo | Đổi giá catalog không sửa lịch cũ; đổi giờ giữ giá; đổi gói cần hủy/tạo mới | PROPOSED |
| D5 | Khách tự đặt sau đăng nhập; vãng lai do lễ tân đặt hộ | Có accounts và customers tách riêng; chưa có auth runtime; không tự liên kết theo phone | PROPOSED |
| D6 | Confirm ngay, không hold | Slot xem có thể vừa bị người khác đặt; submit nhận conflict và chọn lại | PROPOSED |
| D7 | Transaction ghi guard staff | Yêu cầu replica set hỗ trợ transaction; cùng stylist khác ngày cũng tranh chấp; cần integration test sau duyệt | PROPOSED |
| D8 | Bội5 phút, trước tối đa90 ngày; cùng ngày local và trong một ca | Không đặt qua đêm; 00:00 ngày sau chỉ được là biên phải; hủy/đổi trước giờ bắt đầu | PROPOSED |
| D9 | Completed giữ khung cũ; no_show sau 15 phút do nhân sự ghi | Không tự no_show bằng cron; quá giờ thực tế cần lễ tân xử lý, không tự dời dây chuyền | PROPOSED |
| D10 | Ngừng dịch vụ vẫn phục vụ lịch cũ; ngừng staff phải xử lý lịch trước | Không cascade delete; chưa quyết định thời hạn lưu/ẩn dữ liệu cá nhân, phải chốt trước dùng thật | PROPOSED |
| D11 | Hoãn đánh giá, thanh toán và audit mọi lần sửa | Chỉ lastCommand gần nhất; retry cũ hơn nhận stale và GET lại | PROPOSED |
| D12 | Chống trùng theo stylist; chưa khóa customer | Nếu muốn cấm khách đặt trùng trên hai stylist, cần bổ sung guard customer theo thứ tự khóa thống nhất trước triển khai | PROPOSED |
| D13 | Kho images chung; service 1–10 ảnh khác nhau, cover thuộc gallery | File ở Cloudinary, metadata ở MongoDB; DTO giữ imageUrl từ cover; chưa public gallery hoặc thêm avatar/banner | Nhu cầu kho đã yêu cầu; chi tiết PROPOSED |
| D14 | Owner/receptionist quản lý ảnh công khai; jpg/png/webp, 10 MiB, mỗi chiều <=20000px | Metadata từ upload đã xác minh; actor legacy có thể thiếu; không hỗ trợ ảnh khách riêng tư | PROPOSED |
| D15 | Archive giữ URL/link cũ; không hard-delete/overwrite/rename asset | Gắn mới kiểm active tại snapshot, không thu hồi gắn đang chạy; chưa có purge, lỗi Cloudinary/DB cần đối chiếu ngoài transaction | PROPOSED |

Đây là bảng duyệt thiết kế, không phải backlog phân công mới. Khi duyệt xong, thứ tự triển khai khuyến nghị: bảo toàn DTO/validation services → danh tính và hồ sơ → kho ảnh/gallery → staff/ca/nghỉ → booking/transaction/idempotency → màn hình dùng chung hợp đồng. Chưa tạo mã SOL tiếp theo.

<a id="scenarios"></a>
## Checklist tình huống thiết kế

Các dòng dưới đây là **phân tích thiết kế**, không phải kết quả integration/concurrency PASS. Thời gian ghi theo giờ tiệm, ngày 05/10/2026 trừ khi nêu khác.

| # | Đầu vào cụ thể | Kết quả mong đợi | Vị trí đáp ứng |
| --- | --- | --- | --- |
| 1 | `501`: cắt09:00,60 phút,450000đ | end10:00, occupiedUntil10:10; snapshot đúng | [B1](business-rules.md#booking), appointments.json |
| 2 | `503`: cắt60+spa75 lúc 09:00, stylist302 | 135 phút,1050000đ, hết buffer11:25; thứ tự items được giữ | B1, schema.items |
| 3 | `502` bắt đầu 10:10 sau`501`; thử10:05 | 10:10 được; 10:05 trùng buffer bị từ chối | [B2](business-rules.md#schedule), overlap trong checker |
| 4 | A09:00/B09:30 cùng stylist301 gửi đồng thời | Cùng ghi staff301; một transaction retry rồi thấy overlap, chỉ một lịch thành công | [B4](business-rules.md#concurrency), timeline A/B |
| 5 | `501` staff301 và`503` staff302 cùng 09:00 | Cả hai hợp lệ, guard khác document | B4, bộ mẫu |
| 6 | `504` cancelled; tạo`501` cùng giờ/key mới; gửi lại key504 | Key mới được nếu trống; key504 trả lịch cancelled cũ, không hồi sinh | [B5](business-rules.md#reschedule), I12 |
| 7 | Cancel request mất response, gửi lại cùng key/hash/revision | lastCommand trả receipt; sau một lệnh mới hơn thì stale, không chạy cancel lại | B5 |
| 8 | Đổi`501` vào10:10 đã có`502`; hoặc chết trước commit | Abort giữ nguyên`501`09:00; không mất slot cũ | B5 pseudocode |
| 9 | Cancel và đổi`501` cùng revision0 | Một lệnh commit, lệnh kia STALE_REVISION; không hủy nhầm lịch vừa đổi | B5 conditional write |
| 10 | Catalog cắt đổi500000/65 hoặc inactive sau tạo`501` |`501` giữ450000/60; mới dùng catalog hiện tại nếu active; duration phải trong min/max mới | [B6](business-rules.md#lifecycle), schema snapshot |
| 11 | Staff301 đặt12:00 khi nghỉ12–13; hoặc08:30 trước ca | Từ chối dù không có appointment khác | B2, staff_time_off.json |
| 12 | Chọn ngày 05/10 nhưng UTC04/10 lúc17:30; hoặc23:30+60+10 | Tính local đúng05/10; trường hợp cuối qua ngày bị từ chối | B2, localDate/checker |
| 13 | staffId không tồn tại, price1.5, min61/max60, item duration62 | Từ chối reference/giá/duration; không casting số từ chuỗi | schema validation; checker negative cases |
| 14 | completed → confirmed; khách khác hủy`501` | Conflict/forbidden; không sửa lịch hay guard thành công | [B3](business-rules.md#states), B5 |
| 15 | Thêm bookingDurationMinutes vào services DB | DTO vẫn chính xác 8 field, không lộ field nội bộ; mobile hiện chưa consumer | queries Q1, [migration](migration-plan.md), services-response.json |
| 16 | Commit mất phản hồi, không rõ đã lưu chưa | Retry commit cùng transaction; hết hạn GET receipt cùng key, không báo rollback chắc chắn | B5 retry/errors |
| 17 | Thêm nghỉ09:00–11:00 trong lúc booking09:00 | Cùng guard; hoặc nghỉ thắng và booking bị chặn, hoặc booking thắng và nghỉ bị từ chối | B2/B4 |
| 18 | Đổi stylist301→302 đồng thời đổi ngược lại | Khóa hai staff theo thứ tự; reread appointment, revision sai thì abort | B5 |
| 19 | Dịch vụ thực tế làm tới10:20, có lịch tiếp10:10 | Ghi thời gian thật, không start tiếp khi còn in_progress/buffer thực tế; lễ tân xử lý chậm lịch | B2/B3; giới hạn vận hành |
| 20 | completedAt10:20; lúc10:21 yêu cầu đặt10:25 | Tạo/đổi từ chối vì cooldown tới10:30, lịch trống cũng loại slot này | B2 và Q4 |
| 21 | Confirmed ngày trước, hôm nay bấm bắt đầu | Từ chối; nhân sự no_show rồi đặt mới nếu khách tới | B3 |
| 22 | Staff đang in_progress09:00, lúc10:30 sửa ca/nghỉ | Vẫn kiểm lịch đang làm dù startAt<now; không bỏ qua bằng filter tương lai | B2 và Q9 |
| 23 | Service chưa có reference, admin muốn xóa trong lúc booking | V1 không hard-delete service; isActive chỉ ảnh hưởng booking theo snapshot đã mô tả | B6 |
| 24 | Cùng ảnh704 gắn vào cắt và nhuộm | Một document images, hai link độc lập; alt/thứ tự theo từng service | B7, services/images mẫu |
| 25 | Cover không thuộc gallery, ID ảnh thiếu, gallery trùng hoặc >10 | Từ chối whole-document update, giữ gallery cũ | schema, checker negative cases |
| 26 | Bỏ cover khỏi gallery | Bắt buộc chọn cover khác trong cùng ghi atomic/CAS; không xóa asset | B7 |
| 27 | Archive cover703 của hair spa | Không cho chọn mới; DTO hiện có vẫn cùng URL, liên kết cũ được giữ | B7, services-response.json, checker |
| 28 | Archive ảnh chưa dùng705; restore | Vẫn tồn tại trong kho, lọc archived được; restore cho chọn lại | B7, images.json |
| 29 | Hai người cùng sửa gallery cũ | Một CAS thành công, người còn lại conflict và đọc lại | B7; phân tích, chưa DB test |
| 30 | Upload Cloudinary thành công, insert MongoDB lỗi/mất response | Không báo thành công tùy tiện hoặc xóa asset ngay; tra unique asset và đối chiếu biên nhận để đăng ký lại | B7; phân tích, chưa network/DB test |
| 31 | Client khai URL host giả hoặc cloud khác, metadata vượt giới hạn, actor customer | Từ chối đăng ký/link theo schema và quyền | checker negative cases; chưa upload validation thực tế |
| 32 | Chuyển reader services sang ảnh cover | Envelope/id/sort và đúng 8 field không đổi, không lộ gallery/asset/actor | DTO checker, migration |

## Nguồn kỹ thuật và skill

- Đã cài riêng user/global và đọc **mongodb-schema-design**, metadata version 1.0.0 từ [mongodb/agent-skills](https://github.com/mongodb/agent-skills/tree/main/skills/mongodb-schema-design). Các tài nguyên đã đọc: embed-vs-reference, schema-validation, document-size, extended-reference, schema-versioning, unnecessary-indexes. Chỉ áp dụng theo workload trong repo, không chạy các lệnh DB gợi ý trong skill.
- CLI đã liệt kê tên thực tế trước khi cài. Lock user-scope ghi skillFolderHash `2dbf61eb498f6afca37f25e3aa0ab5f9e7bcd632`. GitHub main lúc khảo sát là `d1d2d86754ff303ac441624b2ac8e0380465aa9b`; chưa đối chiếu byte toàn cây đã cài với commit đó nên **không gọi đây là revision bản cài đã xác minh**. Skill/lock/config cá nhân không ở repo.
- [MongoDB transaction write conflicts](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/), [Node driver retries](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/), [MongoDB 8.0 partial index](https://www.mongodb.com/docs/v8.0/core/index-partial/), [Mongoose validation](https://mongoosejs.com/docs/validation.html). Tài liệu Mongoose website hiện 9.10.2; dự án khóa 9.10.1, không nâng cấp theo website.

## Bằng chứng chạy thực tế

Các kiểm tra dưới đây đã chạy ngày 29/09/2026. Kiểm tra tài liệu chạy trong checkout hiện tại. Các lệnh workspace chạy trên bản sao `git archive HEAD` của base đang phân tích, vì runtime không thay đổi trong task; bản sao không chứa `.env`, dùng dependency đã cài. Đặt `DOTENV_CONFIG_PATH=NUL`, `EXPO_NO_DOTENV=1`, `MONGODB_URI` rỗng và `CI=1`; không khởi động API hay kết nối DB.

| Kiểm tra | Kết quả |
| --- | --- |
| PR10 và merge base | MERGED, merge commit trùng origin/main khi bắt đầu |
| `node docs/database/checks/validate-examples.mjs` | Đạt: 6 collection, 18 document giả, DTO 8 field và 46 liên kết nội bộ/file/anchor sau cập nhật PNG |
| `node docs/database/checks/validate-examples.mjs --self-test` | Đạt: từ chối đủ 13 biến thể sai trong bộ nhớ; không phải integration test |
| Mermaid tham chiếu | Đã render bằng Mermaid CLI 12.0.0 + Edge ở lần bàn giao đầu; giữ source `.mmd`. Theo yêu cầu mới, ảnh SVG được thay bằng PNG xuất từ VisuaLeaf |
| VisuaLeaf trên Chrome | Đã dựng 6 collection, 63 field chính, 8 reference và chú giải; chỉnh bố cục/cardinality trên web; Export as PNG tải được ảnh 2282 × 2281, đã mở xem; Export as JSON tải được cấu trúc và vị trí. Nhập lại JSON **CHƯA KIỂM CHỨNG**, xem [giới hạn](diagrams/README.md) |
| `npm run lint` | Đạt cả 3 workspace, exit 0 |
| `npm test` | Đạt 27 test: API 12, web 8, mobile 7; sử dụng mock theo test hiện có |
| `npm run build` | Đạt: API kiểm cú pháp 20 file; Expo export Android/iOS; Vite build 43 module. Không chạy app trên emulator/thiết bị |
| `git diff --check`, `git diff --cached --check` và danh sách staged | Đối chiếu trước commit: chỉ docs/database và một liên kết ở README; không apps/package/lockfile/CI/skill/config cá nhân |

Trích kết quả: `PASS: 6 collections, 18 fake documents`; `PASS: 13 invalid in-memory variants rejected`; `Test Files 6 passed / Tests 12 passed` (API), `3 passed / 7 passed` (mobile), `4 passed / 8 passed` (web). Lần đầu gọi npx Mermaid bị chờ tải browser nên đã dừng; gọi cùng CLI từ cache với Edge đã render thành công. Không coi lần npx bị dừng là PASS. Build chỉ có cảnh báo cache Metro rỗng và NO_COLOR/FORCE_COLOR, không có lỗi build.

Lần cập nhật ảnh theo yêu cầu dùng VisuaLeaf chỉ đổi tài liệu/sơ đồ: chạy lại checker offline và kiểm diff; không chạy lại test/build ứng dụng. Đã đọc metadata của file xuất: 6 collection/63 field/8 đường nối/1 chú giải; PNG đúng chữ ký và kích thước trên. File JSON giữ nguyên bản xuất của công cụ, gồm nhãn `connectionType: "SQL"`; không phải thay đổi thiết kế MongoDB. PNG có hạn chế hiển thị mép tiêu đề/dấu gạch dưới khi thu nhỏ như ghi trong hướng dẫn sơ đồ.

## Review và giới hạn

Đã thực hiện **hai lượt review chỉ đọc bằng subagent**, đúng giới hạn mục 7 prompt: dữ liệu/tương thích và concurrency/tính nhất quán. Người thực hiện chính đã sửa các phát hiện bên dưới, tự đối chiếu lại; không có lượt subagent thứ ba. Đây là review tài liệu, không phải DB test hoặc chủ task đã duyệt.

| Phát hiện | Cách xử lý trong bản bàn giao |
| --- | --- |
| Sample đặt lại trước lúc hủy; một khách ở hai stylist cùng giờ | Dời createdAt/confirmedAt501 sau cancelledAt504; thêm khách giả203 cho503; ghi chính sách customer concurrency còn PROPOSED |
| Revision>0 thiếu receipt; checker thiếu timestamp relation | Thêm lastCommand505/506, bắt buộc receipt khi revision>0; kiểm confirmedAt<=updatedAt; thêm negative cases |
| Checker dùng ca hiện tại để xét lịch completed quá khứ | Chỉ kiểm ca/nghỉ hiện tại cho confirmed/in_progress; vẫn xét completed trong overlap reservation |
| Có thể xóa dịch vụ chưa có reference giữa transaction booking | Cấm hard-delete services/staff/customers/accounts ở v1; ngừng hoạt động có chủ ý |
| Đặt mới nhận vào cooldown sau hoàn tất muộn | Bổ sung kiểm cooldown ở availability, create, reschedule dưới guard; không đổi reservation lịch sử |
| Cụm “tương lai” bỏ sót đang phục vụ; bắt đầu lịch cũ | Chỉ rõ mọi in_progress, confirmed occupiedUntil>now; start cùng ngày, trước endAt, active và không nghỉ |
| lastCommand một phần tử nhưng lời hứa idempotency quá rộng | Thu hẹp phát hiện reuse tới receipt hiện tại; retry lệnh cũ giữ expectedRevision và nhận stale nếu đã có lệnh sau |

Sửa thêm khi chạy checker: lỗi dấu ngoặc JavaScript ở lần chạy đầu và thiếu ảnh trong lúc renderer chưa xong; đã sửa cú pháp/render rồi chạy lại toàn bộ. Không làm yếu invariant để vượt kiểm tra.

**Chưa kiểm chứng:** DB thật, Server/FCV/topology, validator/index đã áp dụng, concurrency/failover/unknown commit trên MongoDB, explain/performance, trình giả lập/thiết bị, nhập lại JSON VisuaLeaf trên canvas mới. Không có tuyên bố production-ready.

## Tiêu chí bàn giao

| Tiêu chí | Trạng thái |
| --- | --- |
| Nguồn/hiện trạng/yêu cầu/đề xuất phân biệt rõ | Có tài liệu |
| Schema nested, reference, snapshot, validation/index và migration | Có tài liệu; đã sửa phát hiện từ hai lượt review |
| Chống trùng có key/document tranh chấp, retry, đổi lịch atomic | Có thiết kế; integration chưa chạy |
| JSON giả liên kết nhất quán, script built-in offline | Kiểm tra offline đạt như bảng trên |
| Sơ đồ hiện tại có kho images | PNG render từ Mermaid đã mở kiểm tra; JSON mới xuất từ VisuaLeaf đã đối chiếu 7 collection/80 field/11 reference; xem bằng chứng 13/10 dưới đây |
| VisuaLeaf native round-trip | CHƯA KIỂM CHỨNG; bản xuất native có thật, chưa chứng minh nhập lại được |
| Nhánh/commit/push/Draft PR và Sheet | Bàn giao trên nhánh `docs/SOL-011-db-baseline`; link PR và trạng thái cập nhật tại hàng SOL-011 trên Sheet |
| Chủ task duyệt baseline | CHỜ DUYỆT — PROPOSED |

## Bằng chứng cập nhật kho ảnh — 13/10/2026

Tiếp tục nhánh `docs/SOL-011-db-baseline` và Draft PR #11 theo yêu cầu chủ task. Nhánh đã đồng bộ `main` tại merge commit `674e3d1` (gồm `5086b80`, SOL-012); các kiểm tra bên dưới chạy trên trạng thái đó cùng tài liệu đang sửa. Commit kho ảnh này không đổi apps, dependency, lockfile, CI hoặc cấu hình môi trường; diff PR so với main chỉ có tài liệu.

| Kiểm tra | Kết quả thực tế |
| --- | --- |
| `node docs/database/checks/validate-examples.mjs --self-test` | Đạt: 7 collection, 23 document giả; metadata/reference/gallery/cover và DTO giữ 8 field; từ chối 28 biến thể sai trong bộ nhớ; 55 liên kết file/anchor |
| JSON VisuaLeaf | Đã dựng và xuất trên Chrome: 7 collection, 80 field chính, 11 reference, 1 chú giải; checker đối chiếu đầu mút và 3 cardinality liên quan ảnh. Không chứng minh native round-trip |
| PNG hiện tại | Mermaid CLI trong cache + Edge render 5200 × 3454; đã mở ảnh kiểm tra field/đường nối. Lần gọi CLI đầu dùng `-w` không còn hỗ trợ và thất bại; sửa theo `--help` rồi render thành công. Không cài package vào repo |
| `npm run lint` | Đạt cả 3 workspace, exit 0 |
| `npm test` | Đạt 39 test hiện có: API 12, mobile 19, web 8; không phải kiểm tra upload/DB mới |
| `npm run build` | Đạt: API kiểm cú pháp 20 file, Expo export Android/iOS, Vite build 43 module; không chạy app trên emulator/thiết bị |
| `git diff --check` | Đạt; thay đổi của lượt này chỉ trong docs/database |

Các lệnh npm chạy trực tiếp trong checkout nhánh thiết kế với dependency đã cài, `DOTENV_CONFIG_PATH=NUL`, `EXPO_NO_DOTENV=1`, `MONGODB_URI` rỗng, `CI=1`; không khởi động API hoặc kết nối database. Build có cảnh báo cache Metro/NO_COLOR, không có lỗi.

VisuaLeaf tải được JSON nhưng sau đó kết nối điều khiển Chrome báo `Debugger unattached`, nên **chưa xuất PNG mới trực tiếp từ VisuaLeaf**. PNG trong tài liệu được thay bằng bản Mermaid có đủ kho ảnh; không dùng lại hình 6 collection cũ. Giới hạn và cách đọc ghi tại [hướng dẫn sơ đồ](diagrams/README.md).

**Chưa triển khai/kiểm chứng:** model/API/UI/seed/migration, Cloudinary upload/verification/archive, MongoDB validator/index/transaction, race giữa archive/link, concurrency gallery, lỗi hai hệ thống, explain/performance, native round-trip VisuaLeaf. Không đọc hoặc thay đổi asset/DB thật. D1–D15 vẫn là thiết kế chờ duyệt; yêu cầu bổ sung kho images đã được ghi nhận, chưa đồng nghĩa SOL-011 đã hoàn thành/merge.
