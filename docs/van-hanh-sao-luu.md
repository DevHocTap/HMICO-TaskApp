# Vận hành sao lưu & khôi phục

> Chốt 15/09/2026. Đọc cả file trước lần khôi phục đầu tiên.

## Sao lưu

| | |
|---|---|
| Cách | `pg_dump -Fc` toàn bộ database, do chính API chạy (`src/modules/backup/`) |
| Khi nào | tự động hằng đêm theo giờ trong Cài đặt → Sao lưu (mặc định 02:00), bù khi máy chủ khởi động nếu hôm đó chưa có; bấm tay bất cứ lúc nào |
| Ở đâu | `BACKUP_DIR` (máy chủ: `/var/backups/kpi`), mỗi bản một `.dump` + một `.json` (kích thước, thời điểm, người bấm, migration lúc dump) |
| Bản thứ hai | `BACKUP_MIRROR_DIR` — IT gắn ổ ngoài / NAS rồi trỏ vào; chép hỏng KHÔNG làm hỏng bản chính, chỉ mất dấu ✓ "Bản 2" |
| Kiểm tra | mỗi bản chạy `pg_restore --list`; không đọc được thì xoá và tính là THẤT BẠI |
| Giữ lại | 14 bản ngày + 12 bản cuối tháng (đặt được) + bản cuối mỗi năm **vĩnh viễn** |
| Cảnh báo | Tổng quan của ADMIN báo đỏ khi > 36 giờ chưa có bản lành; lỗi gần nhất hiện ở trang Sao lưu |
| Ai xem / tải | chỉ ADMIN — file chứa hash mật khẩu và điểm của mọi người. Mỗi lần tải ghi AuditLog |
| Yêu cầu máy | chế độ `local`: có `pg_dump`/`pg_restore` **bản 16** trên máy chạy API (image Docker cài `postgresql-client-16`); chế độ `docker`: máy dev, gọi `docker exec kpi-postgres` |

Nguồn sự thật là **thư mục file**, không có bảng lịch sử trong database —
database hỏng thì bảng cũng hỏng theo, file thì vẫn còn.

## Khôi phục — CỐ Ý không có trên giao diện

```bash
# Xem lại / diễn tập: vào database RIÊNG, hệ thống đang chạy không bị đụng
CHO_PHEP_KHOI_PHUC=toi-hieu-viec-nay-ghi-de-du-lieu \
  ./scripts/khoi-phuc.sh /var/backups/kpi/kpi_2026-12-31_020000.dump --vao kpi_2026

# Khôi phục THẬT (ghi đè database đang chạy) — TẮT API trước
systemctl stop kpi-api            # hoặc docker compose stop api
CHO_PHEP_KHOI_PHUC=toi-hieu-viec-nay-ghi-de-du-lieu \
  ./scripts/khoi-phuc.sh /var/backups/kpi/kpi_2026-09-14_020000.dump
npx prisma migrate deploy          # nếu bản sao cũ hơn mã đang chạy (xem .json)
systemctl start kpi-api
```

Script tự dump bản hiện tại ra `truoc-khoi-phuc_<giờ>.dump` trước khi ghi
đè — lỡ khôi phục nhầm thì khôi phục lại từ file đó.

**Diễn tập mỗi quý** bằng lệnh `--vao`: bản sao chưa từng khôi phục thử thì
chưa phải bản sao. `scripts/kiem-chung-sao-luu.sh` làm đúng việc này tự
động (41 kiểm, gồm một lượt khôi phục thật vào DB riêng).

## Xem lại dữ liệu năm cũ

Dữ liệu trong hệ thống **không bao giờ bị xoá** — chọn kỳ cũ ở ô "Kỳ:" là
xem được. Bản sao cuối năm chỉ dùng khi cần "hệ thống đúng như lúc
31/12/20xx" (trước khi có chỉnh sửa về sau): khôi phục vào DB riêng bằng
`--vao`, trỏ một API tạm vào đó mà xem.
