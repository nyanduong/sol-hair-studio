# SOL-043 — Nghiệm thu booking Web và Socket.IO

Ngày: 31/10/2026. Môi trường: Chrome desktop, Web thật localhost:5173 và localhost:5174 (hai origin, hai tài khoản customer riêng), API localhost:4000, MongoDB local replica set. Không dùng mock fetch hay thay logic sản phẩm trong browser.

## Kết quả browser

1. Cả hai phiên chọn Cắt & tạo kiểu, Stylist An, ngày 31/10 lúc 17:00 và cùng tới xác nhận.
2. Khách A xác nhận thành công. Khách B tự nhận cập nhật, quay về bước 2, bỏ lựa chọn 17:00, báo giờ đã thay đổi và disable nút đi tiếp. Không reload hoặc bấm Tải lại. Ảnh socket-slot-invalidated.jpg.
3. Hai phiên lại chọn cùng 18:30, đều có nút xác nhận enabled; gọi hai thao tác click trong Promise.all. Network.responseReceived: A POST 409, B POST 201 (204 là CORS preflight). A hiện lỗi giờ không còn hợp lệ, B thành công. Ảnh socket-race-conflict.jpg và socket-race-success.jpg.
4. Lịch của tôi ở A hiển thị lịch 17:00, ở B hiển thị lịch 18:30, đều Đã xác nhận và đúng Cắt & tạo kiểu/Stylist An/450.000đ. Ảnh socket-customer-history.jpg.
5. Đối chiếu DB sau cả hai kịch bản: 17:00 = 1 confirmed; 18:30 = 1 confirmed. Tổng 2 appointments / 2 created events / 2 booking receipts. Không có lịch trùng cho cùng slot.

Đã tạo hai lịch thật trong database local để nghiệm thu, không phải fixture response. Tài khoản B được tạo riêng cho kiểm thử; không commit mật khẩu/token. Ảnh chỉ dùng giao diện không hiển thị contact của khách A. Không xóa hai lịch thử sau kiểm tra để có thể xem lại.

## Kiểm thử tự động

Socket server: handshake từ chối token sai; hai client nhận tín hiệu không payload sau HTTP ghi thành công, 409 không phát tín hiệu; đổi ca cũng phát tín hiệu. Client: gom burst, refresh khi reconnect, cleanup không gọi refresh sau unmount. Test race transaction/guard hiện có vẫn giữ nguyên.

Không nghiệm thu thiết bị native, Atlas hay nhiều API instance. Socket dùng in-memory adapter một process; định kỳ/focus/reconnect bù tín hiệu bỏ lỡ. Khi scale-out cần adapter chung. Không coi realtime UI là thay thế transaction DB.

## Lệnh kiểm tra

- npm run lint: PASS (toàn repo, sau thay đổi cuối).
- npm test: PASS 1765 test (API 664, Mobile 490, Web 611).
- npm run test --workspace @sol-hair/web: PASS 611 test sau điều chỉnh cuối về refresh định kỳ và xóa thông báo khi chọn giờ mới.
- npm run build: PASS API syntax, Web production, Android/iOS export; Web vẫn có cảnh báo chunk >500 kB.
- git diff --check: PASS.

## Ghép main — 01/11/2026

Hoàn tất lần merge main a4b6b39 đang dở trên nhánh SOL-043. Resolve app.js bằng cách giữ admin EJS/router/assets/urlencoded của main và middleware availabilityInvalidation của SOL-043; bỏ import owner-web đã được main thay thế. Cập nhật matcher realtime cho /admin/appointments, /admin/services và alias /owner/services; test socket HTTP thật kiểm tra cả ba đường dẫn này vẫn phát tín hiệu không payload.

Kiểm tra sau resolve: npm run lint PASS; npm test PASS 1821 (API 763, Mobile 495, Web 563); npm run build PASS API syntax, Web, Android/iOS export; git diff --check origin/main PASS. Có cảnh báo Mongoose new option deprecated và Web chunk >500 kB; không làm yếu test. Không chạy lại nghiệm thu browser/native/DB dữ liệu salon trong lần resolve này.

## Refine chọn dịch vụ — 01/11/2026

Theo mockup desktop/mobile đã duyệt: bổ sung tìm không dấu, lọc category thực, chip Đã chọn x/5, bỏ chọn từ sidebar; thẻ desktop gọn, header mobile gọn; CTA customer cố định đáy mobile, tóm tắt có thể mở/thu gọn ở bước 1–2. Không sửa API, dữ liệu, slot/payload/retry hoặc lịch sử M5 trong lần này.

- npm run lint --workspace @sol-hair/web: PASS.
- npm run test --workspace @sol-hair/web: PASS 565 test / 36 file (thêm test tìm kiếm kết hợp category với 30 dịch vụ, dấu tiếng Việt và fallback category).
- npm run build:web: PASS; cảnh báo chunk >500 kB hiện có.
- git diff --check: PASS.
- Chrome thật: chọn sẵn Cắt; tìm nhuom rồi chọn Nhuộm vẫn giữ Cắt; query không khớp hiện empty state và Xóa bộ lọc; bỏ Nhuộm từ chip, chọn Spa, giá API đúng; ảnh refine-desktop.jpg.
- Chrome 390px: document width = scrollWidth = 390, CTA hiện cố định đáy; mở tóm tắt, bỏ Spa từ sidebar, thu gọn và dùng CTA bước 1 → 2, chọn Stylist An/16:45 → bước 3 có nút xác nhận enabled. Không bấm xác nhận hoặc lưu hồ sơ. Ảnh refine-mobile.jpg.
- Fixture tạm ngoài bundle: BookingPage thật với AuthContext/fetch tổng hợp, 30 dịch vụ / 3 nhóm. Lọc Nhuộm còn 10 checkbox; chọn mục 28 rồi lọc khác vẫn giữ chip; thử chọn mục thứ 6 bị từ chối, đúng 5 checkbox checked; 360px không tràn ngang và fixed bar đáy800px (viewport800). Fixture và tab được xóa sau khi kiểm, không insert DB/không để mock trong source sản phẩm.

Đây là emulation responsive Web, chưa kiểm bàn phím/thiết bị mobile thật. Các đề xuất khác ở đợt audit (contact sớm, date/empty state, success và nhóm lịch quá giờ) chưa triển khai trong mockup chọn dịch vụ này. SOL-043 tiếp tục nghiệm thu; chưa merge PR.

## Refine màn thành công — 01/11/2026 (local, chưa commit)

Theo mockup đã duyệt: trang receipt riêng thay form; mã ngắn immutable/unique index, bản ghi snapshot, ngày/giờ bắt đầu-kết thúc, tổng dịch vụ và link chi tiết. Availability ngừng khi success, không còn Cần chọn lại giờ trống sau khi tạo thành công. Không dùng giá/tên/contact live làm receipt.

- API 764 tests PASS, gồm cố ý collision mã rồi retry đúng, 2 appointments/2 receipts/2 events và replay giữ mã; test snapshot/replay sau sửa catalog/profile vẫn nguyên DTO. Mobile 495 PASS.
- Lần npm test đầu có 1 test Web cũ mong ID dài; cập nhật fixture/expect sang referenceCode và thêm case legacy không hiển thị raw ID. Sau sửa, Web 568/37 files PASS; không bỏ test/không bỏ assertions snapshot/thời gian/giá.
- npm run lint PASS sau thay đổi cuối; npm run build PASS API/Web/Android+iOS export (cảnh báo chunk >500 kB cũ), git diff --check PASS.
- Backfill DB local: cấp mã cho 5 lịch cũ, chạy lại cập nhật 0. Không sửa giờ/trạng thái/dịch vụ. Kiểm DB sau browser QA: 6 appointments có mã/0 mã trùng/unique index tồn tại.
- Chrome origin5174 với tài khoản QA mới Minh Anh QA: đặt Cắt, Stylist Linh, 01/11/2026 18:45–19:45 thành công, reference SOL-R4JJ7JUX; UI thực không còn wizard/cần chọn lại giờ; API thực, không mock POST. Tạo 1 lịch QA mới và giữ lại DB local. Link chi tiết thực hiển thị cùng mã.
- Sau hot reload sửa focus, dùng wrapper tạm render chính BookingSuccess với receipt QA đọc từ DB để chụp success-desktop/mobile.jpg và kiểm responsive390px (không tràn). Wrapper/dữ liệu preview đã xóa, không có mock trong source sản phẩm. Nút sao chép trả feedback thành công từ Clipboard API; công cụ Browser Use dùng virtual clipboard nên không đối chiếu được OS clipboard qua thao tác paste. Không tuyên bố paste E2E đã đạt.
- Chưa native/Atlas. Theo yêu cầu người dùng, toàn bộ sửa đang local, không commit/push/merge. Không cập nhật PR chứa code chưa push.

## Kiểm tra trước commit/push — 01/11/2026

Người dùng đã yêu cầu commit và push các thay đổi màn thành công/mã lịch hẹn và thông báo giới hạn đặt trước. Ghi chú chưa commit ở phần trên phản ánh thời điểm kiểm thử ban đầu. Bàn giao trên nhánh fix/SOL-043-vietnamese-phone, PR #41 tiếp tục Draft; không merge vào main.

- npm run lint: PASS toàn repo.
- npm test: PASS 1.827 tests (API 764, Mobile 495, Web 568).
- npm run build: PASS API, Web và Expo export Android/iOS (984/989 modules). Còn cảnh báo Mongoose deprecated option, NO_COLOR/FORCE_COLOR và chunk Web >500 kB.
- node --check apps/api/scripts/backfill-booking-references.js và git diff --check: PASS.
- Thông báo cạnh ô ngày và DATE_OUT_OF_RANGE nêu rõ tối đa 7 ngày/168 giờ; khách tới ngay chỉ hôm nay. Không đổi logic tính giờ. Chưa kiểm lại trình duyệt hoặc native UI trong lần bàn giao này; bằng chứng Chrome trước đó nằm ở phần trên.
- Đợt thêm ca riêng theo yêu cầu đã nạp 92 ca 09:00–20:00 ngày 08–30/11 cho 4 nhân sự vào DB local, kiểm lại ca/giờ trống và giữ nguyên lịch hẹn. Dữ liệu DB không nằm trong commit.

## Sửa 5 điểm audit customer — 01/11/2026

- Chặn điều hướng SPA khi gửi/chờ xác minh booking, giữ intent/key; liên hệ ở bước 1; empty slot có gợi ý và nhắc trùng lịch khách; tab Đến/quá giờ giữ confirmed; picker giới hạn ngày +7, API giữ horizon 168 giờ.
- PASS npm run lint --workspace @sol-hair/web, npm run test --workspace @sol-hair/web (580 tests / 41 files), npm run build:web và git diff --check. Build còn cảnh báo chunk >500 kB.
- Test React DOM trong happy-dom chạy router và hook thật: click Link/Back khi POST chưa trả giữ request sống; lỗi 503 rồi retry cùng key/payload; sau success/409 điều hướng được; liên hệ lưu ở bước 1 rồi chọn giờ một lần đến xác nhận; picker max và input ngoài phạm vi không gọi API; empty slot có gợi ý. Clock test kiểm phân nhóm ở đúng startAt, giữ status, link chi tiết/hỗ trợ và khóa đổi theo cutoff.
- Test link chi tiết cũ dùng fixture tháng 10 được cố định đồng hồ trước lịch hẹn để kiểm đúng mục Sắp tới. Không bỏ kiểm tra link/action; thêm test riêng cho mục Đến/quá giờ.
- Chỉ kiểm DOM tự động, chưa chạy lại Chrome hoặc native UI trong đợt này. Không ghi DB hoặc Google Sheet; thay đổi hiện local, chưa commit/push.

## Kiểm lại Chrome trước commit/push — 01/11/2026

Theo yêu cầu người dùng: kiểm Chrome rồi commit/push nếu ổn. Chrome thật trên localhost:5173, API localhost:4000 và DB local hiện có; không thay code sau bộ kiểm 580 test Web đã PASS.

- API/DB thật: homepage chọn sẵn Cắt; chọn cả 3 dịch vụ rồi sang bước 2, chọn An: empty slot có gợi ý đổi ngày/stylist/giảm dịch vụ và nhắc giờ trùng lịch khách. Ảnh audit-empty-slot-chrome.jpg.
- Picker thật có min 01/11 và max 08/11/2026. Phím ArrowUp đổi ngày 01 → 02 và tải lại slot; lặp qua giới hạn 08 thì native Chrome quay về ngày trong khoảng. Không gửi ngày 09 tới API. Công cụ fill() của browser chỉ thay giá trị DOM cho input date, chưa phát sự kiện React; không dùng kết quả fill đó làm bằng chứng validation. Test DOM tự động đã kiểm handler từ chối ngày ngoài phạm vi.
- API/DB thật: Lịch của tôi có Sắp tới 3 / Đến-quá-giờ 2 / Lịch sử 1; 2 lịch confirmed cũ ở 14:00 ngày 01/11 và 17:00 ngày 31/10 chuyển đúng nhóm Đến/quá giờ, giữ badge Đã xác nhận, có Chi tiết/Hỗ trợ và không có đổi/hủy trực tuyến. Ảnh audit-overdue-chrome.jpg.
- Chrome viewport override 390×844 (clientWidth 375 do scrollbar): ba tab xuống dòng, không tràn ngang (scrollWidth = clientWidth = 375). Ảnh audit-overdue-mobile-chrome.jpg. Đã reset viewport.
- Kịch bản QA frontend trên chính BookingPage/router/hook thật: dùng CDP Fetch override riêng auth/me và POST appointments, không thay source, không gọi ghi DB. Hồ sơ giả thiếu phone hiện liên hệ ở bước 1, CTA disabled dù đã chọn Cắt. Gõ phone mẫu, phản hồi PATCH/GET giả thành công: vẫn bước 1, giữ Cắt và CTA enabled; sang bước 2 chọn An/09:00 ngày 02/11 một lần rồi tới xác nhận. Ảnh audit-contact-chrome.jpg. Không sửa hồ sơ tài khoản hiện tại.
- POST QA được giữ ở tầng Fetch, click Link Lịch của tôi không rời booking. Trả 503 giả rồi bấm Back: vẫn booking, hiện lý do, giữ CTA Thử lại cùng yêu cầu. Ảnh audit-navigation-blocked-chrome.jpg. Retry POST thứ 2 có cùng Idempotency-Key và payload (chỉ đối chiếu boolean, không lưu token/key). Trả 201 fixture: màn thành công hiện, Link Lịch của tôi điều hướng được. Đây là kiểm frontend với phản hồi mô phỏng, không phải tạo lịch thật hoặc nghiệm thu lại transaction DB.
- Một request hồ sơ bị timeout trong lúc thiết lập interception; UI báo lỗi/thử lại đúng, sau đó tiếp tục được. Không phát hiện lỗi app hoặc console error mới trong lượt kiểm.
- Đã gỡ toàn bộ raw interception bằng Fetch.enable patterns=[], rời trang QA và mở lại booking với hồ sơ/API thật. Không còn dữ liệu QA trong UI. Không tạo/sửa/xóa lịch, không ghi DB hoặc Google Sheet trong lượt kiểm này. Các ảnh QA được ghi rõ ở trên; không chứa credential.
- Tiếp tục dùng kết quả npm run lint --workspace @sol-hair/web, 580 test/41 files và build:web PASS ở lượt sửa trước vì source không đổi trong lượt browser; git diff --check được kiểm lại trước commit. Chưa native/thiết bị thật. PR #41 giữ Draft, không merge main.
