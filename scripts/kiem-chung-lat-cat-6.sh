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

# Phiếu 3: chấm đủ và CHỐT ĐIỂM -> daNop, và là dòng có điểm trong file Excel.
# Không có phiếu đã chốt thì ca "ô điểm là kiểu số" không kiểm được gì:
# mọi ô điểm đều trống và assertion đi qua một tập rỗng.
R=$(goi POST "$AT_ADMIN" /scorecards "{\"userId\":\"$U_SD\",\"periodId\":\"$KY_08\"}")
SC_DA_CHOT=$(than_cua "$R" | jq_ "d['id']")
goi POST "$AT_KT" "/scorecards/$SC_DA_CHOT/propose" >/dev/null
goi POST "$AT_SD" "/scorecards/$SC_DA_CHOT/accept" >/dev/null
goi PUT "$AT_SD" "/scorecards/$SC_DA_CHOT/self-scores" "$(payload_cham_du "$SC_DA_CHOT")" >/dev/null
goi POST "$AT_SD" "/scorecards/$SC_DA_CHOT/self-submit" >/dev/null
goi PUT "$AT_KT" "/scorecards/$SC_DA_CHOT/manager-scores" "$(payload_cham_du "$SC_DA_CHOT")" >/dev/null
goi POST "$AT_KT" "/scorecards/$SC_DA_CHOT/manager-submit" '{}' >/dev/null
R=$(goi POST "$AT_HR" "/scorecards/$SC_DA_CHOT/receive")
mong "$(ma_cua "$R")" 200 "sinh phiếu đã chấm đủ và HCNS tiếp nhận"

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

# ================================================= 12-16 XUẤT EXCEL
buoc "12–16  XUẤT EXCEL"

TAI_VE="$TMP/xuat.xlsx"
MA_XUAT=$(curl -s -D "$TMP/header.txt" -o "$TAI_VE" -w '%{http_code}' \
  -H "Authorization: Bearer $AT_HR" "$API/reports/export?periodId=$KY_08")
mong "$MA_XUAT" 200 "12. HR xuất kỳ tháng"
grep -qi "spreadsheetml" "$TMP/header.txt" \
  && pass "    content-type là spreadsheetml" \
  || fail "    content-type: $(grep -i content-type "$TMP/header.txt" | head -c 100)"
KICH_THUOC=$(stat -c%s "$TAI_VE")
[ "$KICH_THUOC" -gt 0 ] && pass "    file $KICH_THUOC byte" || fail "    file rỗng"
TEN_FILE=$(grep -oiP 'filename="\K[^"]+' "$TMP/header.txt" | tr -d '\r')
echo "$TEN_FILE" | grep -qE '^KPI_2026-08_[0-9]{8}-[0-9]{4}\.xlsx$' \
  && pass "    tên file đúng khuôn: $TEN_FILE" \
  || fail "    tên file: $TEN_FILE"

MA=$(ma -H "Authorization: Bearer $AT_NV1" "$API/reports/export?periodId=$KY_08")
mong "$MA" 403 "13. STAFF xuất"

TAI_KT="$TMP/xuat-kt.xlsx"
MA=$(curl -s -o "$TAI_KT" -w '%{http_code}' \
  -H "Authorization: Bearer $AT_KT" "$API/reports/export?periodId=$KY_08")
mong "$MA" 200 "14. MANAGER xuất"
# Số dòng kỳ vọng: nhân sự đang làm việc trong phạm vi + người ĐÃ NGHỈ mà
# vẫn có phiếu trong kỳ. Vế sau là cố ý — xem báo cáo giai đoạn 2.
MONG_DONG=$(sql "
  SELECT count(*) FROM (
    SELECT u.id FROM \"User\" u WHERE u.\"isActive\" AND u.\"departmentId\"='$P_KT'
    UNION
    SELECT s.\"ownerUserId\" FROM \"Scorecard\" s
     WHERE s.\"periodId\"='$KY_08' AND s.\"departmentId\"='$P_KT'
  ) x;")
SO_DONG=$(python3 -c "
import sys, zipfile, re
import xml.etree.ElementTree as ET
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
z=zipfile.ZipFile('$TAI_KT')
ws=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
print(len([r for r in ws.iter(f'{NS}row')]) - 1)")
[ "$SO_DONG" = "$MONG_DONG" ] \
  && pass "    $SO_DONG dòng = số người trong phạm vi phòng mình" \
  || fail "    file có $SO_DONG dòng, phạm vi có $MONG_DONG người"

MA=$(ma -H "Authorization: Bearer $AT_HR" "$API/reports/export?periodId=$KY_Q3")
mong "$MA" 400 "15. xuất kỳ QUÝ"

TRUOC=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityType\"='Report' AND action='EXPORT';")
curl -s -o /dev/null -H "Authorization: Bearer $AT_HR" "$API/reports/export?periodId=$KY_08"
SAU=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityType\"='Report' AND action='EXPORT';")
[ "$SAU" = "$((TRUOC + 1))" ] \
  && pass "16. mỗi lần xuất ghi đúng 1 dòng AuditLog ($TRUOC -> $SAU)" \
  || fail "16. AuditLog $TRUOC -> $SAU (mong đợi tăng 1)"
GHI=$(sql "SELECT after->>'periodCode' || '|' || (after->>'soDong') FROM \"AuditLog\" WHERE \"entityType\"='Report' ORDER BY \"createdAt\" DESC LIMIT 1;")
echo "$GHI" | grep -q '^2026-08|' \
  && pass "    nhật ký ghi rõ kỳ nào, bao nhiêu dòng: $GHI" \
  || fail "    nhật ký ghi: $GHI"

# ĐỌC LẠI FILE VỪA TẢI — không tin vào việc "tải thành công"
buoc "     Đọc lại file HR vừa tải, kiểm từng ô"
KET_QUA=$(python3 -c "
import zipfile, re
import xml.etree.ElementTree as ET
NS='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
z=zipfile.ZipFile('$TAI_VE')
shared=[]
if 'xl/sharedStrings.xml' in z.namelist():
    r=ET.fromstring(z.read('xl/sharedStrings.xml'))
    shared=[''.join(t.text or '' for t in si.iter(f'{NS}t')) for si in r.findall(f'{NS}si')]
ws=ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
rows={}
for row in ws.iter(f'{NS}row'):
    cells={}
    for c in row.findall(f'{NS}c'):
        ref=re.match(r'([A-Z]+)', c.get('r')).group(1)
        v=c.find(f'{NS}v')
        cells[ref]=(c.get('t'), shared[int(v.text)] if c.get('t')=='s' and v is not None else (v.text if v is not None else None))
    rows[int(row.get('r'))]=cells
tieu_de=[rows[1].get(c,(None,None))[1] for c in ['A','F','G','H']]
# Ô điểm: kiểu 's' (shared string) là SAI, phải là số (không có thuộc tính t)
kieu_diem=set(); so_o_co_diem=0; so_o_trong=0
for n,cells in rows.items():
    if n==1: continue
    for cot in ['F','G']:
        t,val=cells.get(cot,(None,None))
        if val is None: so_o_trong+=1
        else:
            so_o_co_diem+=1
            kieu_diem.add(t or 'so')
xml=z.read('xl/worksheets/sheet1.xml')
print('|'.join([str(tieu_de), str(sorted(kieu_diem)), f'co-diem={so_o_co_diem}', f'trong={so_o_trong}',
  'dongbang' if b'frozen' in xml else 'khong', 'loc' if b'autoFilter' in xml else 'khong']))")
echo "$KET_QUA" | grep -q "Tổng điểm QL đánh giá" \
  && pass "    tiêu đề tiếng Việt có dấu đúng" || fail "    tiêu đề: $KET_QUA"
# Phải có CẢ ô mang số lẫn ô để trống. Chỉ kiểm "không có ô chuỗi" là
# assertion rỗng khi chưa phiếu nào chấm xong — nó đi qua một tập rỗng và
# vẫn xanh.
CO_DIEM=$(echo "$KET_QUA" | grep -oP 'co-diem=\K[0-9]+')
O_TRONG=$(echo "$KET_QUA" | grep -oP 'trong=\K[0-9]+')
if echo "$KET_QUA" | grep -q "\['so'\]" && [ "${CO_DIEM:-0}" -gt 0 ]; then
  pass "    $CO_DIEM ô điểm đều là KIỂU SỐ, không phải chuỗi"
else
  fail "    kiểu ô điểm: $KET_QUA"
fi
[ "${O_TRONG:-0}" -gt 0 ] \
  && pass "    $O_TRONG ô điểm của phiếu chưa chốt để TRỐNG, không ghi 0" \
  || fail "    không có ô trống nào — phiếu chưa chốt đang bị ghi 0?"
echo "$KET_QUA" | grep -q "dongbang" \
  && pass "    dòng tiêu đề được đóng băng" || fail "    không đóng băng"
echo "$KET_QUA" | grep -q "|loc" \
  && pass "    bật bộ lọc trên dòng tiêu đề" || fail "    không có autoFilter"

# ================================================= 17-21 DASHBOARD
buoc "17–21  DASHBOARD"

R=$(goi GET "$AT_HR" "/reports/dashboard?periodId=$KY_08")
mong "$(ma_cua "$R")" 200 "17. HR gọi" "$(than_cua "$R")"
THAN_DB=$(than_cua "$R")

R=$(goi GET "$AT_NV1" "/reports/dashboard?periodId=$KY_08")
mong "$(ma_cua "$R")" 403 "18. STAFF gọi"

# Kỳ tháng 10 chưa phiếu nào -> trung bình null, không chia cho 0
R=$(goi GET "$AT_HR" "/reports/dashboard?periodId=$KY_10")
mong "$(ma_cua "$R")" 200 "19. kỳ chưa phiếu nào chốt"
RONG=$(than_cua "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f\"{d['soPhieuDaChot']}|{len(d['diemTrungBinhTheoPhong'])}|{sum(d['phanBoXepLoai'].values())}\")" 2>/dev/null)
[ "$RONG" = "0|0|0" ] \
  && pass "    soPhieuDaChot=0, không phòng nào có trung bình, phân bố rỗng" \
  || fail "    kỳ rỗng trả: $RONG"

# Ca 20: phiếu SELF_SCORED chưa chốt KHÔNG được vào phân bố xếp loại.
# Dựng thêm một phiếu ở đúng trạng thái đó rồi so lại các con số.
TRUOC=$(echo "$THAN_DB" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f\"{d['soPhieuDaChot']}|{sum(d['phanBoXepLoai'].values())}\")" 2>/dev/null)
goi PUT "$AT_NV1" "/scorecards/$SC_CHUA_CHAM/self-scores" "$(payload_cham_du "$SC_CHUA_CHAM")" >/dev/null
R=$(goi POST "$AT_NV1" "/scorecards/$SC_CHUA_CHAM/self-submit")
mong "$(ma_cua "$R")" 200 "20. nhân viên nộp phiếu tự chấm (chưa chốt)"
R=$(goi GET "$AT_HR" "/reports/dashboard?periodId=$KY_08")
SAU=$(than_cua "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f\"{d['soPhieuDaChot']}|{sum(d['phanBoXepLoai'].values())}\")" 2>/dev/null)
SO_SELF=$(than_cua "$R" | jq_ "d['theoTrangThai']['SELF_SCORED']")
[ "$SAU" = "$TRUOC" ] \
  && pass "    phiếu SELF_SCORED KHÔNG vào phân bố xếp loại ($TRUOC giữ nguyên)" \
  || fail "    trước $TRUOC, sau khi thêm phiếu tự chấm thành $SAU"
[ "${SO_SELF:-0}" -ge 1 ] \
  && pass "    nhưng VẪN được đếm ở theoTrangThai.SELF_SCORED = $SO_SELF" \
  || fail "    theoTrangThai.SELF_SCORED = $SO_SELF"

# Ca 21: MANAGER chỉ thấy số của phạm vi phòng mình
R=$(goi GET "$AT_KT" "/reports/dashboard?periodId=$KY_08")
mong "$(ma_cua "$R")" 200 "21. MANAGER gọi"
PHONG_KT=$(than_cua "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
ten=sorted(r['departmentName'] for r in d['diemTrungBinhTheoPhong'])
print(','.join(ten) or '(rong)')" 2>/dev/null)
SO_KT=$(than_cua "$R" | jq_ "d['soPhieuTrongKy']")
SO_HR=$(echo "$THAN_DB" | jq_ "d['soPhieuTrongKy']")
{ [ "$PHONG_KT" = "Phòng Kỹ thuật" ] || [ "$PHONG_KT" = "(rong)" ]; } \
  && pass "    chỉ có số của phòng mình: $PHONG_KT" \
  || fail "    thấy: $PHONG_KT"
[ "${SO_KT:-0}" -le "${SO_HR:-0}" ] \
  && pass "    đếm phiếu trong phạm vi ($SO_KT) không vượt toàn công ty ($SO_HR)" \
  || fail "    MANAGER đếm $SO_KT phiếu, HR chỉ đếm $SO_HR"

# Trung bình phải khớp phép tính trực tiếp trong database
TB_DB=$(sql "SELECT round(avg(\"managerTotalScore\"), 2) FROM \"Scorecard\"
  WHERE \"periodId\"='$KY_08' AND \"departmentId\"='$P_KT'
    AND \"resultStatus\" IN ('MANAGER_SCORED','RECEIVED');" | tr -d ' ')
TB_API=$(echo "$THAN_DB" | python3 -c "
import json,sys
r=next((x for x in json.load(sys.stdin)['diemTrungBinhTheoPhong'] if x['departmentId']=='$P_KT'), None)
print(r['diemTrungBinh'] if r else 'KHONG_CO')" 2>/dev/null)
[ "$TB_API" = "$TB_DB" ] \
  && pass "    điểm trung bình khớp phép tính trực tiếp trong DB: $TB_API" \
  || fail "    API trả $TB_API, DB tính ra $TB_DB"

# ================================================= TỔNG KẾT
buoc "TỔNG KẾT"
echo "  PASS: $SO_PASS    FAIL: $SO_FAIL"
[ "$SO_FAIL" -eq 0 ] || exit 1
