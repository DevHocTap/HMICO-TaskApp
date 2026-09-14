#!/usr/bin/env bash
#
# Kiểm chứng module org bằng curl trên hệ thống chạy thật.
#
# Chạy:  ./scripts/verify-org.sh
# Yêu cầu: PostgreSQL đang chạy, đã `npm run build` và `npx prisma db seed`.
#
# Tự khởi động API ở cổng 3121 và tự tắt khi xong. Không đụng cổng 3000.

set -uo pipefail
cd "$(dirname "$0")/.."

# Chốt chặn: script này xoá dữ liệu, chỉ được chạy trên database cục bộ.
. "$(dirname "$0")/_chi-chay-cuc-bo.sh"

PORT=3121
API="http://localhost:$PORT"
MAT_KHAU="${SEED_PASSWORD:-Hmico@2026}"
# Mật khẩu dự phòng: tài khoản đã đổi mật khẩu qua trình duyệt thì thử tiếp
# giá trị này. Đọc từ .env.local (đã gitignore) — KHÔNG viết mật khẩu vào
# file commit. Không đặt thì chỉ thử mật khẩu seed như trước.
MAT_KHAU_PHU="${SEED_PASSWORD_ALT:-}"
if [ -z "$MAT_KHAU_PHU" ] && [ -f .env.local ]; then
  MAT_KHAU_PHU=$(grep -m1 '^SEED_PASSWORD_ALT=' .env.local | cut -d= -f2- | tr -d '"'"'"'')
fi

TMP=$(mktemp -d)
SO_PASS=0
SO_FAIL=0

pass() { SO_PASS=$((SO_PASS+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { SO_FAIL=$((SO_FAIL+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; }
buoc() { printf '\n\033[1m%s\033[0m\n' "$1"; }

don_dep() {
  [ -n "${PID_API:-}" ] && kill "$PID_API" 2>/dev/null
  wait 2>/dev/null
  rm -rf "$TMP"
}
trap don_dep EXIT

sql() { docker exec kpi-postgres psql -U kpi_dev -d kpi_db -t -A -c "$1" 2>/dev/null; }

# Thử mật khẩu seed trước, không được thì thử mật khẩu dự phòng.
# Người dùng nghịch trên trình duyệt là đổi mật khẩu, và trước đây script
# chết ngay ở bước đầu vì lý do chẳng liên quan gì tới thứ đang kiểm.
# Nhớ mật khẩu đúng của từng email vào file, KHÔNG dùng biến: hàm này hay
# được gọi trong $(...) nên biến đặt bên trong mất ngay khi subshell kết thúc.
# Không nhớ thì mỗi lần đăng nhập lại tốn hai lượt và ăn hết hạn mức theo IP.
dang_nhap_thu() {
  local email=$1 goc=${2:-$API} kq mk
  mk=$(grep -m1 -F "$email	" "$TMP/mat-khau.cache" 2>/dev/null | cut -f2-)
  if [ -n "$mk" ]; then
    curl -s -X POST "$goc/auth/login" -H 'Content-Type: application/json' \
      -d "{\"email\":\"$email\",\"password\":\"$mk\"}"
    return
  fi

  kq=$(curl -s -X POST "$goc/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$MAT_KHAU\"}")
  if echo "$kq" | grep -q accessToken; then
    printf '%s\t%s\n' "$email" "$MAT_KHAU" >> "$TMP/mat-khau.cache"
    echo "$kq"; return
  fi
  if [ -z "$MAT_KHAU_PHU" ]; then echo "$kq"; return; fi

  # Mật khẩu seed sai -> tài khoản này đã đổi mật khẩu qua trình duyệt
  kq=$(curl -s -X POST "$goc/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$MAT_KHAU_PHU\"}")
  echo "$kq" | grep -q accessToken \
    && printf '%s\t%s\n' "$email" "$MAT_KHAU_PHU" >> "$TMP/mat-khau.cache"
  echo "$kq"
}
dang_nhap() { dang_nhap_thu "$1"; }
token_cua() {
  dang_nhap "$1" | python3 -c "import json,sys;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null
}
ma() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "Khởi động API cổng $PORT..."
PORT=$PORT LOGIN_RATE_LIMIT_PER_MINUTE=200 node dist/main.js > "$TMP/api.log" 2>&1 &
PID_API=$!
for _ in $(seq 1 40); do curl -sf -o /dev/null "$API/" 2>/dev/null && break; sleep 0.5; done
if ! curl -sf -o /dev/null "$API/"; then
  echo "Không khởi động được API:"; tail -20 "$TMP/api.log"; exit 1
fi

# --- Token và id cần dùng ---
# Dọn tài khoản thử của lần chạy trước. Script KHÔNG được đụng vào dữ liệu
# seed: verify-auth.sh dùng chung bộ tài khoản đó, đặt lại mật khẩu của
# chúng sẽ làm hỏng script kia.
sql "DELETE FROM \"RefreshToken\" WHERE \"userId\" IN (SELECT id FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%');" > /dev/null
sql "DELETE FROM \"AuditLog\" WHERE \"entityId\" IN (SELECT id FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%');" > /dev/null
sql "DELETE FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%';" > /dev/null

# Kiểm điều kiện tiên quyết TRƯỚC KHI chạy gì khác.
# Đăng nhập bằng trình duyệt rồi đổi mật khẩu sẽ làm mọi bước sau hỏng
# hàng loạt với thông báo vô nghĩa. Thà dừng ngay và nói rõ lý do.
if [ -z "$(token_cua admin@hmico.vn)" ]; then
  echo
  echo "Không đăng nhập được bằng tài khoản seed (admin@hmico.vn)."
  echo
  echo "Thường là do đã đổi mật khẩu qua trình duyệt khi kiểm thử tay."
  echo "Chạy lại seed rồi thử lại:"
  echo
  echo "    npx prisma db seed"
  echo
  echo "Lưu ý: seed xoá sạch dữ liệu và đặt lại mật khẩu tất cả tài khoản"
  echo "về $MAT_KHAU."
  exit 1
fi

AT_ADMIN=$(token_cua admin@hmico.vn)
AT_HR=$(token_cua hcns@hmico.vn)
AT_RND=$(token_cua truongphong.rnd@hmico.vn)
AT_KT=$(token_cua truongphong.kythuat@hmico.vn)
AT_STAFF=$(token_cua sd.nhanvien1@hmico.vn)
AT_HCM=$(token_cua hcm.nhanvien1@hmico.vn)
AT_BGD=$(token_cua giamdoc@hmico.vn)

ID_RND=$(sql "SELECT id FROM \"Department\" WHERE code='RND';")
ID_KT=$(sql "SELECT id FROM \"Department\" WHERE code='KT';")
ID_KTHCM=$(sql "SELECT id FROM \"Department\" WHERE code='KT-HCM';")
ID_HN=$(sql "SELECT id FROM \"Department\" WHERE code='HN';")
ID_MKT=$(sql "SELECT id FROM \"Department\" WHERE code='MKT';")
U_SD1=$(sql "SELECT id FROM \"User\" WHERE email='sd.nhanvien1@hmico.vn';")
U_RND=$(sql "SELECT id FROM \"User\" WHERE email='truongphong.rnd@hmico.vn';")
U_HR=$(sql "SELECT id FROM \"User\" WHERE email='hcns@hmico.vn';")
U_ADMIN=$(sql "SELECT id FROM \"User\" WHERE email='admin@hmico.vn';")

# ===================================================== PHẠM VI DỮ LIỆU
buoc "PHẠM VI — GET /users"
KQ=$(curl -s -H "Authorization: Bearer $AT_RND" "$API/users?limit=100")
echo "$KQ" | grep -q 'truongphong.rnd' \
  && pass "MANAGER R&D thấy người phòng mình" \
  || fail "MANAGER R&D không thấy người phòng mình — $KQ"
echo "$KQ" | grep -q 'sd.nhanvien1' \
  && fail "MANAGER R&D THẤY nhân viên phòng Kỹ thuật — RÒ DỮ LIỆU" \
  || pass "MANAGER R&D không thấy nhân viên phòng Kỹ thuật"

MA=$(ma -H "Authorization: Bearer $AT_RND" "$API/users/$U_SD1")
[ "$MA" = "403" ] && pass "MANAGER R&D xem nhân viên phòng khác -> 403" \
  || fail "xem nhân viên phòng khác -> $MA (mong đợi 403)"

KQ=$(curl -s -H "Authorization: Bearer $AT_STAFF" "$API/users?limit=100")
SO=$(echo "$KQ" | python3 -c "import json,sys;print(json.load(sys.stdin).get('total',-1))" 2>/dev/null)
[ "$SO" = "1" ] && pass "STAFF chỉ thấy chính mình (total=1)" \
  || fail "STAFF thấy $SO người (mong đợi 1)"

KQ=$(curl -s -H "Authorization: Bearer $AT_HCM" "$API/users?limit=100")
echo "$KQ" | grep -qE 'sd.nhanvien1|truongphong.rnd|admin@' \
  && fail "STAFF chi nhánh HCM THẤY dữ liệu Hà Nội — RÒ DỮ LIỆU" \
  || pass "STAFF chi nhánh HCM không thấy dữ liệu Hà Nội"
MA=$(ma -H "Authorization: Bearer $AT_HCM" "$API/departments/$ID_HN")
[ "$MA" = "403" ] && pass "STAFF HCM xem phòng Hà Nội -> 403" \
  || fail "STAFF HCM xem phòng Hà Nội -> $MA (mong đợi 403)"

# ===================================================== PHÂN QUYỀN GHI
buoc "PHÂN QUYỀN GHI"
MA=$(ma -X POST -H "Authorization: Bearer $AT_RND" -H 'Content-Type: application/json' \
  -d "{\"employeeCode\":\"TEST01\",\"email\":\"test01@hmico.vn\",\"fullName\":\"Thử\",\"role\":\"STAFF\"}" \
  "$API/users")
[ "$MA" = "403" ] && pass "MANAGER tạo nhân viên -> 403" || fail "MANAGER tạo nhân viên -> $MA (mong đợi 403)"

MA=$(ma -X POST -H "Authorization: Bearer $AT_HR" -H 'Content-Type: application/json' \
  -d "{\"employeeCode\":\"TESTAD\",\"email\":\"testad@hmico.vn\",\"fullName\":\"Thử Admin\",\"role\":\"ADMIN\"}" \
  "$API/users")
[ "$MA" = "403" ] && pass "HR tạo tài khoản ADMIN -> 403" || fail "HR tạo ADMIN -> $MA (mong đợi 403)"

MA=$(ma -X PATCH -H "Authorization: Bearer $AT_HR" -H 'Content-Type: application/json' \
  -d '{"role":"ADMIN"}' "$API/users/$U_HR")
[ "$MA" = "403" ] && pass "HR tự nâng vai trò mình -> 403" || fail "tự nâng vai trò -> $MA (mong đợi 403)"

MA=$(ma -X PATCH -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"role":"STAFF"}' "$API/users/$U_ADMIN")
[ "$MA" = "403" ] && pass "ADMIN tự đổi vai trò mình -> 403" || fail "ADMIN tự đổi vai trò -> $MA (mong đợi 403)"

MA=$(ma -X PATCH -H "Authorization: Bearer $AT_HR" -H 'Content-Type: application/json' \
  -d '{"fullName":"HR sửa admin"}' "$API/users/$U_ADMIN")
[ "$MA" = "403" ] && pass "HR sửa tài khoản ADMIN -> 403" || fail "HR sửa ADMIN -> $MA (mong đợi 403)"

# ============================================== EXECUTIVE: XEM ĐƯỢC, GHI KHÔNG
buoc "EXECUTIVE — xem toàn công ty nhưng KHÔNG ghi được gì"
# Ban giám đốc phải xem được mọi màn hình quản trị. Giao diện từng giấu
# sạch menu của họ trong khi backend vẫn cho đọc — giám đốc đăng nhập vào
# chỉ thấy trang trống.
CAY_BGD=$(curl -s -H "Authorization: Bearer $AT_BGD" "$API/departments/tree")
SO_PHONG=$(echo "$CAY_BGD" | python3 -c "
import json,sys
def d(ns):
    for n in ns:
        yield n
        yield from d(n['children'])
print(len(list(d(json.load(sys.stdin)))))" 2>/dev/null)
SO_PHONG_DB=$(sql "SELECT count(*) FROM \"Department\" WHERE \"isActive\";")
[ "$SO_PHONG" = "$SO_PHONG_DB" ] && pass "EXECUTIVE thấy đủ $SO_PHONG phòng ban, khớp database" \
  || fail "EXECUTIVE thấy $SO_PHONG phòng, database có $SO_PHONG_DB"

for EP in "/job-titles" "/users?limit=100"; do
  MA=$(ma -H "Authorization: Bearer $AT_BGD" "$API$EP")
  [ "$MA" = "200" ] && pass "EXECUTIVE đọc $EP -> 200" || fail "EXECUTIVE đọc $EP -> $MA"
done

MA=$(ma -X POST -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' \
  -d '{"code":"BGD-TEST","name":"Thử"}' "$API/departments")
[ "$MA" = "403" ] && pass "EXECUTIVE tạo phòng ban -> 403" || fail "tạo phòng ban -> $MA (mong đợi 403)"

MA=$(ma -X PATCH -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' \
  -d '{"name":"Đổi tên"}' "$API/departments/$ID_RND")
[ "$MA" = "403" ] && pass "EXECUTIVE sửa phòng ban -> 403" || fail "sửa phòng ban -> $MA (mong đợi 403)"

MA=$(ma -X DELETE -H "Authorization: Bearer $AT_BGD" "$API/departments/$ID_MKT")
[ "$MA" = "403" ] && pass "EXECUTIVE vô hiệu hoá phòng ban -> 403" || fail "vô hiệu hoá phòng -> $MA (mong đợi 403)"

MA=$(ma -X POST -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' \
  -d '{"code":"BGD-JT","name":"Thử"}' "$API/job-titles")
[ "$MA" = "403" ] && pass "EXECUTIVE tạo chức danh -> 403" || fail "tạo chức danh -> $MA (mong đợi 403)"

ID_JT_BGD=$(sql "SELECT id FROM \"JobTitle\" WHERE code='TP';")
MA=$(ma -X PATCH -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' \
  -d '{"name":"Đổi tên"}' "$API/job-titles/$ID_JT_BGD")
[ "$MA" = "403" ] && pass "EXECUTIVE sửa chức danh -> 403" || fail "sửa chức danh -> $MA (mong đợi 403)"

MA=$(ma -X DELETE -H "Authorization: Bearer $AT_BGD" "$API/job-titles/$ID_JT_BGD")
[ "$MA" = "403" ] && pass "EXECUTIVE vô hiệu hoá chức danh -> 403" || fail "vô hiệu hoá chức danh -> $MA (mong đợi 403)"

MA=$(ma -X POST -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' \
  -d '{"employeeCode":"BGDTEST","email":"bgdtest@hmico.vn","fullName":"Thử","role":"STAFF"}' \
  "$API/users")
[ "$MA" = "403" ] && pass "EXECUTIVE tạo nhân viên -> 403" || fail "tạo nhân viên -> $MA (mong đợi 403)"

MA=$(ma -X PATCH -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' \
  -d '{"fullName":"Đổi tên"}' "$API/users/$U_SD1")
[ "$MA" = "403" ] && pass "EXECUTIVE sửa nhân viên -> 403" || fail "sửa nhân viên -> $MA (mong đợi 403)"

MA=$(ma -X PATCH -H "Authorization: Bearer $AT_BGD" "$API/users/$U_SD1/reset-password")
[ "$MA" = "403" ] && pass "EXECUTIVE đặt lại mật khẩu -> 403" || fail "đặt lại mật khẩu -> $MA (mong đợi 403)"

MA=$(ma -X PATCH -H "Authorization: Bearer $AT_BGD" "$API/users/$U_SD1/deactivate")
[ "$MA" = "403" ] && pass "EXECUTIVE vô hiệu hoá nhân viên -> 403" || fail "vô hiệu hoá nhân viên -> $MA (mong đợi 403)"

MA=$(ma -X PATCH -H "Authorization: Bearer $AT_BGD" "$API/users/$U_SD1/activate")
[ "$MA" = "403" ] && pass "EXECUTIVE kích hoạt nhân viên -> 403" || fail "kích hoạt nhân viên -> $MA (mong đợi 403)"

# ===================================================== RÀNG BUỘC CÂY
buoc "RÀNG BUỘC PHÒNG BAN"
# HN là cha của KT: đặt HN vào dưới KT là tạo vòng lặp
MA=$(ma -X PATCH -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"parentId\":\"$ID_KT\"}" "$API/departments/$ID_HN")
[ "$MA" = "400" ] && pass "chuyển phòng vào nhánh con của nó -> 400" \
  || fail "vòng lặp cây -> $MA (mong đợi 400)"

MA=$(ma -X PATCH -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"parentId\":\"$ID_KT\"}" "$API/departments/$ID_KT")
[ "$MA" = "400" ] && pass "đặt chính nó làm phòng cha -> 400" || fail "tự làm cha -> $MA (mong đợi 400)"

MA=$(ma -X DELETE -H "Authorization: Bearer $AT_ADMIN" "$API/departments/$ID_KTHCM")
[ "$MA" = "400" ] && pass "vô hiệu hoá phòng còn nhân viên -> 400" \
  || fail "vô hiệu hoá phòng còn người -> $MA (mong đợi 400)"

MA=$(ma -X DELETE -H "Authorization: Bearer $AT_ADMIN" "$API/departments/$ID_KT")
[ "$MA" = "400" ] && pass "vô hiệu hoá phòng còn phòng con -> 400" \
  || fail "vô hiệu hoá phòng còn con -> $MA (mong đợi 400)"

MA=$(ma -X PATCH -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"managerId\":\"$U_SD1\"}" "$API/departments/$ID_RND")
[ "$MA" = "400" ] && pass "gán trưởng phòng thuộc phòng khác -> 400" \
  || fail "trưởng phòng khác phòng -> $MA (mong đợi 400)"

MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"RND","name":"Trùng mã"}' "$API/departments")
[ "$MA" = "409" ] && pass "mã phòng trùng -> 409" || fail "mã trùng -> $MA (mong đợi 409)"

# ===================================================== KHÔNG LỘ passwordHash
buoc "KHÔNG BAO GIỜ TRẢ passwordHash"
for DUONG in "/users?limit=100" "/users/$U_SD1" "/auth/me" "/departments/tree" "/job-titles"; do
  KQ=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API$DUONG")
  if echo "$KQ" | grep -qiE 'passwordHash|\$argon2'; then
    fail "$DUONG CÓ CHỨA passwordHash"
  else
    pass "$DUONG không chứa passwordHash"
  fi
done

# ===================================================== AUDIT LOG
buoc "AUDIT LOG — AuditService phải thật sự được gọi"

# Mọi thao tác phá huỷ dưới đây chạy trên MỘT TÀI KHOẢN THỬ do chính script
# tạo ra, không đụng vào dữ liệu seed.
#
# Trước đây mỗi mục bắt đầu bằng `DELETE FROM "AuditLog"` để đếm từ 0 —
# xoá sạch nhật ký của cả hệ thống chỉ để một phép đếm ra số đẹp. Bỏ hẳn:
# mọi truy vấn bên dưới đã lọc theo entityId của tài khoản thử, nên không
# cần dọn gì cả.
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"employeeCode\":\"ZTEST01\",\"email\":\"ztest01@hmico.vn\",\"fullName\":\"Tài khoản thử\",\"role\":\"STAFF\",\"departmentId\":\"$ID_KT\"}" \
  "$API/users")
U_TEST=$(echo "$KQ" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
MK_TAM=$(echo "$KQ" | python3 -c "import json,sys;print(json.load(sys.stdin).get('temporaryPassword',''))" 2>/dev/null)
if [ -n "$U_TEST" ] && [ -n "$MK_TAM" ]; then
  pass "ADMIN tạo nhân viên, nhận mật khẩu tạm"
else
  fail "không tạo được tài khoản thử — $KQ"
fi
sleep 0.3
SO=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE action='CREATE' AND \"entityId\"='$U_TEST';")
[ "$SO" = "1" ] && pass "có bản ghi audit CREATE" || fail "có $SO bản ghi CREATE (mong đợi 1)"

# --- đổi vai trò ---
MA=$(ma -X PATCH -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"role":"MANAGER"}' "$API/users/$U_TEST")
[ "$MA" = "200" ] && pass "đổi vai trò nhân viên -> 200" || fail "đổi vai trò -> $MA"
sleep 0.3
SO=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE action='CHANGE_ROLE' AND \"entityId\"='$U_TEST';")
[ "$SO" = "1" ] && pass "có ĐÚNG 1 bản ghi audit CHANGE_ROLE" || fail "có $SO bản ghi (mong đợi 1)"
ACTOR=$(sql "SELECT \"actorId\" FROM \"AuditLog\" WHERE action='CHANGE_ROLE' AND \"entityId\"='$U_TEST';")
[ "$ACTOR" = "$U_ADMIN" ] && pass "actorId đúng là người thực hiện" || fail "actorId=$ACTOR (mong đợi $U_ADMIN)"
BEFORE=$(sql "SELECT before->>'role' FROM \"AuditLog\" WHERE action='CHANGE_ROLE' AND \"entityId\"='$U_TEST';")
AFTER=$(sql "SELECT after->>'role' FROM \"AuditLog\" WHERE action='CHANGE_ROLE' AND \"entityId\"='$U_TEST';")
[ "$BEFORE" = "STAFF" ] && [ "$AFTER" = "MANAGER" ] \
  && pass "before/after đúng: $BEFORE -> $AFTER" \
  || fail "before=$BEFORE after=$AFTER (mong đợi STAFF -> MANAGER)"

# --- đặt lại mật khẩu ---
RT_TRUOC=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"ztest01@hmico.vn\",\"password\":\"$MK_TAM\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('refreshToken',''))" 2>/dev/null)
[ -n "$RT_TRUOC" ] && pass "đăng nhập bằng mật khẩu tạm vừa cấp" || fail "không đăng nhập được bằng mật khẩu tạm"

KQ=$(curl -s -X PATCH -H "Authorization: Bearer $AT_ADMIN" "$API/users/$U_TEST/reset-password")
echo "$KQ" | grep -q temporaryPassword && pass "đặt lại mật khẩu trả về mật khẩu tạm" \
  || fail "không trả mật khẩu tạm — $KQ"
sleep 0.3
SO=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE action='RESET_PASSWORD' AND \"entityId\"='$U_TEST';")
[ "$SO" = "1" ] && pass "có bản ghi audit RESET_PASSWORD" || fail "có $SO bản ghi (mong đợi 1)"
NOI_DUNG=$(sql "SELECT COALESCE(before::text,'') || COALESCE(after::text,'') FROM \"AuditLog\" WHERE action='RESET_PASSWORD' AND \"entityId\"='$U_TEST';")
if echo "$NOI_DUNG" | grep -qiE 'passwordHash|argon2|che'; then
  fail "bản ghi audit có nhắc tới passwordHash: $NOI_DUNG"
else
  pass "bản ghi audit KHÔNG chứa passwordHash dù đã che hay chưa"
fi
MA=$(ma -X POST "$API/auth/refresh" -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$RT_TRUOC\"}")
[ "$MA" = "401" ] && pass "refresh token cũ bị thu hồi sau khi đặt lại mật khẩu" \
  || fail "refresh token cũ -> $MA (mong đợi 401)"

# --- vô hiệu hoá ---
MK2=$(echo "$KQ" | python3 -c "import json,sys;print(json.load(sys.stdin).get('temporaryPassword',''))" 2>/dev/null)
RT2=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"ztest01@hmico.vn\",\"password\":\"$MK2\"}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin).get('refreshToken',''))" 2>/dev/null)
MA=$(ma -X PATCH -H "Authorization: Bearer $AT_ADMIN" "$API/users/$U_TEST/deactivate")
[ "$MA" = "200" ] && pass "vô hiệu hoá tài khoản -> 200" || fail "vô hiệu hoá -> $MA"
sleep 0.3
SO=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE action='DEACTIVATE' AND \"entityId\"='$U_TEST';")
[ "$SO" = "1" ] && pass "có bản ghi audit DEACTIVATE" || fail "có $SO bản ghi (mong đợi 1)"
MA=$(ma -X POST "$API/auth/refresh" -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$RT2\"}")
[ "$MA" = "401" ] && pass "refresh token bị thu hồi sau khi vô hiệu hoá" \
  || fail "refresh token -> $MA (mong đợi 401)"
MA=$(ma -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"ztest01@hmico.vn\",\"password\":\"$MK2\"}")
[ "$MA" = "401" ] && pass "tài khoản bị vô hiệu hoá không đăng nhập được" \
  || fail "đăng nhập -> $MA (mong đợi 401)"

# ===================================================== CHỨC DANH
buoc "CHỨC DANH"
ID_JT=$(sql "SELECT id FROM \"JobTitle\" WHERE code='KT-SD-NV';")
MA=$(ma -X DELETE -H "Authorization: Bearer $AT_ADMIN" "$API/job-titles/$ID_JT")
[ "$MA" = "400" ] && pass "vô hiệu hoá chức danh còn người giữ -> 400" \
  || fail "vô hiệu hoá chức danh -> $MA (mong đợi 400)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_RND" -H 'Content-Type: application/json' \
  -d '{"code":"TEST-JT","name":"Thử"}' "$API/job-titles")
[ "$MA" = "403" ] && pass "MANAGER tạo chức danh -> 403" || fail "MANAGER tạo chức danh -> $MA (mong đợi 403)"

# ============================================ BẪY PHÒNG MẤT TRƯỞNG BỘ PHẬN
buoc "BẪY PHÒNG BAN MẤT TRƯỞNG BỘ PHẬN"
# Phòng không có trưởng bộ phận thì KPI không ai duyệt, và lỗi chỉ lộ ra
# cuối tháng khi nhân viên đã nộp kết quả.
U_TT_SD=$(sql "SELECT id FROM \"User\" WHERE email='truongphong.kythuat@hmico.vn';")
KQ=$(curl -s -X PATCH -H "Authorization: Bearer $AT_ADMIN" "$API/users/$U_TT_SD/deactivate")
echo "$KQ" | grep -q "trưởng bộ phận" \
  && pass "vô hiệu hoá trưởng bộ phận -> bị chặn, nêu tên phòng" \
  || fail "vô hiệu hoá trưởng bộ phận không bị chặn — $KQ"
echo "$KQ" | grep -q "Phòng Kỹ thuật" \
  && pass "thông báo nêu đúng tên phòng đang phụ trách" \
  || fail "thông báo không nêu tên phòng — $KQ"

KQ=$(curl -s -X PATCH -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"departmentId\":\"$ID_RND\"}" "$API/users/$U_TT_SD")
echo "$KQ" | grep -q "chuyển phòng" \
  && pass "chuyển phòng cho trưởng bộ phận -> bị chặn" \
  || fail "chuyển phòng không bị chặn — $KQ"

# Giao diện dựa vào managerId=null để hiện cảnh báo phòng thiếu trưởng
CAY=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/departments/tree")
echo "$CAY" | grep -q '"managerId"' \
  && pass "cây phòng ban trả managerId (giao diện dùng để cảnh báo)" \
  || fail "cây phòng ban thiếu managerId"
echo "$CAY" | grep -q '"userCount"' \
  && pass "cây phòng ban trả userCount" || fail "cây phòng ban thiếu userCount"

# ===================================================== VÒNG LẶP QUẢN LÝ
buoc "VÒNG LẶP QUAN HỆ QUẢN LÝ"
U_KT=$(sql "SELECT id FROM \"User\" WHERE email='truongphong.kythuat@hmico.vn';")
U_TT=$(sql "SELECT id FROM \"User\" WHERE email='sd.nhanvien3@hmico.vn';")
MA=$(ma -X PATCH -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"managerId\":\"$U_TT\"}" "$API/users/$U_KT")
[ "$MA" = "400" ] && pass "đặt cấp dưới làm quản lý của cấp trên -> 400" \
  || fail "vòng lặp quản lý -> $MA (mong đợi 400)"
MA=$(ma -X PATCH -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"managerId\":\"$U_KT\"}" "$API/users/$U_KT")
[ "$MA" = "400" ] && pass "tự làm quản lý của chính mình -> 400" || fail "tự quản lý -> $MA (mong đợi 400)"

# ===================================================== LỌC BOOLEAN QUA QUERY
buoc "LỌC BOOLEAN QUA QUERY STRING"
# `?isActive=false` từng trả về người ĐANG hoạt động vì @Type(() => Boolean)
# gọi Boolean("false") = true. Tạo một người rồi vô hiệu hoá để có dữ liệu.
R=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"employeeCode":"ZTEST-BOOL","email":"ztest.bool@hmico.vn","fullName":"ZTEST Bool","role":"STAFF"}' "$API/users")
U_BOOL=$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
if [ -n "$U_BOOL" ]; then
  curl -s -o /dev/null -X PATCH -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
    "$API/users/$U_BOOL/deactivate"
  DEM=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/users?isActive=false&limit=100" \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print(all(not u['isActive'] for u in d['data']) and d['total']>0)" 2>/dev/null)
  [ "$DEM" = "True" ] && pass "isActive=false chỉ trả người đã vô hiệu hoá" \
    || fail "isActive=false trả về lẫn người đang hoạt động: $DEM"
  DEM=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/users?mustChangePassword=true&limit=100" \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print(all(u['mustChangePassword'] for u in d['data']) and d['total']>0)" 2>/dev/null)
  [ "$DEM" = "True" ] && pass "mustChangePassword=true chỉ trả người chưa đổi mật khẩu" \
    || fail "mustChangePassword=true trả về: $DEM"
  MA=$(ma -H "Authorization: Bearer $AT_ADMIN" "$API/users?isActive=yes")
  [ "$MA" = "400" ] && pass "isActive=yes -> 400" || fail "isActive=yes -> $MA (mong 400)"
else
  fail "không tạo được người dùng ZTEST-BOOL: ${R:0:150}"
fi

# ===================================================== HỒ SƠ NHÂN SỰ
buoc "HỒ SƠ NHÂN SỰ (14/09) — tự sửa / HR sửa / che CCCD / lịch sử phân công"
# Dùng tài khoản ZTEST tạo riêng để không đụng hồ sơ của tài khoản seed.
R=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"employeeCode\":\"ZTEST-HOSO\",\"email\":\"ztest.hoso@hmico.vn\",\"fullName\":\"ZTEST Hồ sơ\",\"role\":\"STAFF\",\"departmentId\":\"$(sql "SELECT id FROM \"Department\" WHERE code='KT';")\"}" "$API/users")
U_HOSO=$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
MK_HOSO=$(echo "$R" | python3 -c "import json,sys;print(json.load(sys.stdin).get('temporaryPassword',''))" 2>/dev/null)
if [ -n "$U_HOSO" ]; then
  AT_HOSO=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"ztest.hoso@hmico.vn\",\"password\":\"$MK_HOSO\"}" | python3 -c "import json,sys;print(json.load(sys.stdin).get('accessToken',''))")
  # Tạo tài khoản → có đúng 1 dòng lịch sử phân công đang hiệu lực
  LS=$(sql "SELECT count(*) FROM \"EmployeeAssignmentHistory\" WHERE \"userId\"='$U_HOSO' AND \"validTo\" IS NULL;")
  [ "$LS" = "1" ] && pass "tạo tài khoản mở 1 dòng lịch sử phân công" || fail "lịch sử phân công sau khi tạo: $LS dòng"

  MA=$(ma -H "Authorization: Bearer $AT_HOSO" "$API/users/me/profile")
  [ "$MA" = "200" ] && pass "STAFF đọc hồ sơ của mình -> 200" || fail "GET me/profile -> $MA"
  MA=$(ma -X PATCH -H "Authorization: Bearer $AT_HOSO" -H 'Content-Type: application/json' \
    -d '{"phone":"0912345678","gender":"FEMALE","dateOfBirth":"1996-02-29"}' "$API/users/me/profile")
  [ "$MA" = "200" ] && pass "STAFF tự sửa điện thoại / giới tính / ngày sinh -> 200" || fail "PATCH me/profile -> $MA"
  MA=$(ma -X PATCH -H "Authorization: Bearer $AT_HOSO" -H 'Content-Type: application/json' \
    -d '{"hireDate":"2020-01-01"}' "$API/users/me/profile")
  [ "$MA" = "400" ] && pass "STAFF gửi hireDate (trường HR) -> 400" || fail "PATCH hireDate -> $MA (mong 400)"
  MA=$(ma -X PATCH -H "Authorization: Bearer $AT_HOSO" -H 'Content-Type: application/json' \
    -d '{"fullName":"Đổi tên"}' "$API/users/me/profile")
  [ "$MA" = "400" ] && pass "STAFF gửi fullName -> 400 (không tự đổi họ tên)" || fail "PATCH fullName -> $MA (mong 400)"
  LOI=$(curl -s -X PATCH -H "Authorization: Bearer $AT_HOSO" -H 'Content-Type: application/json' \
    -d '{"phone":"12"}' "$API/users/me/profile" | python3 -c "import json,sys;print(json.load(sys.stdin).get('message',''))")
  echo "$LOI" | grep -q "điện thoại" && pass "lỗi DTO trả đúng câu: $LOI" || fail "lỗi DTO trả: $LOI"

  MA=$(ma -X PUT -H "Authorization: Bearer $AT_HOSO" -H 'Content-Type: application/json' \
    -d '{"hireDate":"2020-01-01"}' "$API/users/$U_HOSO/profile")
  [ "$MA" = "403" ] && pass "STAFF PUT :id/profile -> 403" || fail "STAFF PUT -> $MA"
  MA=$(ma -X PUT -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' \
    -d '{"hireDate":"2020-01-01"}' "$API/users/$U_HOSO/profile")
  [ "$MA" = "403" ] && pass "MANAGER PUT :id/profile -> 403" || fail "MANAGER PUT -> $MA"
  MA=$(ma -X PUT -H "Authorization: Bearer $AT_HR" -H 'Content-Type: application/json' \
    -d '{"hireDate":"2020-01-01","nationalId":"012345678901"}' "$API/users/$U_HOSO/profile")
  [ "$MA" = "200" ] && pass "HR PUT ngày vào làm + CCCD -> 200" || fail "HR PUT -> $MA"
  MA=$(ma -X PUT -H "Authorization: Bearer $AT_HR" -H 'Content-Type: application/json' \
    -d '{"nationalId":"012345678902"}' "$API/users/$U_ADMIN/profile")
  [ "$MA" = "403" ] && pass "HR sửa hồ sơ ADMIN -> 403" || fail "HR sửa hồ sơ ADMIN -> $MA"

  CC=$(curl -s -H "Authorization: Bearer $AT_HOSO" "$API/users/me/profile" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['nationalId'],d['hireDate'],d['phone'])")
  [ "$CC" = "012345678901 2020-01-01 0912345678" ] && pass "chủ hồ sơ thấy CCCD đầy đủ + ngày vào làm HR nhập" || fail "chủ hồ sơ thấy: $CC"
  CC=$(curl -s -H "Authorization: Bearer $AT_KT" "$API/users/$U_HOSO/profile" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d['nationalId'],d['canEditHrFields'])")
  [ "$CC" = "********8901 False" ] && pass "trưởng phòng xem người trong phòng: CCCD che, không sửa được phần HR" || fail "trưởng phòng thấy: $CC"
  MA=$(ma -H "Authorization: Bearer $AT_STAFF" "$API/users/$U_HOSO/profile")
  [ "$MA" = "403" ] && pass "STAFF khác xem hồ sơ người khác -> 403" || fail "STAFF khác xem -> $MA"

  # Đổi phòng → đóng dòng cũ, mở dòng mới
  P_RND=$(sql "SELECT id FROM \"Department\" WHERE code='RND';")
  curl -s -o /dev/null -X PATCH -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
    -d "{\"departmentId\":\"$P_RND\"}" "$API/users/$U_HOSO"
  LS=$(sql "SELECT count(*) FILTER (WHERE \"validTo\" IS NULL) || '/' || count(*) FROM \"EmployeeAssignmentHistory\" WHERE \"userId\"='$U_HOSO';")
  [ "$LS" = "1/2" ] && pass "đổi phòng: 2 dòng lịch sử, 1 đang hiệu lực" || fail "lịch sử sau đổi phòng: $LS (mong 1/2)"
  SO_AUDIT=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityId\"='$U_HOSO' AND action IN ('UPDATE_MY_PROFILE','UPDATE_PROFILE');")
  [ "$SO_AUDIT" = "2" ] && pass "AuditLog: 1 UPDATE_MY_PROFILE + 1 UPDATE_PROFILE" || fail "AuditLog hồ sơ: $SO_AUDIT (mong 2)"
  CC=$(sql "SELECT after->>'nationalId' FROM \"AuditLog\" WHERE \"entityId\"='$U_HOSO' AND action='UPDATE_PROFILE';")
  [ "$CC" = "********8901" ] && pass "nhật ký che CCCD" || fail "nhật ký ghi CCCD: $CC"
else
  fail "không tạo được người dùng ZTEST-HOSO: ${R:0:150}"
fi

# ===================================================== TỔNG KẾT
echo
printf '%.0s=' {1..60}; echo
if [ "$SO_FAIL" -eq 0 ]; then
  printf '\033[32mTẤT CẢ %d KIỂM TRA ĐỀU PASS\033[0m\n' "$SO_PASS"
else
  printf '\033[31m%d PASS, %d FAIL\033[0m\n' "$SO_PASS" "$SO_FAIL"
fi
printf '%.0s=' {1..60}; echo
exit "$([ "$SO_FAIL" -eq 0 ] && echo 0 || echo 1)"
