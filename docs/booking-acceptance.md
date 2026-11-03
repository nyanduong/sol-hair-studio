# SOL-034 — Chạy nghiệm thu với API và MongoDB thật cục bộ

Harness chỉ phục vụ phát triển/nghiệm thu, không được chạy làm server sản phẩm.
Nó luôn tạo MongoDB replica set mới bằng mongodb-memory-server; không nhận URI DB bên ngoài.
Không cần SMTP, Atlas, .env hoặc credentials salon. Không thêm dependency/workspace.

## API và Web

Từ root, mở terminal giữ tương tác stdin:

```powershell
npm run acceptance:booking --workspace @sol-hair/api -- --evidence-dir ../../docs/evidence/SOL-034
```

Tùy chọn `--port` mặc định 4012; thư mục evidence tương đối tính theo workspace API.
Không ghi đè bằng chứng đã bàn giao nếu đang chạy lại: chọn thư mục output mới.
Process in URL và đường dẫn file credential tạm, không in token/password. Đọc file đó cục bộ để đăng nhập
các tài khoản web/mobile/owner. Password sinh ngẫu nhiên mỗi lần; không commit, chụp ảnh hoặc đính kèm file credential.
Hai khách tổng hợp chung phone vẫn là hai mã hồ sơ riêng. Có stylist A/B, ca 8 ngày tới và dịch vụ fixed duration.

Terminal Web:

```powershell
$env:VITE_API_BASE_URL='http://127.0.0.1:4012'
npm run dev --workspace @sol-hair/web -- --host localhost --port 5178 --strictPort
```

Mở `/booking`, login M1, chọn dịch vụ/stylist/giờ, xác nhận, đối chiếu mã lịch trong evidence DB.
Owner tìm số có hai hồ sơ, chọn đúng mã; thử owner scheduled, guest và tới ngay.
Guest phải tạo hồ sơ mới, không tự gộp người chung số.

Các lệnh gõ vào terminal harness:

| Lệnh | Tác dụng trong DB/transport tạm |
| --- | --- |
| `drop-next` | Bỏ response của lần POST tạo lịch thành công tiếp theo sau khi API trả 2xx; mỗi lần gõ tăng một lượt. Chrome có thể tự retry; gõ hai lần để thấy trạng thái chưa xác định rồi retry thủ công. |
| `audit` | Ghi db-audit.json và transport.json đã loại credential; so cùng keyHash/requestHash và appointmentId trước/sau retry. |
| `change-catalog` | Đổi tên/giá dịch vụ trong DB tạm để đối chiếu snapshot lịch cũ, rồi ghi audit. |
| `stop` | Ghi audit cuối, dừng proxy/API/replica set, xóa file credential tạm. Dừng Vite bằng Ctrl+C riêng. |

Proxy loopback chuyển tiếp mọi route tới Express thật, không cung cấp route điều khiển qua HTTP,
không sửa response nghiệp vụ và không log Authorization/body/contact. Product server không import proxy.

## Android — cần thực hiện để nghiệm thu đủ

Chỉ chạy khi môi trường cho phép khởi động Expo. Lần SOL-034 này lệnh đã bị duyệt tự động từ chối;
không dùng các bước sau để vượt từ chối đó. Bảng dưới là hướng dẫn tái chạy thủ công về sau.

| Mục | Cấu hình/ca cần kiểm |
| --- | --- |
| API | Android Emulator gọi `http://10.0.2.2:4012`, Web dùng loopback; không dùng localhost của thiết bị cho host PC. |
| App | Expo SDK 57 / Expo Go tương thích; cấu hình EXPO_PUBLIC_API_BASE_URL trước khi khởi động app. |
| Login/contact | Login tài khoản mobile tổng hợp; thử thiếu tên/phone và lưu qua M1, active/role gate. |
| Tạo lịch | Chọn 1–5 dịch vụ, ngày, stylist, slot; tạo thành công và đối chiếu cùng mã trong DB audit. |
| Tranh lịch | Web và Android cùng đọc/chọn một slot, gửi gần đồng thời; một bên thành công, một bên 409 và phải bỏ giờ cũ. DB chỉ một lịch/event/receipt. |
| Mất response | `drop-next`, submit Android; pending intent khóa chỉnh/rời màn hình; retry cùng payload/key nhận cùng mã lịch. |
| UI native | Safe area, bàn phím/contact, back khi pending, loading/empty/error/retry, chữ lớn và màn hẹp; chụp ảnh thật theo từng ca. |

Không coi test Node của adapter, build Android/iOS hoặc boot emulator là kiểm thử UI.
Chưa kiểm iOS/thiết bị thật/Atlas trong phạm vi nghiệm thu này.

## Bộ kiểm tra HTTP có thể lặp lại

```powershell
npm run test:booking:integration --workspace @sol-hair/api
npm run lint
npm test
npm run build
```

Test integration tự tạo replica set tạm và server socket thật; không cần harness/Vite đang chạy.
Đồng hồ Date được cố định cho biên 30 phút, horizon 7 ngày và receipt 24h; TTL cleanup không bị giả là chạy đúng hạn.
Cùng slot dùng Promise.allSettled của hai adapter có HTTP thật, không kiểm tuần tự.
Proxy gây mất socket sau khi upstream hoàn tất commit, sau đó kiểm DB và replay.
CI có thể chứng minh phần HTTP/DB; [ma trận bằng chứng](evidence/SOL-034/README.md) phân biệt rõ phần native chưa đạt.
