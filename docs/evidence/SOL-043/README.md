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
