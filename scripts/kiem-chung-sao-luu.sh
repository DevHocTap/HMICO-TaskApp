#!/usr/bin/env bash
#
# Kiểm chứng SAO LƯU database (15/09/2026) bằng curl trên hệ thống chạy thật.
#
# Chạy:  ./scripts/kiem-chung-sao-luu.sh
# Yêu cầu: PostgreSQL (Docker `kpi-postgres`) đang chạy, đã `npm run build`.
#
# Tự khởi động API ở cổng 3198 với THƯ MỤC SAO LƯU TẠM (không đụng BACKUP_DIR
# thật), tự tắt và xoá thư mục tạm khi xong. Chỉ ghi AuditLog loại Backup —
# dọn theo mốc như các script khác. Cài đặt `saoLuu` khôi phục nguyên văn.
#
# Gồm cả một lượt KHÔI PHỤC THẬT bằng scripts/khoi-phuc.sh vào database riêng
# `kpi_kiemchung_saoluu` rồi so số phiếu — bản sao chưa thử khôi phục thì
# chưa phải bản sao.

set -uo pipefail
cd "$(dirname "$0")/.."
. "$(dirname "$0")/_chi-chay-cuc-bo.sh"

PORT=3198
API="http://localhost:$PORT"
MAT_KHAU="${SEED_PASSWORD:-Hmico@2026}"
MAT_KHAU_PHU="${SEED_PASSWORD_ALT:-}"
if [ -z "$MAT_KHAU_PHU" ] && [ -f .env.local ]; then
  MAT_KHAU_PHU=$(grep -m1 '^SEED_PASSWORD_ALT=' .env.local | cut -d= -f2- | tr -d '"'"'"'')
fi
TMP=$(mktemp -d)
DIR="$TMP/backups"; MIRROR="$TMP/mirror"
SO_PASS=0; SO_FAIL=0
pass() { SO_PASS=$((SO_PASS+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { SO_FAIL=$((SO_FAIL+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; }
buoc() { printf '\n\033[1m%s\033[0m\n' "$1"; }
sql() { docker exec kpi-postgres psql -U kpi_dev -d kpi_db -t -A -c "$1" 2>/dev/null; }
. "$(dirname "$0")/_moc-du-lieu.sh"

don_dep() {
  [ -n "${PID_API:-}" ] && kill "$PID_API" 2>/dev/null
  wait 2>/dev/null
  xoa_auditlog_cua_script
  sql "DELETE FROM \"SystemSetting\" WHERE key='saoLuu'; INSERT INTO \"SystemSetting\" SELECT * FROM ztest_moc_saoluu; DROP TABLE IF EXISTS ztest_moc_saoluu;" >/dev/null
  docker exec kpi-postgres psql -U kpi_dev -d kpi_db -c 'DROP DATABASE IF EXISTS kpi_kiemchung_saoluu' >/dev/null 2>&1
  bo_moc_du_lieu
  rm -rf "$TMP"
}
trap don_dep EXIT

dang_nhap() {
  local email=$1 kq
  for mk in "$MAT_KHAU" "$MAT_KHAU_PHU"; do
    [ -z "$mk" ] && continue
    kq=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$email\",\"password\":\"$mk\"}")
    echo "$kq" | grep -q accessToken && { echo "$kq"; return; }
  done
  echo "$kq"
}
token_cua() { dang_nhap "$1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null; }
ma() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
jq_() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

echo "Khởi động API cổng $PORT (BACKUP_DIR tạm: $DIR)..."
PORT=$PORT LOGIN_RATE_LIMIT_PER_MINUTE=200 BACKUP_DIR="$DIR" BACKUP_MIRROR_DIR="$MIRROR" BACKUP_MODE=docker \
  node dist/main.js > "$TMP/api.log" 2>&1 &
PID_API=$!
for _ in $(seq 1 40); do curl -sf -o /dev/null "$API/" 2>/dev/null && break; sleep 0.5; done
curl -sf -o /dev/null "$API/" || { echo "Không khởi động được API:"; tail -20 "$TMP/api.log"; exit 1; }
# Lúc khởi động scheduler có thể đã chạy một bản tự động (nếu đã qua giờ cài đặt) — chờ nó xong
sleep 2

chup_moc_du_lieu
sql "DROP TABLE IF EXISTS ztest_moc_saoluu; CREATE TABLE ztest_moc_saoluu AS SELECT * FROM \"SystemSetting\" WHERE key='saoLuu';" >/dev/null

AT_ADMIN=$(token_cua admin@hmico.vn); AT_HR=$(token_cua hcns@hmico.vn); AT_BGD=$(token_cua giamdoc@hmico.vn)
[ -n "$AT_ADMIN" ] || { echo "Không đăng nhập được admin"; exit 1; }

# ================================================= 1 PHÂN QUYỀN
buoc "1  PHÂN QUYỀN — chỉ ADMIN"
for vai in "HR:$AT_HR" "BGĐ:$AT_BGD"; do
  MA=$(ma -H "Authorization: Bearer ${vai#*:}" "$API/backups")
  [ "$MA" = "403" ] && pass "${vai%%:*} GET /backups -> 403" || fail "${vai%%:*} GET /backups -> $MA"
  MA=$(ma -X POST -H "Authorization: Bearer ${vai#*:}" "$API/backups")
  [ "$MA" = "403" ] && pass "${vai%%:*} POST /backups -> 403" || fail "${vai%%:*} POST /backups -> $MA"
done
MA=$(ma "$API/backups"); [ "$MA" = "401" ] && pass "không token -> 401" || fail "không token -> $MA"

# ================================================= 2 SAO LƯU THỦ CÔNG
buoc "2  SAO LƯU THỦ CÔNG — file, .json, kiểm tra, mirror, AuditLog"
TRUOC=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityType\"='Backup' AND action='BACKUP';")
R=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/backups" -w '\n%{http_code}')
MA=$(echo "$R" | tail -1); THAN=$(echo "$R" | sed '$d')
[ "$MA" = "201" ] && pass "POST /backups -> 201" || fail "POST /backups -> $MA: ${THAN:0:200}"
TEN=$(echo "$THAN" | jq_ "d['tenFile']")
echo "$TEN" | grep -qE '^kpi_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}\.dump$' && pass "tên file đúng khuôn: $TEN" || fail "tên file: $TEN"
[ -s "$DIR/$TEN" ] && pass "file .dump có trong BACKUP_DIR ($(stat -c %s "$DIR/$TEN") byte)" || fail "không thấy $DIR/$TEN"
[ -s "$DIR/$TEN.json" ] && pass "có file .json cạnh bên" || fail "thiếu .json"
[ "$(echo "$THAN" | jq_ "d['daKiemTra']")" = "True" ] && pass "daKiemTra = true (pg_restore --list đọc được)" || fail "daKiemTra sai"
[ "$(echo "$THAN" | jq_ "d['nguoiBamTen']")" = "Quản trị hệ thống" ] && pass "ghi người bấm" || fail "nguoiBamTen: $(echo "$THAN" | jq_ "d['nguoiBamTen']")"
MIG=$(echo "$THAN" | jq_ "d['migrationMoiNhat']"); MIG_DB=$(sql "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1;")
[ "$MIG" = "$MIG_DB" ] && pass "ghi migration mới nhất: $MIG" || fail "migration $MIG != $MIG_DB"
cmp -s "$DIR/$TEN" "$MIRROR/$TEN" && pass "bản thứ hai ở BACKUP_MIRROR_DIR giống hệt" || fail "mirror thiếu hoặc khác"
docker exec -i kpi-postgres pg_restore --list < "$DIR/$TEN" | grep -qE 'TABLE DATA public "?Scorecard"? ' && pass "file thật sự chứa bảng Scorecard" || fail "pg_restore --list không thấy Scorecard"
SAU=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityType\"='Backup' AND action='BACKUP';")
[ "$SAU" = "$((TRUOC + 1))" ] && pass "AuditLog Backup/BACKUP +1" || fail "AuditLog $TRUOC -> $SAU"

# ================================================= 3 DANH SÁCH & TRẠNG THÁI
buoc "3  GET /backups — trạng thái và danh sách đọc từ THƯ MỤC"
R=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/backups")
echo "$R" | jq_ "d['danhSach'][0]['tenFile']" | grep -q "$TEN" && pass "bản vừa tạo đứng đầu danh sách" || fail "danh sách: $(echo "$R" | head -c 200)"
[ "$(echo "$R" | jq_ "d['trangThai']['quaHan']")" = "False" ] && pass "quaHan = false ngay sau khi sao lưu" || fail "quaHan sai"
[ "$(echo "$R" | jq_ "d['trangThai']['thuMuc']")" = "$DIR" ] && pass "trangThai.thuMuc = BACKUP_DIR" || fail "thuMuc sai"
[ "$(echo "$R" | jq_ "d['trangThai']['dungLuongTrong'] is not None and d['trangThai']['dungLuongTrong']>0")" = "True" ] && pass "đo được dung lượng trống" || fail "dungLuongTrong"
# File chép tay (không .json) vẫn liệt kê, không làm hỏng danh sách
cp "$DIR/$TEN" "$DIR/kpi_2020-01-01_000000.dump"
R=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/backups")
[ "$(echo "$R" | jq_ "len(d['danhSach'])")" -ge 2 ] && pass "file chép tay không có .json vẫn liệt kê" || fail "danh sách không thấy file chép tay"

# ================================================= 4 TẢI VỀ
buoc "4  TẢI VỀ — đúng file, chặn ../, ghi nhật ký"
curl -s -o "$TMP/tai.dump" -D "$TMP/h.txt" -H "Authorization: Bearer $AT_ADMIN" "$API/backups/$TEN/download"
grep -qi "filename=\"$TEN\"" "$TMP/h.txt" && pass "Content-Disposition đúng tên" || fail "header: $(grep -i disposition "$TMP/h.txt")"
cmp -s "$TMP/tai.dump" "$DIR/$TEN" && pass "file tải về giống hệt file trên đĩa" || fail "file tải về khác"
MA=$(ma -H "Authorization: Bearer $AT_ADMIN" "$API/backups/..%2F..%2F.env/download"); [ "$MA" = "404" ] && pass "../ -> 404" || fail "../ -> $MA"
MA=$(ma -H "Authorization: Bearer $AT_ADMIN" "$API/backups/khong-co.dump/download"); [ "$MA" = "404" ] && pass "file không tồn tại -> 404" || fail "-> $MA"
MA=$(ma -H "Authorization: Bearer $AT_HR" "$API/backups/$TEN/download"); [ "$MA" = "403" ] && pass "HR tải -> 403" || fail "HR tải -> $MA"
N=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityType\"='Backup' AND action='DOWNLOAD' AND \"entityId\"='$TEN';")
[ "$N" = "1" ] && pass "AuditLog Backup/DOWNLOAD ghi tên file" || fail "DOWNLOAD log: $N"

# ================================================= 5 DỌN BẢN CŨ
buoc "5  DỌN BẢN CŨ ba bậc — giữ 3 ngày, 1 tháng, cuối năm vĩnh viễn"
curl -s -o /dev/null -X PUT -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"saoLuu":{"tuDongHangDem":false,"gioChay":2,"giuBanNgay":3,"giuBanThang":1}}' "$API/settings"
# Dựng bộ file giả có tên đúng khuôn (nội dung là bản dump thật để không sợ hỏng)
for d in 2024-12-31 2025-06-15 2025-12-31 2026-07-10 2026-07-31 2026-08-31 2026-09-01; do cp "$DIR/$TEN" "$DIR/kpi_${d}_020000.dump"; done
rm -f "$DIR/kpi_2020-01-01_000000.dump"
curl -s -o /dev/null -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/backups"
CON=$(ls "$DIR" | grep '\.dump$' | sort | tr '\n' ' ')
for giu in kpi_2024-12-31 kpi_2025-12-31 kpi_2026-08-31; do echo "$CON" | grep -q "$giu" && pass "giữ $giu (cuối năm / cuối tháng)" || fail "mất $giu — còn: $CON"; done
for xoa in kpi_2025-06-15 kpi_2026-07-10 kpi_2026-07-31; do echo "$CON" | grep -q "$xoa" && fail "đáng lẽ xoá $xoa — còn: $CON" || pass "đã xoá $xoa"; done
ls "$MIRROR" | grep -q "kpi_2025-06-15" && fail "mirror chưa dọn" || pass "mirror cũng được dọn theo"

# ================================================= 6 CÀI ĐẶT
buoc "6  CÀI ĐẶT saoLuu — kiểm khoảng, lanKeTiep theo giờ"
MA=$(ma -X PUT -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' -d '{"saoLuu":{"tuDongHangDem":true,"gioChay":25,"giuBanNgay":14,"giuBanThang":12}}' "$API/settings")
[ "$MA" = "400" ] && pass "gioChay=25 -> 400" || fail "gioChay=25 -> $MA"
curl -s -o /dev/null -X PUT -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' -d '{"saoLuu":{"tuDongHangDem":true,"gioChay":23,"giuBanNgay":14,"giuBanThang":12}}' "$API/settings"
KE=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/backups" | jq_ "d['trangThai']['lanKeTiep']")
# 23:00 VN = 16:00Z
echo "$KE" | grep -q "T16:00:00" && pass "lanKeTiep = 23:00 giờ VN ($KE)" || fail "lanKeTiep: $KE"
curl -s -o /dev/null -X PUT -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' -d '{"saoLuu":{"tuDongHangDem":false,"gioChay":2,"giuBanNgay":14,"giuBanThang":12}}' "$API/settings"
KE=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/backups" | jq_ "d['trangThai']['lanKeTiep']")
[ "$KE" = "None" ] && pass "tắt tự động -> lanKeTiep null" || fail "lanKeTiep khi tắt: $KE"

# ================================================= 7 KHÔI PHỤC THẬT
buoc "7  KHÔI PHỤC THẬT vào database riêng bằng scripts/khoi-phuc.sh"
OUT=$(./scripts/khoi-phuc.sh "$DIR/$TEN" --vao kpi_kiemchung_saoluu 2>&1); MA=$?
[ "$MA" != "0" ] && echo "$OUT" | grep -q "chưa có biến đồng ý" && pass "không có biến đồng ý -> dừng" || fail "thiếu biến mà vẫn chạy: $OUT"
OUT=$(CHO_PHEP_KHOI_PHUC=toi-hieu-viec-nay-ghi-de-du-lieu ./scripts/khoi-phuc.sh "$DIR/$TEN" --vao kpi_kiemchung_saoluu 2>&1); MA=$?
[ "$MA" = "0" ] && pass "khôi phục vào kpi_kiemchung_saoluu thành công" || fail "khôi phục lỗi: $(echo "$OUT" | tail -3)"
SO_GOC=$(sql "SELECT count(*) FROM \"Scorecard\";")
SO_KP=$(docker exec kpi-postgres psql -U kpi_dev -d kpi_kiemchung_saoluu -t -A -c 'SELECT count(*) FROM "Scorecard";' 2>/dev/null)
[ "$SO_GOC" = "$SO_KP" ] && pass "số phiếu khớp bản gốc: $SO_KP" || fail "phiếu: gốc $SO_GOC, khôi phục $SO_KP"
SO_KP_U=$(docker exec kpi-postgres psql -U kpi_dev -d kpi_kiemchung_saoluu -t -A -c 'SELECT count(*) FROM "User" WHERE "passwordHash" LIKE '"'"'$argon2%'"'"';' 2>/dev/null)
[ "$SO_KP_U" = "$(sql "SELECT count(*) FROM \"User\";")" ] && pass "tài khoản khôi phục đủ, hash argon2 nguyên vẹn" || fail "user: $SO_KP_U"
[ "$(sql "SELECT count(*) FROM \"Scorecard\";")" = "$SO_GOC" ] && pass "database đang chạy KHÔNG bị đụng" || fail "database gốc thay đổi!"

# ================================================= TỔNG KẾT
buoc "TỔNG KẾT"
echo "  PASS: $SO_PASS    FAIL: $SO_FAIL"
[ "$SO_FAIL" -eq 0 ] || exit 1
