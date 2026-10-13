# Sơ đồ DB baseline MVP — SOL-016

[PNG](sol-db-baseline.png) render từ [Mermaid](sol-db-baseline.mmd). [JSON sơ đồ](sol-db-baseline.visualeaf.json) cập nhật offline từ cấu trúc export VisuaLeaf cũ; **không phải export mới từ widget, chưa kiểm chứng native round-trip**. Schema đầy đủ ở [schema](../schema.md); sơ đồ lược field để đọc ranh giới.

11 collection, reference do ứng dụng kiểm tra, không MongoDB foreign key. items/customerSnapshot/lastCommand/gallery là embedded bounded, không collection. services.id String; phần còn lại _id ObjectId. Optional nghĩa được thiếu, không null. Owner liên kết staff bằng accountId; customers.accountId optional cho guest.

OTP challenge tách riêng, không TTL; booking_requests TTL chỉ dọn key24h; appointments/events giữ lịch sử. dated shifts thay weeklyHours. Đường quan hệ không tự đảm bảo quyền, uniqueness hoặc interval; xem [query/index](../queries-and-indexes.md).

PNG được render bằng Mermaid CLI cache/Edge cục bộ, không cài dependency vào repo. JSON vẫn giữ convention connectionType SQL của exporter cũ để tương thích shape, nhưng tên/field là MongoDB; không DDL hoặc file triển khai DB. Provenance lưu trong _meta.
