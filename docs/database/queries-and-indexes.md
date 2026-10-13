# Luồng đọc/ghi và index — PROPOSED

<a id="workload"></a>
## Workload trước khi chọn collection

| Mã/hiện trạng | Luồng, dữ liệu cần trả | Filter / sort / giới hạn |
| --- | --- | --- |
| Q1 — có code | GET /api/services, 8 field danh mục | isActive=true; displayOrder asc,id asc; hiện không phân trang/limit |
| Q2 — đề xuất | Chi tiết dịch vụ | slug+isActive; tối đa 1; cùng DTO Q1 |
| Q3 — đề xuất | Stylist làm được các dịch vụ chọn | isActive=true, serviceIds `$all` 1–3 IDs; name,_id; <=50 stylist v1 |
| Q4 — đề xuất | Lịch trống của một stylist/ngày | weeklyHours + time_off giao ngày + appointments chặn giao ngày; kiểm cooldown thực tế và in_progress quá giờ theo B2; DTO chỉ slot, không tên/phone khách; khoảng tìm <=31 ngày |
| Q5 — đề xuất | Tạo booking | Đọc Q4 dưới guard staff + customer/account/services, ghi staff và appointment trong cùng transaction |
| Q6 — đề xuất | Khách xem lịch của mình | customerId từ identity; sort startAt desc,_id desc; cursor cặp này, page 20 tối đa 50 |
| Q7 — đề xuất | Lịch tiệm theo ngày hoặc stylist/ngày | localDate eq (+staffId eq); sort startAt asc,_id asc; page 50 tối đa 100; tiếp tục cursor đến hết |
| Q8 — đề xuất | Hủy/đổi/bắt đầu/hoàn tất | _id+revision+status; guard staff cũ/mới; authorization; cập nhật một appointment |
| Q9 — đề xuất | Sửa ca, nghỉ, năng lực hoặc ngừng staff | Guard staff; đọc mọi in_progress và confirmed có occupiedUntil>now, từ chối khi vi phạm; thay staff hoặc time_off atomically |
| Q10 — đề xuất | Login/link hồ sơ; gửi lại request | emailNormalized; accountId khi có; (createdByAccountId,requestKey); lastCommand đọc theo appointment._id |
| Q11 — đề xuất | Kho images: liệt kê, tìm theo tiền tố tên file | Quyền owner/receptionist; isActive eq (mặc định true); sort createdAt desc,_id desc; cursor/page 20 tối đa 50; tên prefix có escape, tối đa 100 ký tự, lọc dư bằng I15, không hứa index tối ưu tìm tên |
| Q12 — đề xuất | Gắn/bỏ/sắp xếp ảnh và chọn cover dịch vụ | Đọc images theo tập _id tối đa 10; kiểm existence/active cho link mới; validate và CAS cover/gallery của 1 services document; B7 |
| Q13 — đề xuất | Tra nơi đang dùng một ảnh | services.images.imageId eq, bao gồm service inactive; sort id asc; cursor/page 20 tối đa 50; đây là danh sách nơi dùng được hỗ trợ trong v1, chưa có avatar/banner |
| Q14 — đề xuất | Đăng ký asset upload, archive/khôi phục | Unique cloudName+cloudinaryAssetId/publicId; update images._id; không có purge hoặc call Cloudinary trong MongoDB transaction |

Đây là giả định tải nhỏ của một tiệm, thiên về đọc danh mục; chưa có telemetry hoặc đo explain. Không đánh giá tốc độ từ danh sách index.

## Query có bằng chứng và DTO

Repository hiện gọi:

```js
ServiceModel.find({ isActive: true })
  .sort({ displayOrder: 1, id: 1 })
  .select('-_id -__v -isActive -displayOrder -createdAt -updatedAt')
  .lean()
```

Controller trả `{data:[{id,slug,name,description,category,durationMinutes,priceVnd,imageUrl}]}` hoặc 503 DATABASE_UNAVAILABLE. Projection là **danh sách loại trừ**: thêm bookingDurationMinutes/coverImageId/images vào DB mà không sửa projection sẽ làm field mới lọt ra API. Kế hoạch chuyển đổi bắt buộc đổi sang allowlist 8 field trước khi backfill. Schema đích resolve cover từ collection images và dựng imageUrl; không đưa gallery/metadata vào DTO cũ. Không làm điều đó trong SOL-011. [Repository/test](../../apps/api/src/modules/services/tests/services.repository.test.js).

Q1/Q2 sau chuyển đổi: lấy services theo filter/sort cũ, gom coverImageId khác nhau rồi đọc images bằng `_id:{$in:...}` hoặc lookup tương đương; map URL và allowlist đúng 8 field. Không lọc cover theo isActive (archive vẫn giữ liên kết cũ), không truy vấn 1 lần/1 thẻ. Khi catalog lớn, cần chốt pagination trước, hiện Q1 vẫn giữ hợp đồng không phân trang. Cover thiếu là lỗi integrity, trả lỗi server JSON an toàn, không bỏ thẻ hoặc fallback tùy ý. Hành vi 503 DATABASE_UNAVAILABLE khi DB không sẵn sàng vẫn giữ. Gallery API/public endpoint chưa được giao.

Web fetchServices trả response.data, ServiceCard dùng duration min/max, priceVnd và imageUrl; Home hiển thị danh mục. Mobile hiện chỉ có feature health, chưa có consumer services thực thi; DTO dự kiến dùng chung phải giữ id String khi bổ sung sau này. File [DTO mẫu](examples/services-response.json) chỉ là envelope hợp đồng, **không phải collection**.

## Query đặt lịch đề xuất

```js
// Pseudocode, chưa chạy. Luôn sau guard staff, cùng session khi ghi.
appointments.findOne({
  staffId: S,
  status: { $in: ['confirmed', 'in_progress', 'completed'] },
  startAt: { $lt: newOccupiedUntil },
  occupiedUntil: { $gt: newStartAt },
  // _id: {$ne: currentAppointmentId} chỉ khi đổi lịch
})
staff_time_off.findOne({
  staffId: S, startAt: { $lt: newOccupiedUntil }, endAt: { $gt: newStartAt },
})
// Ngày local không phải UTC midnight
appointments.find({ localDate: '2026-10-05', staffId: S })
  .sort({ startAt: 1, _id: 1 }).limit(50)
// Cooldown thực tế: dùng prefix staffId,status của I8 rồi lọc completedAt.
// V1 chấp nhận residual scan; đo trước khi thêm index completedAt.
appointments.find({ staffId: S, status: 'completed',
  completedAt: { $gt: nowMinus10Minutes } })
// Lấy max completedAt ở tập này; từ chối start mới trước max+10 phút.
```

Cursor Q6: `(startAt < lastStart) OR (startAt == lastStart AND _id < lastId)`, cùng customerId; Q7 đổi sang dấu >. Cursor do server tạo/validate, không dùng skip lớn; không cho client tự chọn customerId để vượt quyền. Bộ lọc status tùy chọn là post-filter theo index ngày; không tạo thêm index trước khi đo.

## Danh mục index

Tất cả index bên dưới là **đề xuất, chưa áp dụng/chưa đọc từ DB**. Với services id/slug: code đã khai báo unique; không suy ra index thực tế đã xây thành công. Collection đều có unique `_id` mặc định MongoDB, không thêm index lặp.

| Mã | Collection và key order | Options chính xác | Query/invariant | Chi phí/giới hạn |
| --- | --- | --- | --- | --- |
| I1 | services `{id:1}` | unique:true | Public id và reference Q1/Q5 | Giữ khai báo hiện có; kiểm duplicate trước tạo |
| I2 | services `{slug:1}` | unique:true | Q2, URL không trùng | Giữ khai báo hiện có |
| I3 | services `{isActive:1,displayOrder:1,id:1}` | không options | Q1 filter+sort | Thêm 1 index/ghi; không covered query vì cần description/image |
| I4 | accounts `{emailNormalized:1}` | unique:true | Q10 login | Normalize ở app; dùng simple binary collation mặc định |
| I5 | customers `{accountId:1}` | unique:true, partialFilterExpression:`{accountId:{$type:'objectId'}}` | Tối đa1 profile/account | Bỏ qua field thiếu; không dùng unique nullable đơn thuần |
| I6 | staff `{accountId:1}` | như I5 | Tối đa1 staff/account | Role do service kiểm |
| I7 | staff_time_off `{staffId:1,startAt:1}` | không options | Q4/Q9 overlap nghỉ | endAt lọc dư; hai điều kiện range không cùng được tối ưu đầy đủ |
| I8 | appointments `{staffId:1,status:1,startAt:1}` | không options | Overlap Q4/Q5; in_progress; Q9 tương lai | occupiedUntil lọc dư; không bảo đảm chống trùng; guard mới bảo vệ ghi |
| I9 | appointments `{customerId:1,startAt:-1,_id:-1}` | không options | Q6 cursor | Mỗi lịch thêm 1 entry |
| I10 | appointments `{localDate:1,startAt:1,_id:1}` | không options | Q7 toàn tiệm | Cần field localDate derived đúng |
| I11 | appointments `{staffId:1,localDate:1,startAt:1,_id:1}` | không options | Q7 theo stylist | Phục vụ sort khác I8; thêm chi phí ghi, đánh giá lại khi đo |
| I12 | appointments `{createdByAccountId:1,requestKey:1}` | unique:true | Idempotency Q5/Q10 | Giữ key không TTL; tăng dung lượng theo lịch |
| I13 | images `{cloudName:1,cloudinaryAssetId:1}` | unique:true | Q14 không đăng ký cùng asset hai lần | Đối chiếu asset và actor khi retry; unique không thay auth |
| I14 | images `{cloudName:1,publicId:1}` | unique:true | Q14 identity resource_type=image,type=upload duy nhất v1 | Nếu hỗ trợ type/resource khác phải đổi key trước; không rename/overwrite |
| I15 | images `{isActive:1,createdAt:-1,_id:-1}` | không options | Q11 filter + cursor/sort | Tìm tên là residual scan; không index text/regex trước khi đo |
| I16 | services `{'images.imageId':1,id:1}` | không options, multikey | Q13 lọc nơi dùng, sort/cursor theo id | Tối đa 10 entry/service; không unique vì ảnh được tái sử dụng; explain sort chưa đo |

Không index serviceIds vì <=50 staff nên quét có giới hạn chấp nhận được; không index passwordHash/phone/snapshot/notes. Không unique(staffId,startAt): không chặn giao nhau khác start. Không partial index theo blocking states ở v1 để tránh query không khớp filter; I8 dùng index thường. Partial I5/I6 nhắm MongoDB 8.0, `$type:'objectId'` được hỗ trợ; lookup dùng giá trị ObjectId nên phù hợp subset, truy vấn field missing/null không dùng để liệt kê tất cả bằng index này. [MongoDB 8.0 partial indexes](https://www.mongodb.com/docs/v8.0/core/index-partial/).

Không index riêng coverImageId: cover phải là thành viên gallery, Q13 bao gồm cover qua cùng multikey I16. Không TTL trên images; archive không phải purge. Upload mới cần actor nhưng uploadedByAccountId không là bộ lọc v1, chưa index. Tất cả index images/I16 chỉ là đề xuất; chưa có lệnh tạo hoặc explain thực tế.

Khi triển khai: kiểm explain bằng dataset giả có kích thước đại diện; kiểm scanned/returned, sort và write overhead. Không tạo index tự động từ request; không chạy syncIndexes để xóa index ngoài ý muốn. Index không enforce reference/role/trạng thái hoặc nhiều document overlap.
