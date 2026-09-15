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

## Khôi phục

**Hai đường, cùng một cơ chế** (`pg_restore --clean --if-exists`), đều tự
dump bản hiện tại ra `truoc-khoi-phuc_<giờ>.dump` trước khi ghi đè — lỡ
nhầm thì khôi phục lại từ bản đó. Bản lùi này KHÔNG bị dọn tự động (tên
ngoài khuôn `kpi_*`), ADMIN xoá tay khi không cần.

**1. Trên giao diện (ADMIN, chốt 15/09 theo yêu cầu người dùng):** nút
"Khôi phục" trên từng dòng ở trang Sao lưu. Bốn lớp chặn:
- phải **gõ đúng tên file** để bật nút xác nhận;
- bản sao phải có `.json` và **cùng migration** với mã đang chạy — khác thì
  từ chối (khôi phục xong app sẽ lỗi), chỉ sang script;
- dump bản lùi trước, dump hỏng thì dừng, chưa đụng dữ liệu;
- không chạy chồng với sao lưu.
Sau khi đè, API tự nối lại Prisma và nạp lại cache cài đặt; AuditLog
`Backup/RESTORE` ghi **sau** khi đè (bảng AuditLog cũng vừa bị thay). Mọi
người có thể phải đăng nhập lại (bảng RefreshToken quay về bản sao).

**2. Script trên máy chủ** — cho ca giao diện từ chối (bản cũ hơn mã, file
chép tay không `.json`), hoặc khi API không lên được:

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

**Diễn tập mỗi quý** bằng `--vao`: bản sao chưa từng khôi phục thử thì chưa
phải bản sao. `scripts/kiem-chung-sao-luu.sh` làm tự động (54 kiểm, gồm
khôi phục thật cả bằng script vào DB riêng lẫn bằng API vào DB đang chạy).

## Xem lại dữ liệu năm cũ

Dữ liệu trong hệ thống **không bao giờ bị xoá** — chọn kỳ cũ ở ô "Kỳ:" là
xem được. Bản sao cuối năm chỉ dùng khi cần "hệ thống đúng như lúc
31/12/20xx" (trước khi có chỉnh sửa về sau): khôi phục vào DB riêng bằng
`--vao`, trỏ một API tạm vào đó mà xem.
