#!/usr/bin/env bash
#
# Kiểm chứng lát cắt 6 — báo cáo tiến độ, xuất Excel, dashboard.
#
# Chạy:  ./scripts/kiem-chung-lat-cat-6.sh
# Yêu cầu: PostgreSQL đang chạy, đã `npm run build` và `npx prisma db seed`.
#
# ⚠️ CHẠY `pg_dump` TRƯỚC LẦN ĐẦU:
#     docker exec kpi-postgres pg_dump -U kpi_dev kpi_db > /tmp/kpi-truoc-kiem-chung.sql
#   Script tạo phiếu và chấm điểm để có dữ liệu báo cáo. Mọi thứ đều được
#   hoàn nguyên lúc kết thúc, nhưng bản sao lưu là thứ duy nhất cứu được nếu
#   script chết giữa chừng.
#
# Tự khởi động API ở cổng 3196, tự tắt và TỰ DỌN dữ liệu thử khi xong.

set -uo pipefail
cd "$(dirname "$0")/.."

# Chốt chặn: chỉ chạy khi có biến đồng ý tường minh, KHÔNG đoán môi trường
# bằng hostname hay chuỗi kết nối.
. "$(dirname "$0")/_chi-chay-cuc-bo.sh"

PORT=3196
API="http://localhost:$PORT"
MAT_KHAU="${SEED_PASSWORD:-Hmico@2026}"
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

sql() { docker exec kpi-postgres psql -U kpi_dev -d kpi_db -t -A -c "$1" 2>/dev/null; }

. "$(dirname "$0")/_moc-du-lieu.sh"

don_du_lieu_thu() {
  # CHỈ xoá thứ script tạo ra: phiếu theo mốc id chụp lúc bắt đầu, kỳ và
  # người dùng theo tiền tố ZTEST. Không có DELETE không điều kiện ở đâu.
  xoa_phieu_cua_script
  xoa_auditlog_cua_script
  khoi_phuc_khoa_ky
  docker exec kpi-postgres psql -U kpi_dev -d kpi_db -c "
    DELETE FROM \"Period\" WHERE code LIKE 'ZTEST%';
    DELETE FROM \"RefreshToken\" WHERE \"userId\" IN (SELECT id FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%');
    DELETE FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%';
  " >/dev/null 2>&1
}

don_dep() {
  [ -n "${PID_API:-}" ] && kill "$PID_API" 2>/dev/null
  wait 2>/dev/null
  don_du_lieu_thu
  bo_moc_du_lieu
  rm -rf "$TMP"
}
trap don_dep EXIT

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
jq_() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

# PUT/POST kèm token, trả "<mã HTTP>|<thân trả về>"
goi() {
  local phuongthuc=$1 token=$2 duongdan=$3 than=${4:-}
  local out
  if [ -n "$than" ]; then
    out=$(curl -s -w '\n%{http_code}' -X "$phuongthuc" -H "Authorization: Bearer $token" \
      -H 'Content-Type: application/json' -d "$than" "$API$duongdan")
  else
    out=$(curl -s -w '\n%{http_code}' -X "$phuongthuc" -H "Authorization: Bearer $token" \
      -H 'Content-Type: application/json' "$API$duongdan")
  fi
  printf '%s|%s' "$(echo "$out" | tail -1)" "$(echo "$out" | sed '$d' | tr -d '\n')"
}
ma_cua() { echo "$1" | cut -d'|' -f1; }
than_cua() { echo "$1" | cut -d'|' -f2-; }

# Kiểm mã HTTP, in PASS/FAIL kèm mã thật nhận được.
mong() {
  local nhan=$1 chuan=$2 mota=$3 than=${4:-}
  if [ "$nhan" = "$chuan" ]; then
    pass "$mota (HTTP $nhan)"
  else
    fail "$mota — nhận HTTP $nhan, mong đợi $chuan${than:+ | ${than:0:200}}"
  fi
}

# Payload chấm ĐỦ mọi tiêu chí lá của một phiếu, điểm bằng đúng thang.
payload_cham_du() {
  local scorecard_id=$1
  sql "SELECT i.id || E'\t' || i.\"maxScale\"
         FROM \"ScorecardItem\" i
        WHERE i.\"scorecardId\"='$scorecard_id'
          AND NOT EXISTS (SELECT 1 FROM \"ScorecardItem\" c WHERE c.\"parentId\"=i.id);" \
  | python3 -c "
import json,sys
rows=[l.split('\t') for l in sys.stdin.read().splitlines() if l.strip()]
print(json.dumps({'scores':[{'itemId':r[0],'score':float(r[1])} for r in rows]}))"
}

echo "Khởi động API cổng $PORT..."
PORT=$PORT LOGIN_RATE_LIMIT_PER_MINUTE=200 node dist/main.js > "$TMP/api.log" 2>&1 &
PID_API=$!
for _ in $(seq 1 40); do curl -sf -o /dev/null "$API/" 2>/dev/null && break; sleep 0.5; done
if ! curl -sf -o /dev/null "$API/"; then
  echo "Không khởi động được API:"; tail -20 "$TMP/api.log"; exit 1
fi

chup_moc_du_lieu
don_du_lieu_thu

KY_DANG_KHOA=$(sql "SELECT string_agg(code, ', ') FROM \"Period\" WHERE code IN ('2026-08','2026-09','2026-10','2026-Q3') AND \"isLocked\";")
if [ -n "$KY_DANG_KHOA" ]; then
  echo; echo "DỪNG: các kỳ sau đang bị khoá nên script không thao tác được: $KY_DANG_KHOA"
  echo "Script cố ý KHÔNG tự mở — khoá kỳ là quyết định của bạn."
  exit 1
fi

AT_ADMIN=$(token_cua admin@hmico.vn)
AT_HR=$(token_cua hcns@hmico.vn)
AT_KT=$(token_cua truongphong.kythuat@hmico.vn)
AT_RND=$(token_cua truongphong.rnd@hmico.vn)
AT_BGD=$(token_cua giamdoc@hmico.vn)
AT_NV1=$(token_cua kt.trienkhai1@hmico.vn)
AT_NV2=$(token_cua sd.nhanvien2@hmico.vn)
AT_SD=$(token_cua sd.nhanvien1@hmico.vn)

if [ -z "$AT_ADMIN" ] || [ -z "$AT_NV1" ]; then
  echo; echo "Không đăng nhập được bằng tài khoản seed. Chạy: npx prisma db seed"; exit 1
fi

KY_08=$(sql "SELECT id FROM \"Period\" WHERE code='2026-08';")
KY_09=$(sql "SELECT id FROM \"Period\" WHERE code='2026-09';")
KY_Q3=$(sql "SELECT id FROM \"Period\" WHERE code='2026-Q3';")
KY_10=$(sql "SELECT id FROM \"Period\" WHERE code='2026-10';")
U_NV1=$(sql "SELECT id FROM \"User\" WHERE email='kt.trienkhai1@hmico.vn';")
U_NV2=$(sql "SELECT id FROM \"User\" WHERE email='sd.nhanvien2@hmico.vn';")
U_KT=$(sql "SELECT id FROM \"User\" WHERE email='truongphong.kythuat@hmico.vn';")
U_SD=$(sql "SELECT id FROM \"User\" WHERE email='sd.nhanvien1@hmico.vn';")

P_HN=$(sql "SELECT id FROM \"Department\" WHERE code='HN';")
P_HMICO=$(sql "SELECT id FROM \"Department\" WHERE code='HMICO';")
P_RND=$(sql "SELECT id FROM \"Department\" WHERE code='RND';")
P_KT=$(sql "SELECT id FROM \"Department\" WHERE code='KT';")

# Lấy một trường của một phòng trong kết quả báo cáo.
# Dùng python3 vì phải lọc theo departmentId rồi mới đọc cột.
truong_cua_phong() {
  local than=$1 phong=$2 truong=$3
  echo "$than" | python3 -c "
import json,sys
d=json.load(sys.stdin)
row=next((r for r in d['departments'] if r['departmentId']=='$phong'), None)
print(row['$truong'] if row else 'KHONG_CO')" 2>/dev/null
}

# ========================================================= DỰNG DỮ LIỆU
buoc "DỰNG DỮ LIỆU — vài phiếu ở các trạng thái khác nhau"

# Phiếu 1: sinh rồi để nguyên DRAFT  -> chuaKyNhan
R=$(goi POST "$AT_ADMIN" /scorecards "{\"userId\":\"$U_NV2\",\"periodId\":\"$KY_08\"}")
SC_DRAFT=$(than_cua "$R" | jq_ "d['id']")
[ -n "$SC_DRAFT" ] && pass "sinh phiếu để nguyên DRAFT" || fail "$(than_cua "$R")"

# Phiếu 2: ký nhận, chưa chấm -> choTuCham
R=$(goi POST "$AT_ADMIN" /scorecards "{\"userId\":\"$U_NV1\",\"periodId\":\"$KY_08\"}")
SC_CHUA_CHAM=$(than_cua "$R" | jq_ "d['id']")
goi POST "$AT_KT" "/scorecards/$SC_CHUA_CHAM/propose" >/dev/null
goi POST "$AT_NV1" "/scorecards/$SC_CHUA_CHAM/accept" >/dev/null
pass "sinh phiếu đã ký nhận, chưa chấm"

# ======================================================= 1-5 CƠ BẢN
buoc "1–5  TIẾN ĐỘ NỘP — kiểu kỳ và phân quyền"

R=$(goi GET "$AT_HR" "/reports/submission-progress?periodId=$KY_08")
mong "$(ma_cua "$R")" 200 "1. HR gọi với kỳ tháng" "$(than_cua "$R")"
THAN_HR=$(than_cua "$R")
SO_PHONG=$(echo "$THAN_HR" | jq_ "len(d['departments'])")
[ "${SO_PHONG:-0}" -ge 13 ] && pass "   trả về $SO_PHONG phòng ban" || fail "   chỉ $SO_PHONG phòng"

R=$(goi GET "$AT_HR" "/reports/submission-progress?periodId=$KY_Q3")
mong "$(ma_cua "$R")" 400 "2. truyền kỳ QUÝ -> 400"
echo "$(than_cua "$R")" | grep -q "kỳ tháng" \
  && pass "   thông báo nói rõ phiếu KPI chỉ gắn với kỳ tháng" \
  || fail "   thông báo: $(than_cua "$R" | head -c 120)"

KY_NAM=$(sql "SELECT id FROM \"Period\" WHERE type='YEAR' LIMIT 1;")
R=$(goi GET "$AT_HR" "/reports/submission-progress?periodId=$KY_NAM")
mong "$(ma_cua "$R")" 400 "3. truyền kỳ NĂM -> 400"

R=$(goi GET "$AT_HR" "/reports/submission-progress?periodId=00000000-0000-4000-8000-000000000000")
mong "$(ma_cua "$R")" 404 "4. periodId không tồn tại -> 404"

R=$(goi GET "$AT_NV1" "/reports/submission-progress?periodId=$KY_08")
mong "$(ma_cua "$R")" 403 "5. STAFF gọi -> 403"

# ======================================================= 6-8 PHẠM VI
buoc "6–8  PHẠM VI PHÒNG BAN"

R=$(goi GET "$AT_KT" "/reports/submission-progress?periodId=$KY_08")
mong "$(ma_cua "$R")" 200 "6. MANAGER phòng Kỹ thuật gọi"
THAN_KT=$(than_cua "$R")
DS_KT=$(echo "$THAN_KT" | python3 -c "
import json,sys
print(','.join(sorted(r['departmentName'] for r in json.load(sys.stdin)['departments'])))" 2>/dev/null)
# HCNS chốt 03/09: phòng Kỹ thuật KHÔNG còn tổ con nào, nên phạm vi đúng
# là ĐÚNG MỘT phòng. Prompt viết "Kỹ thuật + 2 tổ con" theo cây cũ.
[ "$DS_KT" = "Phòng Kỹ thuật" ] \
  && pass "   chỉ thấy đúng phòng mình: $DS_KT" \
  || fail "   thấy: $DS_KT"

R=$(goi GET "$AT_RND" "/reports/submission-progress?periodId=$KY_08")
CO_KT=$(than_cua "$R" | python3 -c "
import json,sys
print('co' if any(r['departmentId']=='$P_KT' for r in json.load(sys.stdin)['departments']) else 'khong')" 2>/dev/null)
[ "$CO_KT" = "khong" ] \
  && pass "7. MANAGER phòng khác KHÔNG thấy dữ liệu phòng Kỹ thuật" \
  || fail "7. trưởng phòng R&D thấy được phòng Kỹ thuật"

R=$(goi GET "$AT_BGD" "/reports/submission-progress?periodId=$KY_08")
mong "$(ma_cua "$R")" 200 "8. EXECUTIVE gọi -> toàn công ty"
SO_BGD=$(than_cua "$R" | jq_ "len(d['departments'])")
[ "$SO_BGD" = "$SO_PHONG" ] \
  && pass "   thấy đủ $SO_BGD phòng như HR" \
  || fail "   BGĐ thấy $SO_BGD phòng, HR thấy $SO_PHONG"

# ======================================================= 9-11 SỐ LIỆU
buoc "9–11  CỘNG DỒN VÀ ĐẾM"

# Cây thật chỉ 3 tầng và phòng Kỹ thuật không có con, nên kiểm cộng dồn ở
# mức CHI NHÁNH: HN phải bằng tổng mọi phòng con của nó.
TONG_CON_HN=$(sql "SELECT count(*) FROM \"User\" u JOIN \"Department\" d ON d.id=u.\"departmentId\" WHERE u.\"isActive\" AND d.\"parentId\"=(SELECT id FROM \"Department\" WHERE code='HN');")
TRUC_THUOC_HN=$(sql "SELECT count(*) FROM \"User\" WHERE \"isActive\" AND \"departmentId\"='$P_HN';")
HN_BAO_CAO=$(truong_cua_phong "$THAN_HR" "$P_HN" tongNhanSu)
[ "$HN_BAO_CAO" = "$((TONG_CON_HN + TRUC_THUOC_HN))" ] \
  && pass "9. cộng dồn: Hà Nội = $HN_BAO_CAO (trực thuộc $TRUC_THUOC_HN + phòng con $TONG_CON_HN)" \
  || fail "9. Hà Nội báo cáo $HN_BAO_CAO, đếm trực tiếp ra $((TONG_CON_HN + TRUC_THUOC_HN))"

TONG_CTY=$(sql "SELECT count(*) FROM \"User\" WHERE \"isActive\" AND \"departmentId\" IS NOT NULL;")
HMICO_BAO_CAO=$(truong_cua_phong "$THAN_HR" "$P_HMICO" tongNhanSu)
[ "$HMICO_BAO_CAO" = "$TONG_CTY" ] \
  && pass "   cộng dồn lên đỉnh: HMICO = $HMICO_BAO_CAO = toàn bộ nhân sự" \
  || fail "   HMICO báo cáo $HMICO_BAO_CAO, toàn công ty có $TONG_CTY"

# Người đã nghỉ việc không được tính
sql "UPDATE \"User\" SET \"isActive\"=false WHERE email='sd.nhanvien2@hmico.vn';" >/dev/null
R=$(goi GET "$AT_HR" "/reports/submission-progress?periodId=$KY_08")
KT_SAU=$(truong_cua_phong "$(than_cua "$R")" "$P_KT" tongNhanSu)
KT_TRUOC=$(truong_cua_phong "$THAN_HR" "$P_KT" tongNhanSu)
sql "UPDATE \"User\" SET \"isActive\"=true WHERE email='sd.nhanvien2@hmico.vn';" >/dev/null
[ "$KT_SAU" = "$((KT_TRUOC - 1))" ] \
  && pass "10. người isActive=false không tính vào tongNhanSu ($KT_TRUOC -> $KT_SAU)" \
  || fail "10. trước $KT_TRUOC, sau khi vô hiệu hoá 1 người vẫn là $KT_SAU"

# Kỳ chưa ai được sinh phiếu
R=$(goi GET "$AT_HR" "/reports/submission-progress?periodId=$KY_10")
THAN_10=$(than_cua "$R")
KT_10=$(echo "$THAN_10" | python3 -c "
import json,sys
r=next(x for x in json.load(sys.stdin)['departments'] if x['departmentId']=='$P_KT')
print(f\"{r['tongNhanSu']}|{r['chuaCoPhieu']}|{r['chuaKyNhan']}|{r['choTuCham']}|{r['choTruongCham']}|{r['choTiepNhan']}|{r['daNop']}\")" 2>/dev/null)
[ "$KT_10" = "8|8|0|0|0|0|0" ] \
  && pass "11. kỳ chưa ai có phiếu: chuaCoPhieu = tổng nhân sự, các cột khác 0" \
  || fail "11. kỳ tháng 10 phòng KT = $KT_10 (mong đợi 8|8|0|0|0|0|0)"

# Trạng thái phiếu vừa dựng phải rơi đúng cột
KT_08=$(echo "$THAN_HR" | python3 -c "
import json,sys
r=next(x for x in json.load(sys.stdin)['departments'] if x['departmentId']=='$P_KT')
print(f\"{r['chuaKyNhan']}|{r['choTuCham']}\")" 2>/dev/null)
[ "$KT_08" = "1|1" ] \
  && pass "    phiếu DRAFT vào cột chuaKyNhan, phiếu đã ký vào choTuCham" \
  || fail "    chuaKyNhan|choTuCham = $KT_08 (mong đợi 1|1)"

HAN=$(echo "$THAN_HR" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f\"{d['daysUntilDeadline']}|{d['isOverdue']}\")" 2>/dev/null)
[ "$HAN" = "None|False" ] \
  && pass "    mốc hạn để trống đúng như đang chờ HCNS chốt" \
  || fail "    hạn = $HAN (mong đợi None|False)"

# ================================================= TỔNG KẾT
buoc "TỔNG KẾT"
echo "  PASS: $SO_PASS    FAIL: $SO_FAIL"
[ "$SO_FAIL" -eq 0 ] || exit 1
