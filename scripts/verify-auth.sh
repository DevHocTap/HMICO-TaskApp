#!/usr/bin/env bash
#
# Kiểm chứng xác thực và phân quyền bằng curl trên hệ thống đang chạy thật.
#
# Chạy:  ./scripts/verify-auth.sh
# Yêu cầu: PostgreSQL đang chạy, đã `npm run build` và `npx prisma db seed`.
#
# Script tự khởi động và tự tắt hai tiến trình API:
#   - cổng 3101: cấu hình bình thường (access token 15 phút)
#   - cổng 3102: access token 5 GIÂY, chỉ để thử bước 4 (token hết hạn)
# Cách này không đụng vào .env, nên không có nguy cơ để lại cấu hình sai.

set -uo pipefail
cd "$(dirname "$0")/.."

PORT_NORMAL=3101
PORT_SHORT=3102
PORT_RATE=3103
API="http://localhost:$PORT_NORMAL"
API_SHORT="http://localhost:$PORT_SHORT"
# Tiến trình riêng để thử hạn mức đăng nhập: RateLimitGuard đếm trong bộ nhớ
# của từng tiến trình, nên cổng này có hạn mức sạch, không bị các bước
# trước tiêu mất.
API_RATE="http://localhost:$PORT_RATE"

MAT_KHAU="${SEED_PASSWORD:-Hmico@2026}"
TAI_KHOAN_ADMIN="admin@hmico.vn"
TAI_KHOAN_RND="truongphong.rnd@hmico.vn"

TMP=$(mktemp -d)
SO_PASS=0
SO_FAIL=0

do_dep() { printf '%*s' "$1" '' | tr ' ' '='; }

pass() { SO_PASS=$((SO_PASS+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { SO_FAIL=$((SO_FAIL+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; }

buoc() { printf '\n\033[1m%s\033[0m\n' "$1"; }

don_dep() {
  [ -n "${PID_NORMAL:-}" ] && kill "$PID_NORMAL" 2>/dev/null
  [ -n "${PID_SHORT:-}" ] && kill "$PID_SHORT" 2>/dev/null
  [ -n "${PID_RATE:-}" ] && kill "$PID_RATE" 2>/dev/null
  wait 2>/dev/null
  rm -rf "$TMP"
}
trap don_dep EXIT

doi_san_sang() {
  local url=$1 ten=$2
  for _ in $(seq 1 40); do
    if curl -sf -o /dev/null "$url/" 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  echo "Không khởi động được API ($ten). Xem $TMP/$ten.log"
  cat "$TMP/$ten.log" | tail -20
  exit 1
}

echo "Khởi động API..."
PORT=$PORT_NORMAL node dist/main.js > "$TMP/normal.log" 2>&1 &
PID_NORMAL=$!
PORT=$PORT_SHORT JWT_ACCESS_TTL=5s node dist/main.js > "$TMP/short.log" 2>&1 &
PID_SHORT=$!
PORT=$PORT_RATE node dist/main.js > "$TMP/rate.log" 2>&1 &
PID_RATE=$!
doi_san_sang "$API" normal
doi_san_sang "$API_SHORT" short
doi_san_sang "$API_RATE" rate
echo "Sẵn sàng (cổng $PORT_NORMAL bình thường, $PORT_SHORT token 5 giây, $PORT_RATE thử hạn mức)"

# ---------------------------------------------------------------- bước 1
buoc "BƯỚC 1 — Đăng nhập bằng tài khoản seed"
curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TAI_KHOAN_ADMIN\",\"password\":\"$MAT_KHAU\"}" > "$TMP/login.json"

AT=$(python3 -c "import json;print(json.load(open('$TMP/login.json')).get('accessToken',''))" 2>/dev/null)
RT=$(python3 -c "import json;print(json.load(open('$TMP/login.json')).get('refreshToken',''))" 2>/dev/null)

if [ -n "$AT" ] && [ -n "$RT" ]; then
  pass "nhận được access token và refresh token"
else
  fail "không nhận được token — $(cat "$TMP/login.json")"
fi

# ---------------------------------------------------------------- bước 2
buoc "BƯỚC 2 — Gọi endpoint có bảo vệ bằng access token hợp lệ"
MA=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT" "$API/departments/tree")
[ "$MA" = "200" ] && pass "GET /departments/tree -> 200" || fail "GET /departments/tree -> $MA (mong đợi 200)"

# ---------------------------------------------------------------- bước 3
buoc "BƯỚC 3 — Access token hỏng"
MA=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer token.bia.dat" "$API/departments/tree")
[ "$MA" = "401" ] && pass "token bịa -> 401" || fail "token bịa -> $MA (mong đợi 401)"

MA=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT-sua-doi" "$API/departments/tree")
[ "$MA" = "401" ] && pass "token bị sửa chữ ký -> 401" || fail "token bị sửa -> $MA (mong đợi 401)"

MA=$(curl -s -o /dev/null -w '%{http_code}' "$API/departments/tree")
[ "$MA" = "401" ] && pass "không gửi token -> 401" || fail "không gửi token -> $MA (mong đợi 401)"

# ---------------------------------------------------------------- bước 4
buoc "BƯỚC 4 — Access token hết hạn (cổng $PORT_SHORT, hạn 5 giây)"
curl -s -X POST "$API_SHORT/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TAI_KHOAN_ADMIN\",\"password\":\"$MAT_KHAU\"}" > "$TMP/short.json"
AT_NGAN=$(python3 -c "import json;print(json.load(open('$TMP/short.json')).get('accessToken',''))" 2>/dev/null)

MA=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT_NGAN" "$API_SHORT/departments/tree")
[ "$MA" = "200" ] && pass "ngay sau khi cấp -> 200" || fail "ngay sau khi cấp -> $MA (mong đợi 200)"

echo "  ... chờ 7 giây cho token hết hạn"
sleep 7

MA=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT_NGAN" "$API_SHORT/departments/tree")
[ "$MA" = "401" ] && pass "sau khi hết hạn -> 401" || fail "sau khi hết hạn -> $MA (mong đợi 401)"

# ---------------------------------------------------------------- bước 5
buoc "BƯỚC 5 — Dùng refresh token để lấy cặp token mới"
curl -s -X POST "$API/auth/refresh" -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$RT\"}" > "$TMP/refresh.json"
AT2=$(python3 -c "import json;print(json.load(open('$TMP/refresh.json')).get('accessToken',''))" 2>/dev/null)
RT2=$(python3 -c "import json;print(json.load(open('$TMP/refresh.json')).get('refreshToken',''))" 2>/dev/null)

if [ -n "$AT2" ] && [ -n "$RT2" ]; then
  pass "nhận được cặp token mới"
else
  fail "không nhận được cặp mới — $(cat "$TMP/refresh.json")"
fi
[ "$RT2" != "$RT" ] && pass "refresh token mới KHÁC token cũ" || fail "refresh token không đổi — chưa xoay vòng"

MA=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT2" "$API/departments/tree")
[ "$MA" = "200" ] && pass "access token mới dùng được" || fail "access token mới -> $MA (mong đợi 200)"

# ---------------------------------------------------------------- bước 6
buoc "BƯỚC 6 — Dùng LẠI refresh token cũ đã bị xoay vòng  [QUAN TRỌNG]"
MA=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/refresh" \
  -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT\"}")
[ "$MA" = "401" ] && pass "token cũ bị từ chối -> 401" || fail "token cũ -> $MA (mong đợi 401) — LỖ HỔNG: token cũ vẫn dùng được"

MA=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/refresh" \
  -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT2\"}")
[ "$MA" = "200" ] && pass "token mới vẫn còn hiệu lực" || fail "token mới -> $MA (mong đợi 200)"

# ---------------------------------------------------------------- bước 7
buoc "BƯỚC 7 — MANAGER phòng R&D xem dữ liệu phòng khác  [QUAN TRỌNG]"
curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TAI_KHOAN_RND\",\"password\":\"$MAT_KHAU\"}" > "$TMP/rnd.json"
AT_RND=$(python3 -c "import json;print(json.load(open('$TMP/rnd.json')).get('accessToken',''))" 2>/dev/null)

if [ -z "$AT_RND" ]; then
  fail "không đăng nhập được tài khoản MANAGER R&D — $(cat "$TMP/rnd.json")"
else
  pass "đăng nhập MANAGER phòng R&D"

  lay_id_phong() {
    docker exec kpi-postgres psql -U kpi_dev -d kpi_db -t -A \
      -c "SELECT id FROM \"Department\" WHERE code='$1';" 2>/dev/null | tr -d '[:space:]'
  }
  ID_RND=$(lay_id_phong RND)
  ID_KT=$(lay_id_phong KT)
  ID_KTSD=$(lay_id_phong KT-SD)
  ID_HN=$(lay_id_phong HN)

  MA=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT_RND" "$API/departments/$ID_RND")
  [ "$MA" = "200" ] && pass "xem phòng MÌNH (RND) -> 200" || fail "xem phòng mình -> $MA (mong đợi 200)"

  MA=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT_RND" "$API/departments/$ID_KT")
  [ "$MA" = "403" ] && pass "xem phòng KHÁC (Kỹ thuật) -> 403" || fail "xem phòng Kỹ thuật -> $MA (mong đợi 403) — LỖ HỔNG PHÂN QUYỀN"

  MA=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT_RND" "$API/departments/$ID_KTSD")
  [ "$MA" = "403" ] && pass "xem tổ con phòng khác (Shop Drawing) -> 403" || fail "xem Shop Drawing -> $MA (mong đợi 403) — LỖ HỔNG PHÂN QUYỀN"

  MA=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT_RND" "$API/departments/$ID_HN")
  [ "$MA" = "403" ] && pass "xem phòng CHA (Hà Nội) -> 403" || fail "xem phòng cha -> $MA (mong đợi 403) — LỖ HỔNG PHÂN QUYỀN"

  MA=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $AT" "$API/departments/$ID_KT")
  [ "$MA" = "200" ] && pass "đối chứng: ADMIN xem được mọi phòng -> 200" || fail "ADMIN xem phòng KT -> $MA (mong đợi 200)"
fi

# ------------------------------------------------------- phần thêm: logout
buoc "BỔ SUNG — /auth/logout luôn trả 204, không lộ trạng thái token"
for mo_ta in "token không tồn tại:{\"refreshToken\":\"khong-he-ton-tai\"}" \
             "thiếu token:{}" \
             "sai định dạng:{\"refreshToken\":12345}" \
             "token rỗng:{\"refreshToken\":\"\"}"; do
  TEN="${mo_ta%%:*}"; BODY="${mo_ta#*:}"
  MA=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/logout" \
    -H 'Content-Type: application/json' -d "$BODY")
  [ "$MA" = "204" ] && pass "$TEN -> 204" || fail "$TEN -> $MA (mong đợi 204)"
done

MA=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/logout" \
  -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT2\"}")
[ "$MA" = "204" ] && pass "token THẬT -> 204 (giống hệt trường hợp giả)" || fail "token thật -> $MA (mong đợi 204)"

MA=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/refresh" \
  -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$RT2\"}")
[ "$MA" = "401" ] && pass "sau logout, token đó hết hiệu lực thật" || fail "sau logout -> $MA (mong đợi 401)"

buoc "BỔ SUNG — /auth/logout-all bắt buộc access token"
MA=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/logout-all")
[ "$MA" = "401" ] && pass "không có token -> 401" || fail "không token -> $MA (mong đợi 401)"

curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TAI_KHOAN_ADMIN\",\"password\":\"$MAT_KHAU\"}" > "$TMP/l2.json"
AT3=$(python3 -c "import json;print(json.load(open('$TMP/l2.json')).get('accessToken',''))")
RT3=$(python3 -c "import json;print(json.load(open('$TMP/l2.json')).get('refreshToken',''))")
curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$TAI_KHOAN_ADMIN\",\"password\":\"$MAT_KHAU\"}" > "$TMP/l3.json"
RT4=$(python3 -c "import json;print(json.load(open('$TMP/l3.json')).get('refreshToken',''))")

MA=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/logout-all" -H "Authorization: Bearer $AT3")
[ "$MA" = "204" ] && pass "có token -> 204" || fail "có token -> $MA (mong đợi 204)"

DEM_HET=0
for t in "$RT3" "$RT4"; do
  MA=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/refresh" \
    -H 'Content-Type: application/json' -d "{\"refreshToken\":\"$t\"}")
  [ "$MA" = "401" ] && DEM_HET=$((DEM_HET+1))
done
[ "$DEM_HET" = "2" ] && pass "cả 2 phiên đều bị thu hồi" || fail "chỉ $DEM_HET/2 phiên bị thu hồi"

buoc "BỔ SUNG — Cây phòng ban lọc theo phạm vi"
CAY_RND=$(curl -s -H "Authorization: Bearer $AT_RND" "$API/departments/tree")
echo "$CAY_RND" | grep -q '"code":"RND"' \
  && pass "MANAGER R&D thấy phòng mình trong cây" \
  || fail "MANAGER R&D không thấy phòng mình — $CAY_RND"
echo "$CAY_RND" | grep -q '"code":"KT"' \
  && fail "MANAGER R&D THẤY phòng Kỹ thuật — RÒ DỮ LIỆU" \
  || pass "MANAGER R&D không thấy phòng Kỹ thuật"
echo "$CAY_RND" | grep -q '"code":"HMICO"' \
  && fail "MANAGER R&D THẤY phòng cha HMICO — RÒ DỮ LIỆU" \
  || pass "MANAGER R&D không thấy phòng cha"

# Dùng cổng $PORT_SHORT: mỗi tiến trình có hạn mức riêng nên lần đăng nhập
# này không tiêu vào hạn mức của cổng chính.
curl -s -X POST "$API_SHORT/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"sd.nhanvien1@hmico.vn\",\"password\":\"$MAT_KHAU\"}" > "$TMP/staff.json"
AT_STAFF=$(python3 -c "import json;print(json.load(open('$TMP/staff.json')).get('accessToken',''))" 2>/dev/null)
CAY_STAFF=$(curl -s -H "Authorization: Bearer $AT_STAFF" "$API_SHORT/departments/tree")
[ "$CAY_STAFF" = "[]" ] && pass "STAFF nhận cây RỖNG" || fail "STAFF nhận: $CAY_STAFF (mong đợi [])"

CAY_ADMIN=$(curl -s -H "Authorization: Bearer $AT" "$API/departments/tree")
if echo "$CAY_ADMIN" | grep -q '"code":"HMICO"' && echo "$CAY_ADMIN" | grep -q '"code":"KT-SD"'; then
  pass "đối chứng: ADMIN thấy toàn bộ cây"
else
  fail "ADMIN không thấy đủ cây"
fi

buoc "BỔ SUNG — Giới hạn tần suất /auth/login (5 lần/phút/IP, cổng $PORT_RATE)"
DEM_TRUOC=0
for i in $(seq 1 5); do
  MA=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_RATE/auth/login" \
    -H 'Content-Type: application/json' -d '{"email":"ai-do@hmico.vn","password":"x"}')
  [ "$MA" = "401" ] && DEM_TRUOC=$((DEM_TRUOC+1))
done
[ "$DEM_TRUOC" = "5" ] && pass "5 lần đầu vẫn qua (401 sai mật khẩu, chưa bị chặn)" \
  || fail "chỉ $DEM_TRUOC/5 lần đầu qua được — hạn mức chặn quá sớm"

MA=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_RATE/auth/login" \
  -H 'Content-Type: application/json' -d '{"email":"ai-do@hmico.vn","password":"x"}')
[ "$MA" = "429" ] && pass "lần thứ 6 bị chặn -> 429" || fail "lần thứ 6 -> $MA (mong đợi 429)"

printf '  \033[33mGHI CHÚ\033[0m  Khoá tạm theo email (10 lần sai / 15 phút) KHÔNG kiểm được
'
printf '           bằng curl từ một máy: hạn mức 5 lần/phút theo IP chặn trước khi
'
printf '           đủ 11 lần. Đó chính là hành vi đúng — khoá theo email dành cho
'
printf '           tấn công phân tán từ nhiều IP. Phần này phủ bằng 8 test unit
'
printf '           trong src/modules/auth/login-attempt.service.spec.ts
'

buoc "BỔ SUNG — Giới hạn tần suất /auth/logout (10 lần/phút/IP)"
DEM_429=0
for i in $(seq 1 14); do
  MA=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/logout" \
    -H 'Content-Type: application/json' -d '{}')
  [ "$MA" = "429" ] && DEM_429=$((DEM_429+1))
done
[ "$DEM_429" -ge 1 ] && pass "vượt hạn mức bị chặn 429 ($DEM_429/14 lần cuối)" || fail "gọi 14 lần không bị chặn — giới hạn tần suất không hoạt động"

# ---------------------------------------------------------------- tổng kết
echo
do_dep 60; echo
if [ "$SO_FAIL" -eq 0 ]; then
  printf '\033[32mTẤT CẢ %d KIỂM TRA ĐỀU PASS\033[0m\n' "$SO_PASS"
else
  printf '\033[31m%d PASS, %d FAIL\033[0m\n' "$SO_PASS" "$SO_FAIL"
fi
do_dep 60; echo
exit "$([ "$SO_FAIL" -eq 0 ] && echo 0 || echo 1)"
