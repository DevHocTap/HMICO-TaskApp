#!/usr/bin/env bash
#
# Kiểm chứng module kpi-template bằng curl trên hệ thống chạy thật.
#
# Chạy:  ./scripts/verify-kpi-template.sh
# Yêu cầu: PostgreSQL đang chạy, đã `npm run build` và `npx prisma db seed`.
#
# Tự khởi động API ở cổng 3151 và tự tắt khi xong. Không đụng cổng 3000.
# Mọi thao tác phá huỷ chạy trên mẫu thử do script tự tạo, không đụng bốn
# mẫu thật đã seed từ Excel.

set -uo pipefail
cd "$(dirname "$0")/.."

# Chốt chặn: script này xoá dữ liệu, chỉ được chạy trên database cục bộ.
. "$(dirname "$0")/_chi-chay-cuc-bo.sh"

PORT=3151
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
  # Dọn mẫu thử NGAY KHI KẾT THÚC, không đợi lần chạy sau. Để lại thì
  # chúng hiện trong giao diện và người dùng tưởng là dữ liệu thật.
  don_mau_thu
}

don_mau_thu() {
  docker exec kpi-postgres psql -U kpi_dev -d kpi_db -c "
    DELETE FROM \"ScorecardEvent\" WHERE \"scorecardId\" IN (SELECT id FROM \"Scorecard\" WHERE \"ownerUserId\" IN (SELECT id FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%'));
    DELETE FROM \"ScorecardItem\" WHERE \"scorecardId\" IN (SELECT id FROM \"Scorecard\" WHERE \"ownerUserId\" IN (SELECT id FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%'));
    DELETE FROM \"AuditLog\" WHERE \"entityId\" IN (SELECT id FROM \"Scorecard\" WHERE \"ownerUserId\" IN (SELECT id FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%'));
    DELETE FROM \"Scorecard\" WHERE \"ownerUserId\" IN (SELECT id FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%');
    DELETE FROM \"AuditLog\" WHERE \"entityId\" IN (SELECT id FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%');
    DELETE FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%';
    DELETE FROM \"KpiTemplateItem\" WHERE \"templateId\" IN (SELECT id FROM \"KpiTemplate\" WHERE code LIKE 'ZTEST%');
    DELETE FROM \"AuditLog\" WHERE \"entityId\" IN (SELECT id FROM \"KpiTemplate\" WHERE code LIKE 'ZTEST%');
    DELETE FROM \"KpiTemplate\" WHERE code LIKE 'ZTEST%';
  " >/dev/null 2>&1
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
token_cua() {
  dang_nhap_thu "$1" \
    | python3 -c "import json,sys;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null
}
ma() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
json() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

echo "Khởi động API cổng $PORT..."
PORT=$PORT LOGIN_RATE_LIMIT_PER_MINUTE=200 node dist/main.js > "$TMP/api.log" 2>&1 &
PID_API=$!
for _ in $(seq 1 40); do curl -sf -o /dev/null "$API/" 2>/dev/null && break; sleep 0.5; done
if ! curl -sf -o /dev/null "$API/"; then
  echo "Không khởi động được API:"; tail -20 "$TMP/api.log"; exit 1
fi

# Dọn mẫu thử còn sót — KHÔNG đụng bốn mẫu thật
don_mau_thu

if [ -z "$(token_cua admin@hmico.vn)" ]; then
  echo; echo "Không đăng nhập được bằng tài khoản seed (admin@hmico.vn)."
  echo "Thường là do đã đổi mật khẩu qua trình duyệt. Chạy: npx prisma db seed"; exit 1
fi

AT_ADMIN=$(token_cua admin@hmico.vn)
AT_HR=$(token_cua hcns@hmico.vn)
AT_BGD=$(token_cua giamdoc@hmico.vn)
AT_RND=$(token_cua truongphong.rnd@hmico.vn)
AT_KT=$(token_cua truongphong.kythuat@hmico.vn)
AT_STAFF=$(token_cua sd.nhanvien1@hmico.vn)

ID_SYS=$(sql "SELECT id FROM \"KpiTemplate\" WHERE code='SYS-COMPLIANCE';")
ID_SD=$(sql "SELECT id FROM \"KpiTemplate\" WHERE code='TPL-KT-SD';")
JT_KSTK=$(sql "SELECT id FROM \"JobTitle\" WHERE code='KT-KSTK';")

# --------------------------------------------------------------- PHÂN QUYỀN
buoc "PHÂN QUYỀN"
MA=$(ma -H "Authorization: Bearer $AT_STAFF" "$API/kpi-templates")
[ "$MA" = "403" ] && pass "STAFF gọi GET /kpi-templates -> 403" || fail "STAFF đọc -> $MA (mong đợi 403)"

# Chốt 12/09/2026: TRƯỞNG BỘ PHẬN soạn mẫu cho chức danh phòng mình; HR và
# ban giám đốc chỉ xem. Trước đây ngược lại (HR ghi, MANAGER đọc).
JT_HCNS_CV=$(sql "SELECT id FROM \"JobTitle\" WHERE code='HCNS-CV';")
MA=$(ma -X POST -H "Authorization: Bearer $AT_HR" -H 'Content-Type: application/json' \
  -d "{\"code\":\"ZTEST-HR\",\"name\":\"HR thử tạo\",\"jobTitleId\":\"$JT_KSTK\"}" "$API/kpi-templates")
[ "$MA" = "403" ] && pass "HR tạo mẫu -> 403 (HCNS chỉ xem)" || fail "HR tạo -> $MA (mong đợi 403)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' \
  -d "{\"code\":\"ZTEST-BGD\",\"name\":\"BGĐ thử tạo\",\"jobTitleId\":\"$JT_KSTK\"}" "$API/kpi-templates")
[ "$MA" = "403" ] && pass "ban giám đốc tạo mẫu -> 403 (chỉ xem)" || fail "BGĐ tạo -> $MA (mong đợi 403)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_RND" -H 'Content-Type: application/json' \
  -d "{\"code\":\"ZTEST-RND\",\"name\":\"R&D tạo cho Kỹ thuật\",\"jobTitleId\":\"$JT_KSTK\"}" "$API/kpi-templates")
[ "$MA" = "403" ] && pass "trưởng phòng R&D tạo mẫu cho chức danh phòng Kỹ thuật -> 403" \
  || fail "R&D tạo cho KT -> $MA (mong đợi 403)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-KT-CHUNG","name":"KT tạo mẫu dùng chung"}' "$API/kpi-templates")
[ "$MA" = "403" ] && pass "trưởng phòng tạo mẫu KHÔNG gắn chức danh -> 403 (chỉ ADMIN)" \
  || fail "KT tạo mẫu chung -> $MA (mong đợi 403)"
R=$(curl -s -w '\n%{http_code}' -X POST -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' \
  -d "{\"code\":\"ZTEST-KT-OK\",\"name\":\"KT tạo cho phòng mình\",\"jobTitleId\":\"$JT_KSTK\"}" "$API/kpi-templates")
MA=$(echo "$R" | tail -1); ID_KT_OK=$(echo "$R" | sed '$d' | json "d['id']")
[ "$MA" = "201" ] && pass "trưởng phòng Kỹ thuật tạo mẫu cho chức danh phòng mình -> 201" \
  || fail "KT tạo cho phòng mình -> $MA (mong đợi 201)"
if [ -n "$ID_KT_OK" ]; then
  MA=$(ma -X PATCH -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' \
    -d "{\"jobTitleId\":\"$JT_HCNS_CV\"}" "$API/kpi-templates/$ID_KT_OK")
  [ "$MA" = "403" ] && pass "trưởng phòng đổi mẫu sang chức danh phòng khác -> 403" \
    || fail "đổi chức danh ngoài phòng -> $MA (mong đợi 403)"
  MA=$(ma -X PATCH -H "Authorization: Bearer $AT_RND" -H 'Content-Type: application/json' \
    -d '{"name":"R&D sửa trộm"}' "$API/kpi-templates/$ID_KT_OK")
  [ "$MA" = "403" ] && pass "trưởng phòng khác sửa mẫu của Kỹ thuật -> 403" || fail "R&D sửa mẫu KT -> $MA"
fi

SO_BGD=$(curl -s -H "Authorization: Bearer $AT_BGD" "$API/kpi-templates" | json "len(d)")
SO_DB=$(sql "SELECT count(*) FROM \"KpiTemplate\" WHERE \"isActive\";")
[ "$SO_BGD" = "$SO_DB" ] && pass "EXECUTIVE xem được toàn bộ $SO_DB mẫu đang hoạt động" || fail "EXECUTIVE thấy $SO_BGD mẫu (DB có $SO_DB)"
for M in "POST|$API/kpi-templates|{\"code\":\"ZTESTB\",\"name\":\"Thử\"}" "POST|$API/kpi-templates/$ID_SD/publish|" ; do
  IFS='|' read -r VERB URL BODY <<< "$M"
  if [ -n "$BODY" ]; then
    MA=$(ma -X "$VERB" -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' -d "$BODY" "$URL")
  else
    MA=$(ma -X "$VERB" -H "Authorization: Bearer $AT_BGD" "$URL")
  fi
  [ "$MA" = "403" ] && pass "EXECUTIVE $VERB $(basename "$URL") -> 403" || fail "EXECUTIVE ghi -> $MA (mong đợi 403)"
done
MA=$(ma -X DELETE -H "Authorization: Bearer $AT_BGD" "$API/kpi-templates/$ID_SD")
[ "$MA" = "403" ] && pass "EXECUTIVE DELETE -> 403" || fail "EXECUTIVE xoá -> $MA (mong đợi 403)"

# MANAGER phòng R&D không thấy mẫu của chức danh phòng Kỹ thuật
KQ=$(curl -s -H "Authorization: Bearer $AT_RND" "$API/kpi-templates")
echo "$KQ" | grep -q 'TPL-KT-SD' \
  && fail "MANAGER R&D THẤY mẫu phòng Kỹ thuật trong danh sách — RÒ DỮ LIỆU" \
  || pass "MANAGER R&D không thấy mẫu phòng Kỹ thuật trong danh sách"
MA=$(ma -H "Authorization: Bearer $AT_RND" "$API/kpi-templates/$ID_SD")
[ "$MA" = "403" ] && pass "MANAGER R&D xem mẫu chức danh phòng Kỹ thuật -> 403" \
  || fail "MANAGER R&D xem mẫu phòng khác -> $MA (mong đợi 403)"
# Đối chứng trên mẫu script vừa tạo (ZTEST-KT-OK) chứ không phải TPL-KT-SD:
# máy dev có thể đã ngừng mẫu thật, mà mẫu đã ngừng thì MANAGER thấy 404.
MA=$(ma -H "Authorization: Bearer $AT_KT" "$API/kpi-templates/${ID_KT_OK:-$ID_SD}")
[ "$MA" = "200" ] && pass "đối chứng: MANAGER phòng Kỹ thuật xem được mẫu phòng mình -> 200" \
  || fail "MANAGER Kỹ thuật -> $MA (mong đợi 200)"

# --------------------------------------------------------- MẪU HỆ THỐNG
buoc "MẪU HỆ THỐNG"
MA=$(ma -X PATCH -H "Authorization: Bearer $AT_HR" -H 'Content-Type: application/json' \
  -d '{"name":"Đổi tên"}' "$API/kpi-templates/$ID_SYS")
[ "$MA" = "403" ] && pass "HR sửa mẫu hệ thống qua endpoint thường -> 403" \
  || fail "HR sửa mẫu hệ thống -> $MA (mong đợi 403)"
MA=$(ma -X PUT -H "Authorization: Bearer $AT_HR" -H 'Content-Type: application/json' \
  -d '{"items":[]}' "$API/kpi-templates/$ID_SYS/items")
[ "$MA" = "403" ] && pass "HR lưu item mẫu hệ thống -> 403" || fail "HR lưu item -> $MA (mong đợi 403)"
MA=$(ma -X PUT -H "Authorization: Bearer $AT_HR" -H 'Content-Type: application/json' \
  -d '{"items":[]}' "$API/kpi-templates/$ID_SYS/system-items")
[ "$MA" = "403" ] && pass "HR gọi endpoint riêng của mẫu hệ thống -> 403" \
  || fail "HR gọi system-items -> $MA (mong đợi 403)"
MA=$(ma -X DELETE -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_SYS")
[ "$MA" = "403" ] && pass "ngay cả ADMIN cũng không xoá được mẫu hệ thống -> 403" \
  || fail "ADMIN xoá mẫu hệ thống -> $MA (mong đợi 403)"

# ------------------------------------------------------ KIỂM TRA TRỌNG SỐ
buoc "KIỂM TRA TRỌNG SỐ KHI XUẤT BẢN"
tao_mau() {
  curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
    -d "{\"code\":\"$1\",\"name\":\"$2\",\"jobTitleId\":\"$JT_KSTK\"}" "$API/kpi-templates" | json "d['id']"
}
luu_items() {
  curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $AT_ADMIN" \
    -H 'Content-Type: application/json' -d "$2" "$API/kpi-templates/$1/items"
}

ID_T1=$(tao_mau ZTEST-W60 "Thử tổng 60")
BODY='{"items":[
 {"key":"a","parentKey":null,"name":"Tiến độ","section":"BSC_WORK","weight":60,"displayOrder":1}]}'
MA=$(luu_items "$ID_T1" "$BODY")
[ "$MA" = "200" ] && pass "lưu nháp mẫu trọng số lệch (60/70) -> 200" \
  || fail "lưu nháp lệch -> $MA (mong đợi 200)"

KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_T1/publish")
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_T1/publish")
[ "$MA" = "400" ] && pass "xuất bản mẫu tổng 60 -> 400" || fail "publish tổng 60 -> $MA (mong đợi 400)"
echo "$KQ" | grep -q '60' && echo "$KQ" | grep -q '70' \
  && pass "thông báo nêu rõ con số 60 và 70" || fail "thông báo không nêu số: $KQ"
echo "$KQ" | grep -q 'thiếu 10' && pass "thông báo nói rõ thiếu 10" || fail "không nói phần thiếu"

ID_T2=$(tao_mau ZTEST-C90 "Thử con 90")
BODY='{"items":[
 {"key":"a","parentKey":null,"name":"Tiến độ hoàn thành Shop Drawing","section":"BSC_WORK","weight":40,"displayOrder":1},
 {"key":"a1","parentKey":"a","name":"Con 1","section":"BSC_WORK","weight":50,"displayOrder":1},
 {"key":"a2","parentKey":"a","name":"Con 2","section":"BSC_WORK","weight":40,"displayOrder":2},
 {"key":"b","parentKey":null,"name":"Chất lượng","section":"BSC_WORK","weight":30,"displayOrder":2}]}'
luu_items "$ID_T2" "$BODY" >/dev/null
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_T2/publish")
echo "$KQ" | grep -q 'Tiến độ hoàn thành Shop Drawing' \
  && pass "lỗi tổng con nêu ĐÚNG TÊN tiêu chí sai" || fail "không nêu tên tiêu chí: $KQ"
echo "$KQ" | grep -q '90' && pass "nêu đúng tổng thực tế 90" || fail "không nêu 90"
echo "$KQ" | grep -q 'Chất lượng' \
  && fail "đổ lỗi nhầm sang tiêu chí đúng" || pass "không đổ lỗi sang tiêu chí đúng"

# ------------------------------------------------------------ CẤU TRÚC
buoc "RÀNG BUỘC CẤU TRÚC"
ID_T3=$(tao_mau ZTEST-L3 "Thử ba cấp")
BODY='{"items":[
 {"key":"a","parentKey":null,"name":"A","section":"BSC_WORK","weight":70,"displayOrder":1},
 {"key":"a1","parentKey":"a","name":"A1","section":"BSC_WORK","weight":100,"displayOrder":1},
 {"key":"a1x","parentKey":"a1","name":"Cháu","section":"BSC_WORK","weight":100,"displayOrder":1}]}'
KQ=$(curl -s -X PUT -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "$BODY" "$API/kpi-templates/$ID_T3/items")
echo "$KQ" | grep -q 'hai cấp' \
  && pass "item cấp 3 bị chặn NGAY LÚC LƯU, nêu rõ chỉ hai cấp" \
  || fail "cấp 3 không bị chặn: $KQ"

ID_T4=$(tao_mau ZTEST-MIX "Thử cấm trộn")
BODY='{"items":[
 {"key":"a","parentKey":null,"name":"A","section":"BSC_WORK","weight":70,"scoringMode":"CALCULATED","displayOrder":1},
 {"key":"a1","parentKey":"a","name":"A1","section":"BSC_WORK","weight":100,"displayOrder":1}]}'
luu_items "$ID_T4" "$BODY" >/dev/null
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_T4/publish")
echo "$KQ" | grep -q 'điểm tính từ các con' \
  && pass "tiêu chí vừa có con vừa chấm trực tiếp -> báo cấm trộn" || fail "cấm trộn không bị chặn: $KQ"

ID_T5=$(tao_mau ZTEST-SEC "Thử khác mục")
BODY='{"items":[
 {"key":"a","parentKey":null,"name":"A","section":"BSC_WORK","weight":70,"displayOrder":1},
 {"key":"a1","parentKey":"a","name":"A1","section":"COMPLIANCE","weight":100,"displayOrder":1}]}'
luu_items "$ID_T5" "$BODY" >/dev/null
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_T5/publish")
echo "$KQ" | grep -qE 'cùng mục|BSC công việc' \
  && pass "KPI con khác mục với cha -> báo lỗi" || fail "khác mục không bị chặn: $KQ"

# ------------------------------------------------------------ SAO CHÉP
buoc "SAO CHÉP MẪU"
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-COPY","name":"Bản sao Shop Drawing"}' "$API/kpi-templates/$ID_SD/duplicate")
ID_COPY=$(echo "$KQ" | json "d['id']")
TT=$(echo "$KQ" | json "d['status']")
[ "$TT" = "DRAFT" ] && pass "bản sao ở trạng thái DRAFT" || fail "bản sao status=$TT (mong đợi DRAFT)"
SO_GOC=$(sql "SELECT count(*) FROM \"KpiTemplateItem\" WHERE \"templateId\"='$ID_SD';")
SO_COPY=$(sql "SELECT count(*) FROM \"KpiTemplateItem\" WHERE \"templateId\"='$ID_COPY';")
[ "$SO_GOC" = "$SO_COPY" ] && pass "bản sao đủ $SO_COPY item như bản gốc" \
  || fail "bản sao có $SO_COPY item, gốc có $SO_GOC"
# Sửa bản sao không được đụng bản gốc
luu_items "$ID_COPY" '{"items":[{"key":"x","parentKey":null,"name":"Chỉ một dòng","section":"BSC_WORK","weight":70,"displayOrder":1}]}' >/dev/null
SO_GOC2=$(sql "SELECT count(*) FROM \"KpiTemplateItem\" WHERE \"templateId\"='$ID_SD';")
[ "$SO_GOC2" = "$SO_GOC" ] && pass "sửa bản sao KHÔNG đụng tới mẫu gốc" \
  || fail "mẫu gốc bị đổi từ $SO_GOC thành $SO_GOC2 — RÒ RỈ GIỮA HAI MẪU"

# ------------------------------------------- DỮ LIỆU THẬT + VERSION + AUDIT
buoc "DỮ LIỆU THẬT TỪ EXCEL"
# KHÔNG xoá AuditLog để đếm từ 0 — xoá sạch nhật ký cả hệ thống chỉ để một
# phép đếm ra số đẹp là cái giá quá đắt. Thay bằng đếm ĐỘ CHÊNH trước/sau,
# cách này còn đúng hơn: nó chứng minh thao tác vừa rồi sinh ra đúng 1 dòng,
# chứ không phải "tổng cộng có 1 dòng".
LOG_TRUOC=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE action='PUBLISH' AND \"entityId\"='$ID_SD';")
V_TRUOC=$(sql "SELECT version FROM \"KpiTemplate\" WHERE code='TPL-KT-SD';")
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_SD/publish")
[ "$MA" = "200" ] && pass "xuất bản mẫu Shop Drawing thật -> 200 (file gốc đúng 70/100)" \
  || fail "publish mẫu thật -> $MA (mong đợi 200)"
V_SAU=$(sql "SELECT version FROM \"KpiTemplate\" WHERE code='TPL-KT-SD';")
[ "$V_SAU" -gt "$V_TRUOC" ] && pass "version tăng $V_TRUOC -> $V_SAU" || fail "version không tăng"
TT=$(sql "SELECT status FROM \"KpiTemplate\" WHERE code='TPL-KT-SD';")
[ "$TT" = "PUBLISHED" ] && pass "trạng thái PUBLISHED" || fail "status=$TT"
sleep 0.3
LOG_SAU=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE action='PUBLISH' AND \"entityId\"='$ID_SD';")
[ "$((LOG_SAU - LOG_TRUOC))" = "1" ] && pass "lần xuất bản này sinh ĐÚNG 1 bản ghi AuditLog PUBLISH" \
  || fail "sinh $((LOG_SAU - LOG_TRUOC)) bản ghi (mong đợi 1)"

for MAU in TPL-KT-KSTK TPL-KT-KSCH TPL-KT-BH; do
  ID=$(sql "SELECT id FROM \"KpiTemplate\" WHERE code='$MAU';")
  MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID/publish")
  [ "$MA" = "200" ] && pass "xuất bản $MAU -> 200" || fail "$MAU -> $MA (mong đợi 200)"
done

buoc "SỬA MẪU ĐÃ XUẤT BẢN THÌ VỀ NHÁP"
ID_T6=$(tao_mau ZTEST-REPUB "Thử xuất bản lại")
luu_items "$ID_T6" '{"items":[{"key":"a","parentKey":null,"name":"A","section":"BSC_WORK","weight":70,"displayOrder":1}]}' >/dev/null
ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_T6/publish" >/dev/null
TT=$(sql "SELECT status FROM \"KpiTemplate\" WHERE code='ZTEST-REPUB';")
[ "$TT" = "PUBLISHED" ] && pass "xuất bản lần đầu -> PUBLISHED" || fail "status=$TT"
luu_items "$ID_T6" '{"items":[{"key":"a","parentKey":null,"name":"A đổi","section":"BSC_WORK","weight":65,"displayOrder":1}]}' >/dev/null
TT=$(sql "SELECT status FROM \"KpiTemplate\" WHERE code='ZTEST-REPUB';")
[ "$TT" = "DRAFT" ] && pass "sửa item mẫu đã xuất bản -> tự về DRAFT" \
  || fail "status sau khi sửa=$TT (mong đợi DRAFT)"

# ===================================================== TỔNG HỢP CHO MÀN DANH SÁCH
buoc "TỔNG HỢP TRÊN DANH SÁCH — số KPI con và tổng trọng số"
# includeInactive: máy dev có thể đã ngừng mẫu thật khi thử tay; ở đây chỉ kiểm phép cộng
DS=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates?includeInactive=true")
# Mẫu Shop Drawing nhập từ Excel: tổng mục BSC đúng 70, có KPI con
KQ=$(echo "$DS" | json "next((f\"{t['weightTotal']}|{t['weightRequired']}|{t['subCriteriaCount']>0}\" for t in d if t['code']=='TPL-KT-SD'), 'KHONG_CO')")
[ "$KQ" = "70.00|70|True" ] && pass "TPL-KT-SD: weightTotal=70.00, weightRequired=70, có KPI con" \
  || fail "TPL-KT-SD trả: $KQ (mong 70.00|70|True)"
# Mẫu hệ thống: cộng ở mục nội quy, yêu cầu 30
KQ=$(echo "$DS" | json "next((f\"{t['weightTotal']}|{t['weightRequired']}\" for t in d if t['code']=='SYS-COMPLIANCE'), 'KHONG_CO')")
[ "$KQ" = "30.00|30" ] && pass "SYS-COMPLIANCE: weightTotal=30.00, weightRequired=30" \
  || fail "SYS-COMPLIANCE trả: $KQ (mong 30.00|30)"
# Đối chiếu số KPI con với DB
SO_DB=$(sql "SELECT count(*) FROM \"KpiTemplateItem\" WHERE \"templateId\"='$ID_SD' AND \"parentId\" IS NOT NULL;")
SO_API=$(echo "$DS" | json "next((t['subCriteriaCount'] for t in d if t['code']=='TPL-KT-SD'), -1)")
[ "$SO_API" = "$SO_DB" ] && pass "subCriteriaCount khớp DB: $SO_API" || fail "API $SO_API, DB $SO_DB"

# ===================================================== KÍCH HOẠT LẠI
buoc "KÍCH HOẠT LẠI MẪU ĐÃ NGỪNG"
ID_KH=$(tao_mau ZTEST-KH "Thử kích hoạt lại")
MA=$(ma -X DELETE -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_KH")
[ "$MA" = "200" ] && pass "vô hiệu hoá mẫu thử -> 200" || fail "vô hiệu hoá -> $MA"
SO=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates" | json "sum(1 for t in d if t['id']=='$ID_KH')")
[ "$SO" = "0" ] && pass "danh sách mặc định KHÔNG còn mẫu đã ngừng" || fail "vẫn thấy mẫu đã ngừng"
SO=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates?includeInactive=true" | json "sum(1 for t in d if t['id']=='$ID_KH' and not t['isActive'])")
[ "$SO" = "1" ] && pass "includeInactive=true thấy mẫu đã ngừng, isActive=false" || fail "includeInactive không thấy"
MA=$(ma -X POST -H "Authorization: Bearer $AT_HR" "$API/kpi-templates/$ID_KH/activate")
[ "$MA" = "403" ] && pass "HR kích hoạt lại -> 403" || fail "HR activate -> $MA"
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_KH/activate")
echo "$KQ" | json "d['isActive'] and d['status']" | grep -q "DRAFT" \
  && pass "ADMIN kích hoạt lại -> isActive=true, về DRAFT để kiểm lại nội dung" || fail "activate: $KQ"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_KH/activate")
[ "$MA" = "400" ] && pass "kích hoạt mẫu đang dùng -> 400" || fail "activate lần hai -> $MA"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_SYS/activate")
[ "$MA" = "403" ] || [ "$MA" = "400" ] && pass "mẫu hệ thống không qua activate (HTTP $MA)" || fail "activate mẫu hệ thống -> $MA"

# Chốt 13/09: "xoá" với vai khác ADMIN = ngừng sử dụng và ẨN HẲN; chỉ ADMIN
# xem lại và khôi phục. Dùng mẫu ZTEST-KH (đã kích hoạt lại ở trên) rồi ngừng lần nữa.
MA=$(ma -X DELETE -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_KH")
[ "$MA" = "200" ] && pass "ngừng lại mẫu thử để kiểm ẩn -> 200" || fail "DELETE lần hai -> $MA"
SO=$(curl -s -H "Authorization: Bearer $AT_KT" "$API/kpi-templates?includeInactive=true" | json "sum(1 for t in d if t['id']=='$ID_KH')")
[ "$SO" = "0" ] && pass "trưởng phòng gọi includeInactive=true vẫn KHÔNG thấy mẫu đã xoá" || fail "MANAGER thấy mẫu đã ngừng"
MA=$(ma -H "Authorization: Bearer $AT_KT" "$API/kpi-templates/$ID_KH")
[ "$MA" = "404" ] && pass "trưởng phòng mở mẫu đã xoá -> 404 (như không tồn tại)" || fail "MANAGER GET mẫu đã ngừng -> $MA"
MA=$(ma -X POST -H "Authorization: Bearer $AT_KT" "$API/kpi-templates/$ID_KH/activate")
[ "$MA" = "403" ] && pass "trưởng phòng khôi phục mẫu đã xoá -> 403 (chỉ ADMIN)" || fail "MANAGER activate -> $MA"
SO=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates?includeInactive=true" | json "sum(1 for t in d if t['id']=='$ID_KH')")
[ "$SO" = "1" ] && pass "ADMIN với includeInactive=true vẫn thấy để khôi phục" || fail "ADMIN không thấy mẫu đã ngừng"

# ===================================================== MẪU NỘI QUY THEO PHÒNG
# Chốt 13/09/2026: trưởng bộ phận chép mẫu nội quy dùng chung về phòng mình,
# sửa và xuất bản; sinh phiếu cho người phòng đó ghép Mục 2 từ bản riêng.
buoc "MẪU NỘI QUY THEO PHÒNG"
P_KT=$(sql "SELECT id FROM \"Department\" WHERE code='KT';")
P_RND=$(sql "SELECT \"departmentId\" FROM \"User\" WHERE email='truongphong.rnd@hmico.vn';")
MA=$(ma -X PUT -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' \
  -d '{"items":[]}' "$API/kpi-templates/$ID_SYS/system-items")
[ "$MA" = "403" ] && pass "trưởng phòng sửa thẳng mẫu nội quy DÙNG CHUNG -> 403" || fail "MANAGER system-items -> $MA"
MA=$(ma -X PUT -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' \
  -d '{"items":[]}' "$API/kpi-templates/$ID_SYS/items")
[ "$MA" = "403" ] && pass "trưởng phòng sửa mẫu nội quy dùng chung qua đường thường -> 403" || fail "MANAGER items SYS -> $MA"
MA=$(ma -X POST -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' \
  -d "{\"code\":\"ZTEST-NQ-RND\",\"name\":\"KT chép cho R&D\",\"departmentId\":\"$P_RND\"}" "$API/kpi-templates/$ID_SYS/duplicate")
[ "$MA" = "403" ] && pass "trưởng phòng Kỹ thuật chép mẫu nội quy cho phòng KHÁC -> 403" || fail "chép cho phòng khác -> $MA"
MA=$(ma -X POST -H "Authorization: Bearer $AT_HR" -H 'Content-Type: application/json' \
  -d "{\"code\":\"ZTEST-NQ-HR\",\"name\":\"HR chép\",\"departmentId\":\"$P_KT\"}" "$API/kpi-templates/$ID_SYS/duplicate")
[ "$MA" = "403" ] && pass "HCNS chép mẫu nội quy -> 403 (chỉ xem)" || fail "HR duplicate -> $MA"

R=$(curl -s -w '\n%{http_code}' -X POST -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' \
  -d "{\"code\":\"ZTEST-NQ-KT\",\"name\":\"Nội quy phòng Kỹ thuật\",\"departmentId\":\"$P_KT\"}" "$API/kpi-templates/$ID_SYS/duplicate")
MA=$(echo "$R" | tail -1); BODY_NQ=$(echo "$R" | sed '$d'); ID_NQ=$(echo "$BODY_NQ" | json "d['id']")
[ "$MA" = "201" ] && pass "trưởng phòng Kỹ thuật chép mẫu nội quy về phòng mình -> 201" || fail "chép về phòng mình -> $MA: $BODY_NQ"
echo "$BODY_NQ" | json "d['isSystem'] and d['departmentId']=='$P_KT' and d['jobTitleId'] is None" | grep -q True \
  && pass "bản sao: isSystem=true, gắn phòng KT, không gắn chức danh" || fail "bản sao sai hình dạng: $BODY_NQ"
TS_MUC2=$(sql "SELECT (value->>'compliance') FROM \"SystemSetting\" WHERE key='trongSo';")
echo "$BODY_NQ" | json "d['weightRequired']" | grep -q "^${TS_MUC2:-30}$" \
  && pass "weightRequired của bản sao = trọng số Mục 2 trong cài đặt" || fail "weightRequired: $(echo "$BODY_NQ" | json "d['weightRequired']")"
SO_SYS=$(sql "SELECT count(*) FROM \"KpiTemplateItem\" WHERE \"templateId\"='$ID_SYS';")
SO_NQ=$(sql "SELECT count(*) FROM \"KpiTemplateItem\" WHERE \"templateId\"='$ID_NQ';")
[ "$SO_SYS" = "$SO_NQ" ] && pass "bản sao đủ $SO_NQ tiêu chí nội quy như mẫu chung" || fail "bản sao $SO_NQ item, gốc $SO_SYS"

MA=$(ma -X POST -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' \
  -d "{\"code\":\"ZTEST-NQ-KT2\",\"name\":\"Bản thứ hai\",\"departmentId\":\"$P_KT\"}" "$API/kpi-templates/$ID_SYS/duplicate")
[ "$MA" = "409" ] && pass "chép lần hai cho cùng phòng -> 409 (mỗi phòng MỘT mẫu nội quy)" || fail "chép lần hai -> $MA"

# Trưởng phòng sửa trọng số Mục 2 của phòng mình qua ĐƯỜNG THƯỜNG, rồi xuất bản
NQ_BODY='{"items":[
  {"key":"a","parentKey":null,"name":"Đi trễ về sớm","section":"COMPLIANCE","weight":15,"displayOrder":1},
  {"key":"b","parentKey":null,"name":"Vi phạm nội quy công trường","section":"COMPLIANCE","weight":10,"displayOrder":2},
  {"key":"c","parentKey":null,"name":"Văn hoá doanh nghiệp","section":"COMPLIANCE","weight":5,"displayOrder":3}]}'
MA=$(ma -X PUT -H "Authorization: Bearer $AT_RND" -H 'Content-Type: application/json' -d "$NQ_BODY" "$API/kpi-templates/$ID_NQ/items")
[ "$MA" = "403" ] && pass "trưởng phòng R&D sửa mẫu nội quy của Kỹ thuật -> 403" || fail "R&D sửa NQ KT -> $MA"
MA=$(ma -H "Authorization: Bearer $AT_RND" "$API/kpi-templates/$ID_NQ")
[ "$MA" = "403" ] && pass "trưởng phòng R&D xem mẫu nội quy của Kỹ thuật -> 403" || fail "R&D xem NQ KT -> $MA"
MA=$(ma -X PUT -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' -d "$NQ_BODY" "$API/kpi-templates/$ID_NQ/items")
[ "$MA" = "200" ] && pass "trưởng phòng Kỹ thuật đổi trọng số Mục 2 thành 15/10/5 -> 200" || fail "KT sửa NQ -> $MA"
R=$(curl -s -w '\n%{http_code}' -X POST -H "Authorization: Bearer $AT_KT" "$API/kpi-templates/$ID_NQ/publish")
MA=$(echo "$R" | tail -1)
[ "$MA" = "200" ] && pass "trưởng phòng xuất bản mẫu nội quy của phòng -> 200" || fail "publish NQ -> $MA: $(echo "$R" | sed '$d')"
SO_SYS2=$(sql "SELECT count(*) FROM \"KpiTemplateItem\" WHERE \"templateId\"='$ID_SYS' AND weight=15;")
[ "$SO_SYS2" = "0" ] && pass "mẫu nội quy dùng chung KHÔNG bị đổi theo" || fail "mẫu chung bị đổi — RÒ RỈ GIỮA PHÒNG"

# Sinh phiếu thật cho người phòng Kỹ thuật: Mục 2 phải là bản của phòng.
# Dùng mẫu chức danh do script tạo, không dựa vào bốn mẫu thật (máy dev có
# thể đã ngừng chúng khi thử tay).
TS_MUC1=$(sql "SELECT (value->>'bscWork') FROM \"SystemSetting\" WHERE key='trongSo';")
ID_JT_NQ=$(tao_mau ZTEST-NQ-JT "Mẫu chức danh cho thử nội quy")
luu_items "$ID_JT_NQ" "{\"items\":[{\"key\":\"m\",\"parentKey\":null,\"name\":\"Một tiêu chí\",\"section\":\"BSC_WORK\",\"weight\":${TS_MUC1:-70},\"displayOrder\":1}]}" >/dev/null
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates/$ID_JT_NQ/publish")
[ "$MA" = "200" ] && pass "mẫu chức danh thử xuất bản -> 200" || fail "publish mẫu chức danh thử -> $MA"
KY_MO=$(sql "SELECT id FROM \"Period\" WHERE type='MONTH' AND NOT \"isLocked\" ORDER BY code DESC LIMIT 1;")
sql "INSERT INTO \"User\" (id,\"employeeCode\",email,\"fullName\",\"passwordHash\",role,\"departmentId\",\"jobTitleId\",\"isActive\",\"mustChangePassword\",\"createdAt\",\"updatedAt\")
     VALUES (gen_random_uuid(),'ZTESTNQ','ztestnq@hmico.vn','Người thử nội quy',(SELECT \"passwordHash\" FROM \"User\" LIMIT 1),'STAFF','$P_KT','$JT_KSTK',true,true,now(),now());" >/dev/null
U_NQ=$(sql "SELECT id FROM \"User\" WHERE \"employeeCode\"='ZTESTNQ';")
R=$(curl -s -w '\n%{http_code}' -X POST -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_NQ\",\"periodId\":\"$KY_MO\"}" "$API/scorecards")
MA=$(echo "$R" | tail -1); ID_PHIEU=$(echo "$R" | sed '$d' | json "d['id']")
[ "$MA" = "201" ] && pass "sinh phiếu cho nhân viên phòng Kỹ thuật -> 201" || fail "sinh phiếu -> $MA: $(echo "$R" | sed '$d')"
if [ -n "$ID_PHIEU" ]; then
  ST=$(sql "SELECT \"systemTemplateId\" FROM \"Scorecard\" WHERE id='$ID_PHIEU';")
  [ "$ST" = "$ID_NQ" ] && pass "phiếu ghép Mục 2 từ mẫu nội quy CỦA PHÒNG, không phải mẫu chung" || fail "systemTemplateId=$ST (mong đợi $ID_NQ)"
  TS=$(sql "SELECT string_agg(weight::text, '/' ORDER BY \"displayOrder\") FROM \"ScorecardItem\" WHERE \"scorecardId\"='$ID_PHIEU' AND section='COMPLIANCE';")
  echo "$TS" | grep -q "15.*10.*5" && pass "Mục 2 trên phiếu là 15/10/5 của phòng ($TS)" || fail "Mục 2 trên phiếu: $TS"
fi

# Ngừng mẫu của phòng -> phiếu sinh sau đó về lại mẫu chung
MA=$(ma -X DELETE -H "Authorization: Bearer $AT_KT" "$API/kpi-templates/$ID_NQ")
[ "$MA" = "200" ] && pass "trưởng phòng ngừng mẫu nội quy của phòng -> 200 (mẫu chung thì không ai ngừng được)" || fail "DELETE NQ -> $MA"
sql "DELETE FROM \"ScorecardEvent\" WHERE \"scorecardId\"='$ID_PHIEU'; DELETE FROM \"ScorecardItem\" WHERE \"scorecardId\"='$ID_PHIEU'; DELETE FROM \"Scorecard\" WHERE id='$ID_PHIEU';" >/dev/null
R=$(curl -s -w '\n%{http_code}' -X POST -H "Authorization: Bearer $AT_KT" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_NQ\",\"periodId\":\"$KY_MO\"}" "$API/scorecards")
ID_PHIEU2=$(echo "$R" | sed '$d' | json "d['id']")
ST=$(sql "SELECT \"systemTemplateId\" FROM \"Scorecard\" WHERE id='$ID_PHIEU2';")
[ "$ST" = "$ID_SYS" ] && pass "sau khi ngừng mẫu của phòng, phiếu mới về lại mẫu nội quy dùng chung" || fail "systemTemplateId=$ST (mong đợi $ID_SYS)"

echo
printf '%.0s=' {1..60}; echo
if [ "$SO_FAIL" -eq 0 ]; then
  printf '\033[32mTẤT CẢ %d KIỂM TRA ĐỀU PASS\033[0m\n' "$SO_PASS"
else
  printf '\033[31m%d PASS, %d FAIL\033[0m\n' "$SO_PASS" "$SO_FAIL"
fi
printf '%.0s=' {1..60}; echo
exit "$([ "$SO_FAIL" -eq 0 ] && echo 0 || echo 1)"
