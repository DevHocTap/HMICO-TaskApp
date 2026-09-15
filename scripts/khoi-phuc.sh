#!/usr/bin/env bash
#
# KHÔI PHỤC database từ một bản sao lưu (pg_dump -Fc) — chốt 15/09/2026:
# việc này CỐ Ý KHÔNG có trên giao diện. Một cú bấm nhầm là ghi đè điểm KPI
# của cả công ty bằng dữ liệu hôm qua; chạy script trên máy chủ, có người
# ngồi trước bàn phím, mới đủ chậm để nghĩ.
#
# Dùng:   ./scripts/khoi-phuc.sh <file.dump> [--vao <ten_db>]
#
#   Không có --vao : khôi phục ĐÈ LÊN database trong DATABASE_URL (.env).
#                    Trước khi đè, script tự dump bản hiện tại ra
#                    $BACKUP_DIR/truoc-khoi-phuc_<giờ>.dump để còn đường lùi.
#   --vao kpi_thu  : khôi phục vào một database KHÁC (tạo mới nếu chưa có) —
#                    dùng để DIỄN TẬP hằng quý hoặc xem lại dữ liệu năm cũ mà
#                    không đụng hệ thống đang chạy.
#
# Yêu cầu: biến CHO_PHEP_KHOI_PHUC=toi-hieu-viec-nay-ghi-de-du-lieu trong môi
# trường (hoặc .env.local). Không đoán, không hỏi y/n — phải gõ đúng chuỗi.
# Sau khi khôi phục: `npx prisma migrate deploy` nếu bản sao cũ hơn mã đang
# chạy (file .json cạnh bản sao ghi migration lúc dump), rồi khởi động lại API.

set -euo pipefail
cd "$(dirname "$0")/.."

CHUOI_DONG_Y='toi-hieu-viec-nay-ghi-de-du-lieu'
FILE="${1:-}"
DICH=""
if [ "${2:-}" = "--vao" ]; then DICH="${3:-}"; fi

[ -n "$FILE" ] || { echo "Cách dùng: $0 <file.dump> [--vao <ten_db>]"; exit 1; }
[ -f "$FILE" ] || { echo "Không thấy file: $FILE"; exit 1; }

DONG_Y="${CHO_PHEP_KHOI_PHUC:-}"
if [ -z "$DONG_Y" ] && [ -f .env.local ]; then
  DONG_Y=$(grep -m1 '^CHO_PHEP_KHOI_PHUC=' .env.local | cut -d= -f2- | tr -d '"'"'"'' || true)
fi
if [ "$DONG_Y" != "$CHUOI_DONG_Y" ]; then
  echo "DỪNG: chưa có biến đồng ý. Đặt CHO_PHEP_KHOI_PHUC=$CHUOI_DONG_Y rồi chạy lại."
  exit 1
fi

# Đọc kết nối từ .env (cùng nguồn với API)
URL=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"'"'"'')
[ -n "$URL" ] || { echo "Không đọc được DATABASE_URL trong .env"; exit 1; }
eval "$(python3 - "$URL" <<'PY'
import sys, urllib.parse as u
p=u.urlparse(sys.argv[1])
print(f"PGHOST={p.hostname} PGPORT={p.port or 5432} PGUSER={u.unquote(p.username)} PGPASSWORD='{u.unquote(p.password)}' DB_GOC={p.path.lstrip('/')}")
PY
)"
export PGHOST PGPORT PGUSER PGPASSWORD
MODE=$(grep -m1 '^BACKUP_MODE=' .env | cut -d= -f2- | tr -d '"'"'"'' || echo local)
CONTAINER=$(grep -m1 '^BACKUP_DOCKER_CONTAINER=' .env | cut -d= -f2- | tr -d '"'"'"'' || echo kpi-postgres)
BACKUP_DIR=$(grep -m1 '^BACKUP_DIR=' .env | cut -d= -f2- | tr -d '"'"'"'' || echo ./backups)

# Chạy lệnh psql/pg_restore/pg_dump theo chế độ (local hay trong container)
pg() {
  if [ "$MODE" = "docker" ]; then docker exec -i -e PGPASSWORD="$PGPASSWORD" "$CONTAINER" "$@"
  else "$@"; fi
}

DB_DICH="${DICH:-$DB_GOC}"
echo "Bản sao lưu : $FILE"
[ -f "$FILE.json" ] && echo "Migration    : $(python3 -c "import json;print(json.load(open('$FILE.json')).get('migrationMoiNhat'))")"
echo "Khôi phục vào: $DB_DICH ($( [ -n "$DICH" ] && echo 'database riêng, hệ thống đang chạy không bị đụng' || echo 'GHI ĐÈ database đang chạy'))"

# Kiểm file đọc được trước khi làm bất cứ gì
pg pg_restore --list < "$FILE" > /dev/null || { echo "File không phải bản pg_dump -Fc hợp lệ"; exit 1; }

if [ -z "$DICH" ]; then
  mkdir -p "$BACKUP_DIR"
  LUI="$BACKUP_DIR/truoc-khoi-phuc_$(date +%Y-%m-%d_%H%M%S).dump"
  echo "Dump bản hiện tại ra $LUI để còn đường lùi..."
  pg pg_dump -Fc -U "$PGUSER" -d "$DB_GOC" > "$LUI"
  echo "Ngắt mọi kết nối đang mở vào $DB_GOC (API phải đang TẮT)..."
  pg psql -U "$PGUSER" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DB_GOC' AND pid <> pg_backend_pid();" > /dev/null
else
  pg psql -U "$PGUSER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DICH'" | grep -q 1 \
    || pg psql -U "$PGUSER" -d postgres -c "CREATE DATABASE \"$DICH\"" > /dev/null
fi

echo "Khôi phục (--clean --if-exists: xoá bảng cũ rồi tạo lại từ bản sao)..."
pg pg_restore -U "$PGUSER" -d "$DB_DICH" --clean --if-exists --no-owner --no-privileges < "$FILE"

SO_PHIEU=$(pg psql -U "$PGUSER" -d "$DB_DICH" -tAc 'SELECT count(*) FROM "Scorecard";')
SO_NGUOI=$(pg psql -U "$PGUSER" -d "$DB_DICH" -tAc 'SELECT count(*) FROM "User";')
echo "XONG. $DB_DICH có $SO_NGUOI tài khoản, $SO_PHIEU phiếu KPI."
if [ -z "$DICH" ]; then echo "Tiếp theo: npx prisma migrate deploy (nếu bản sao cũ hơn mã) rồi khởi động lại API."; fi
exit 0
