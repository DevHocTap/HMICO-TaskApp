#!/usr/bin/env bash
#
# Kiểm chứng module scorecard bằng curl trên hệ thống chạy thật.
#
# Chạy:  ./scripts/verify-scorecard.sh
# Yêu cầu: PostgreSQL đang chạy, đã `npm run build` và `npx prisma db seed`.
#
# Tự khởi động API ở cổng 3191, tự tắt và TỰ DỌN dữ liệu thử khi xong.

set -uo pipefail
cd "$(dirname "$0")/.."

PORT=3191
API="http://localhost:$PORT"
MAT_KHAU="${SEED_PASSWORD:-Hmico@2026}"

TMP=$(mktemp -d)
SO_PASS=0
SO_FAIL=0

pass() { SO_PASS=$((SO_PASS+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { SO_FAIL=$((SO_FAIL+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; }
buoc() { printf '\n\033[1m%s\033[0m\n' "$1"; }

sql() { docker exec kpi-postgres psql -U kpi_dev -d kpi_db -t -A -c "$1" 2>/dev/null; }

don_du_lieu_thu() {
  # Xoá phiếu và kỳ thử. KHÔNG đụng bốn mẫu KPI thật và bốn kỳ của seed.
  docker exec kpi-postgres psql -U kpi_dev -d kpi_db -c "
    DELETE FROM \"ScorecardEvent\" WHERE \"scorecardId\" IN (SELECT id FROM \"Scorecard\");
    DELETE FROM \"ScorecardItem\";
    DELETE FROM \"Scorecard\";
    DELETE FROM \"AuditLog\";
    DELETE FROM \"Period\" WHERE code LIKE 'ZTEST%';
    DELETE FROM \"RefreshToken\" WHERE \"userId\" IN (SELECT id FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%');
    DELETE FROM \"User\" WHERE \"employeeCode\" LIKE 'ZTEST%';
  " >/dev/null 2>&1
}

don_dep() {
  [ -n "${PID_API:-}" ] && kill "$PID_API" 2>/dev/null
  wait 2>/dev/null
  rm -rf "$TMP"
  don_du_lieu_thu
}
trap don_dep EXIT

token_cua() {
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$MAT_KHAU\"}" \
    | python3 -c "import json,sys;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null
}
ma() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
jq_() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)" 2>/dev/null; }

echo "Khởi động API cổng $PORT..."
PORT=$PORT LOGIN_RATE_LIMIT_PER_MINUTE=200 node dist/main.js > "$TMP/api.log" 2>&1 &
PID_API=$!
for _ in $(seq 1 40); do curl -sf -o /dev/null "$API/" 2>/dev/null && break; sleep 0.5; done
if ! curl -sf -o /dev/null "$API/"; then
  echo "Không khởi động được API:"; tail -20 "$TMP/api.log"; exit 1
fi

don_du_lieu_thu

if [ -z "$(token_cua admin@hmico.vn)" ]; then
  echo; echo "Không đăng nhập được bằng tài khoản seed (admin@hmico.vn)."
  echo "Thường do đã đổi mật khẩu qua trình duyệt. Chạy: npx prisma db seed"; exit 1
fi

AT_ADMIN=$(token_cua admin@hmico.vn)
AT_HR=$(token_cua hcns@hmico.vn)
AT_KT=$(token_cua truongphong.kythuat@hmico.vn)
AT_SD=$(token_cua to.shopdrawing@hmico.vn 2>/dev/null)
AT_TT=$(token_cua totruong.shopdrawing@hmico.vn)
AT_RND=$(token_cua truongphong.rnd@hmico.vn)
AT_BGD=$(token_cua giamdoc@hmico.vn)
AT_NV1=$(token_cua sd.nhanvien1@hmico.vn)
AT_NV2=$(token_cua sd.nhanvien2@hmico.vn)

KY_08=$(sql "SELECT id FROM \"Period\" WHERE code='2026-08';")
KY_09=$(sql "SELECT id FROM \"Period\" WHERE code='2026-09';")
P_KTSD=$(sql "SELECT id FROM \"Department\" WHERE code='KT-SD';")
P_RND=$(sql "SELECT id FROM \"Department\" WHERE code='RND';")
P_KT=$(sql "SELECT id FROM \"Department\" WHERE code='KT';")
U_NV1=$(sql "SELECT id FROM \"User\" WHERE email='sd.nhanvien1@hmico.vn';")
U_NV2=$(sql "SELECT id FROM \"User\" WHERE email='sd.nhanvien2@hmico.vn';")
U_KTNV=$(sql "SELECT id FROM \"User\" WHERE email='kt.trienkhai1@hmico.vn';")

# ============================================ 1. SINH PHIẾU
buoc "SINH PHIẾU TỪ MẪU"
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_NV1\",\"periodId\":\"$KY_08\"}" "$API/scorecards")
SC1=$(echo "$KQ" | jq_ "d['id']")
[ -n "$SC1" ] && pass "sinh phiếu cho nhân viên Shop Drawing" || fail "không sinh được: $KQ"

SO_CAP1=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND \"parentId\" IS NULL;")
SO_CON=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND \"parentId\" IS NOT NULL;")
SO_BSC=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND section='BSC_WORK' AND \"parentId\" IS NULL;")
SO_CPL=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND section='COMPLIANCE';")
[ "$SO_BSC" = "6" ] && pass "Mục 1 có đủ 6 tiêu chí (mẫu Shop Drawing)" || fail "Mục 1 có $SO_BSC tiêu chí"
[ "$SO_CPL" = "3" ] && pass "Mục 2 có đủ 3 tiêu chí (mẫu hệ thống đã ghép)" || fail "Mục 2 có $SO_CPL"
[ "$SO_CON" = "31" ] && pass "chép đủ 31 KPI con" || fail "có $SO_CON KPI con (mong đợi 31)"

TONG=$(sql "SELECT sum(weight) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND \"parentId\" IS NULL;")
[ "$TONG" = "100.00" ] && pass "tổng trọng số cấp 1 đúng 100 (70 + 30)" || fail "tổng = $TONG"

LOI_CON=$(sql "SELECT count(*) FROM (SELECT p.id, sum(c.weight) s FROM \"ScorecardItem\" p JOIN \"ScorecardItem\" c ON c.\"parentId\"=p.id WHERE p.\"scorecardId\"='$SC1' GROUP BY p.id) x WHERE s<>100;")
[ "$LOI_CON" = "0" ] && pass "mọi nhóm KPI con đều đúng 100" || fail "$LOI_CON nhóm sai"

SNAP=$(sql "SELECT \"jobTitleName\" || '|' || \"departmentName\" || '|' || COALESCE(\"evaluatorId\",'') FROM \"Scorecard\" WHERE id='$SC1';")
echo "$SNAP" | grep -q "Nhân viên Shop Drawing|Tổ Shop Drawing|" && pass "chụp đúng chức danh, phòng ban, người chấm" || fail "snapshot: $SNAP"

MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_NV1\",\"periodId\":\"$KY_08\"}" "$API/scorecards")
[ "$MA" = "409" ] && pass "sinh lần hai cùng người cùng kỳ -> 409" || fail "trùng phiếu -> $MA (mong đợi 409)"

# ============================================ 2. SNAPSHOT
buoc "SNAPSHOT — sửa mẫu KHÔNG làm đổi phiếu đã lập"
TEN_TRUOC=$(sql "SELECT name FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND \"parentId\" IS NULL AND section='BSC_WORK' ORDER BY \"displayOrder\" LIMIT 1;")
sql "UPDATE \"KpiTemplateItem\" SET name='ĐÃ BỊ SỬA SAU KHI LẬP PHIẾU' WHERE id=(SELECT \"templateItemId\" FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND \"parentId\" IS NULL AND section='BSC_WORK' ORDER BY \"displayOrder\" LIMIT 1);" >/dev/null
TEN_SAU=$(sql "SELECT name FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND \"parentId\" IS NULL AND section='BSC_WORK' ORDER BY \"displayOrder\" LIMIT 1;")
[ "$TEN_TRUOC" = "$TEN_SAU" ] && pass "sửa mẫu xong, nội dung phiếu KHÔNG đổi" || fail "phiếu đổi theo mẫu: '$TEN_TRUOC' -> '$TEN_SAU'"
sql "UPDATE \"KpiTemplateItem\" SET name='$TEN_TRUOC' WHERE name='ĐÃ BỊ SỬA SAU KHI LẬP PHIẾU';" >/dev/null

# ============================================ 3. HÀNG LOẠT
buoc "SINH HÀNG LOẠT"
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"departmentId\":\"$P_KTSD\",\"periodId\":\"$KY_08\"}" "$API/scorecards/batch")
TAO=$(echo "$KQ" | jq_ "d['created']"); BQ=$(echo "$KQ" | jq_ "d['skipped']")
# Tổ Shop Drawing có 3 người: 1 đã có phiếu, 1 mang chức danh "Tổ trưởng"
# chưa có mẫu xuất bản, còn 1 tạo được.
[ "$TAO" = "1" ] && pass "tạo 1 phiếu cho người đủ điều kiện" || fail "created=$TAO (mong đợi 1)"
[ "$BQ" = "2" ] && pass "bỏ qua 2 người, không làm hỏng cả lô" || fail "skipped=$BQ (mong đợi 2)"
echo "$KQ" | grep -q "Đã có phiếu" && pass "nêu lý do: đã có phiếu" || fail "không nêu: $KQ"
# Tổ trưởng bị chặn vì tự chấm chính mình — lý do này bắt TRƯỚC cả việc tra
# mẫu KPI, vì nó là vấn đề căn bản hơn.
# Tổ trưởng: chức danh quản lý không có mẫu KPI — dùng đường sinh phiếu rỗng
echo "$KQ" | grep -q "chưa có mẫu KPI" && pass "nêu lý do: chức danh quản lý chưa có mẫu" || fail "không nêu: $KQ"
echo "$KQ" | grep -q "sinh phiếu rỗng" && pass "gợi ý đúng hướng xử lý" || fail "không gợi ý: $KQ"

buoc "PHÒNG CHƯA CÓ TRƯỞNG BỘ PHẬN / NGƯỜI THIẾU CHỨC DANH"
P_MKT=$(sql "SELECT id FROM \"Department\" WHERE code='MKT';")
sql "INSERT INTO \"User\" (id,\"employeeCode\",email,\"fullName\",\"passwordHash\",role,\"departmentId\",\"isActive\",\"mustChangePassword\",\"createdAt\",\"updatedAt\") VALUES (gen_random_uuid(),'ZTESTNV','ztestnv@hmico.vn','Nhân viên thử',(SELECT \"passwordHash\" FROM \"User\" LIMIT 1),'STAFF','$P_MKT',true,true,now(),now());" >/dev/null
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"departmentId\":\"$P_MKT\",\"periodId\":\"$KY_08\"}" "$API/scorecards/batch")
echo "$KQ" | grep -q "chưa có trưởng bộ phận" && pass "nêu thiếu trưởng bộ phận, kèm tên phòng" \
  || fail "không nêu thiếu trưởng bộ phận: $KQ"
echo "$KQ" | grep -q "Chưa được gán chức danh" && pass "nêu HẾT lý do cùng lúc, không dừng ở lý do đầu" \
  || fail "chỉ nêu một lý do: $KQ"
echo "$KQ" | jq_ "d['created']" | grep -q '^0$' && pass "không tạo phiếu nào cho phòng chưa sẵn sàng" || fail "vẫn tạo phiếu"

buoc "ENDPOINT KIỂM TRA SẴN SÀNG"
KQ=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/scorecards/readiness?departmentId=$P_MKT")
echo "$KQ" | jq_ "d['ready']" | grep -qi false && pass "báo phòng MKT chưa sẵn sàng" || fail "ready sai: $KQ"
echo "$KQ" | jq_ "d['missingDepartmentManager']" | grep -qi true && pass "chỉ đúng: thiếu trưởng bộ phận" || fail "$KQ"
echo "$KQ" | grep -q "Nhân viên thử" && pass "liệt kê đúng người thiếu chức danh" || fail "không liệt kê người thiếu chức danh"
KQ=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/scorecards/readiness?departmentId=$P_KTSD")
# Tổ Shop Drawing có trưởng bộ phận và ai cũng có chức danh, NHƯNG chức danh
# "Tổ trưởng" chưa có mẫu KPI nào xuất bản — đây là thiếu sót thật của dữ
# liệu seed, và endpoint phải chỉ ra được.
echo "$KQ" | jq_ "d['missingDepartmentManager']" | grep -qi false && pass "tổ Shop Drawing: đã có trưởng bộ phận" || fail "$KQ"
echo "$KQ" | jq_ "d['employeesWithoutJobTitle']" | grep -q '^\[\]$' && pass "tổ Shop Drawing: ai cũng có chức danh" || fail "$KQ"
echo "$KQ" | grep -q "Tổ trưởng" && pass "chỉ ra chức danh 'Tổ trưởng' chưa có mẫu xuất bản" || fail "$KQ"

buoc "CHỈ ĐỊNH NGƯỜI CHẤM THỦ CÔNG (đường thoát)"
U_ADMIN=$(sql "SELECT id FROM \"User\" WHERE email='admin@hmico.vn';")
U_ZTEST=$(sql "SELECT id FROM \"User\" WHERE \"employeeCode\"='ZTESTNV';")
sql "UPDATE \"User\" SET \"jobTitleId\"=(SELECT id FROM \"JobTitle\" WHERE code='KT-KSTK') WHERE \"employeeCode\"='ZTESTNV';" >/dev/null
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_ZTEST\",\"periodId\":\"$KY_08\",\"evaluatorId\":\"$U_ADMIN\"}" "$API/scorecards")
[ "$MA" = "201" ] && pass "ADMIN chỉ định người chấm thủ công -> tạo được phiếu" || fail "-> $MA (mong đợi 201)"

# ============================================ 4. KÝ NHẬN
buoc "CHẶN TỰ CHẤM CHÍNH MÌNH"
# Trưởng bộ phận nay do BAN GIÁM ĐỐC chấm nên không còn tự chấm nữa.
# Tự chấm chỉ xảy ra khi ai đó CHỈ ĐỊNH TAY chính người nhận làm người chấm.
# Dùng nhân viên phòng Kỹ thuật: U_NV2 là dữ liệu mà test sao chép phía sau cần
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_KTNV\",\"periodId\":\"$KY_08\",\"evaluatorId\":\"$U_KTNV\"}" "$API/scorecards")
echo "$KQ" | grep -q "tự chấm chính mình" && pass "chỉ định chính người nhận làm người chấm -> bị chặn" \
  || fail "không chặn tự chấm: $KQ"

MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_KTNV\",\"periodId\":\"$KY_08\",\"evaluatorId\":\"$U_ADMIN\"}" "$API/scorecards")
[ "$MA" = "201" ] && pass "chỉ định người chấm khác cho nhân viên thường -> 201" || fail "-> $MA"
sql "DELETE FROM \"ScorecardEvent\" WHERE \"scorecardId\" IN (SELECT id FROM \"Scorecard\" WHERE \"ownerUserId\"='$U_KTNV');" >/dev/null
sql "DELETE FROM \"ScorecardItem\" WHERE \"scorecardId\" IN (SELECT id FROM \"Scorecard\" WHERE \"ownerUserId\"='$U_KTNV');" >/dev/null
sql "DELETE FROM \"Scorecard\" WHERE \"ownerUserId\"='$U_KTNV';" >/dev/null

# Trưởng bộ phận: chỉ BAN GIÁM ĐỐC mới chấm được
U_TT2=$(sql "SELECT id FROM \"User\" WHERE email='totruong.shopdrawing@hmico.vn';")
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_TT2\",\"periodId\":\"$KY_08\",\"emptyTemplate\":true,\"evaluatorId\":\"$U_ADMIN\"}" "$API/scorecards")
echo "$KQ" | grep -q "chỉ ban giám đốc mới chấm được" \
  && pass "gán người chấm không thuộc BGĐ cho trưởng bộ phận -> bị chặn" || fail "$KQ"

buoc "TRƯỞNG BỘ PHẬN: BAN GIÁM ĐỐC CHẤM"
U_TP_KT=$(sql "SELECT id FROM \"User\" WHERE email='truongphong.kythuat@hmico.vn';")
U_BGD=$(sql "SELECT id FROM \"User\" WHERE email='giamdoc@hmico.vn';")

# Chức danh "Trưởng phòng" không có mẫu -> phải nêu HẾT lý do cùng lúc
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_TP_KT\",\"periodId\":\"$KY_08\"}" "$API/scorecards")
echo "$KQ" | grep -q "chưa có mẫu KPI" && pass "nêu lý do: chức danh chưa có mẫu" || fail "$KQ"
echo "$KQ" | grep -q "sinh phiếu rỗng" && pass "gợi ý đường sinh phiếu rỗng cho trưởng bộ phận" || fail "$KQ"

# Sinh phiếu rỗng
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_TP_KT\",\"periodId\":\"$KY_08\",\"emptyTemplate\":true}" "$API/scorecards")
SC_TP=$(echo "$KQ" | jq_ "d['id']")
[ -n "$SC_TP" ] && pass "sinh phiếu rỗng cho trưởng phòng -> tạo được" || fail "$KQ"
SO_M1=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC_TP' AND section='BSC_WORK';")
SO_M2=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC_TP' AND section='COMPLIANCE';")
[ "$SO_M1" = "0" ] && pass "Mục 1 để trống chờ nhập" || fail "Mục 1 có $SO_M1 dòng"
[ "$SO_M2" = "3" ] && pass "Mục 2 dựng sẵn đủ 3 tiêu chí (30)" || fail "Mục 2 có $SO_M2 dòng"
EV=$(sql "SELECT \"evaluatorId\" FROM \"Scorecard\" WHERE id='$SC_TP';")
[ "$EV" = "$U_BGD" ] && pass "người chấm tự gán là ban giám đốc (công ty có đúng 1)" || fail "evaluatorId=$EV"

# Phiếu rỗng KHÔNG gửi ký được cho tới khi Mục 1 đủ 70 — hành vi đúng
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' -d '{}' "$API/scorecards/$SC_TP/propose")
echo "$KQ" | grep -qE "BSC công việc|trọng số" && pass "phiếu rỗng chưa gửi ký được, nêu thiếu Mục 1" || fail "$KQ"

buoc "QUYỀN BAN GIÁM ĐỐC — HAI CHIỀU"
# Chiều thuận: BGĐ nhập KPI cho trưởng bộ phận
cat > "$TMP/m1.json" <<'JSONEOF'
{"items":[
 {"key":"m2a","parentKey":null,"name":"Số lần đi trễ/ về sớm không phép","section":"COMPLIANCE","weight":10,"displayOrder":1},
 {"key":"m2b","parentKey":null,"name":"Vi phạm bộ phận chưa xử lý kịp thời","section":"COMPLIANCE","weight":10,"displayOrder":2},
 {"key":"m2c","parentKey":null,"name":"Giữ gìn văn hoá doanh nghiệp","section":"COMPLIANCE","weight":10,"displayOrder":3},
 {"key":"a","parentKey":null,"name":"Hoàn thành mục tiêu phòng","section":"BSC_WORK","weight":40,"displayOrder":1},
 {"key":"b","parentKey":null,"name":"Quản lý nhân sự phòng","section":"BSC_WORK","weight":30,"displayOrder":2}]}
JSONEOF
MA=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $AT_BGD" \
  -H 'Content-Type: application/json' --data-binary "@$TMP/m1.json" "$API/scorecards/$SC_TP/items")
[ "$MA" = "200" ] && pass "BGĐ nhập KPI vào phiếu trưởng bộ phận -> 200" || fail "-> $MA"
MA=$(ma -X POST -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' -d '{}' "$API/scorecards/$SC_TP/propose")
[ "$MA" = "200" ] && pass "BGĐ gửi phiếu trưởng bộ phận đi ký -> 200" || fail "-> $MA"

# Chiều nghịch: phiếu nhân viên thường thì BGĐ chỉ được xem
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' -d '{}' "$API/scorecards/$SC1/propose")
echo "$KQ" | grep -q "chỉ thao tác được trên phiếu của trưởng bộ phận" \
  && pass "BGĐ thao tác trên phiếu nhân viên thường -> 403, nêu rõ lý do" || fail "$KQ"
MA=$(ma -X PUT -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' \
  --data-binary "@$TMP/m1.json" "$API/scorecards/$SC1/items")
[ "$MA" = "403" ] && pass "BGĐ sửa item phiếu nhân viên thường -> 403" || fail "-> $MA"

# Chính chủ vẫn là người ký
MA=$(ma -X POST -H "Authorization: Bearer $AT_BGD" "$API/scorecards/$SC_TP/accept")
[ "$MA" = "403" ] && pass "BGĐ KHÔNG ký thay trưởng bộ phận -> 403" || fail "-> $MA"
MA=$(ma -X POST -H "Authorization: Bearer $AT_KT" "$API/scorecards/$SC_TP/accept")
[ "$MA" = "200" ] && pass "trưởng bộ phận tự ký phiếu của mình -> 200" || fail "-> $MA"

buoc "PENDING-MY-ACTION CHO BAN GIÁM ĐỐC"
KQ=$(curl -s -H "Authorization: Bearer $AT_BGD" "$API/scorecards/pending-my-action")
echo "$KQ" | grep -q "BGD_CHUA_GIAO_KPI" && pass "BGĐ thấy trưởng bộ phận chưa có phiếu" || fail "$KQ"

buoc "READINESS TOÀN CÔNG TY"
KQ=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/scorecards/readiness/company")
echo "$KQ" | grep -q "departmentsWithoutManager" && pass "có danh sách phòng chưa có trưởng" || fail "$KQ"
echo "$KQ" | grep -q "employeesWithoutJobTitle" && pass "có danh sách người chưa có chức danh" || fail "$KQ"
echo "$KQ" | grep -q '"isManagerRole":true' && pass "đánh dấu chức danh quản lý (thiếu mẫu là bình thường)" || fail "$KQ"
echo "$KQ" | grep -q '"executiveAutoAssignable":true' && pass "báo có đúng 1 BGĐ nên tự gán được" || fail "$KQ"
# Tách phòng chặn thật khỏi đơn vị tổ chức rỗng người
echo "$KQ" | grep -q "emptyOrgUnits" && pass "tách riêng đơn vị chưa có nhân sự" || fail "$KQ"
echo "$KQ" | grep -q "blockedEmployees" && pass "nêu đích danh người bị chặn" || fail "$KQ"
# Đối chiếu với database thay vì số cứng: script tự tạo người thử nên số
# phòng "chặn thật" đổi theo tiến trình chạy.
SO_CHAN=$(echo "$KQ" | jq_ "len(d['departmentsWithoutManager'])")
SO_RONG=$(echo "$KQ" | jq_ "len(d['emptyOrgUnits'])")
DB_CHAN=$(sql "SELECT count(*) FROM \"Department\" d WHERE d.\"managerId\" IS NULL AND d.\"isActive\" AND EXISTS (SELECT 1 FROM \"User\" u WHERE u.\"departmentId\"=d.id AND u.\"isActive\");")
DB_RONG=$(sql "SELECT count(*) FROM \"Department\" d WHERE d.\"managerId\" IS NULL AND d.\"isActive\" AND NOT EXISTS (SELECT 1 FROM \"User\" u WHERE u.\"departmentId\"=d.id AND u.\"isActive\");")
[ "$SO_CHAN" = "$DB_CHAN" ] && pass "phòng chặn thật khớp database ($SO_CHAN phòng có nhân sự, thiếu trưởng)" \
  || fail "API báo $SO_CHAN, database có $DB_CHAN"
[ "$SO_RONG" = "$DB_RONG" ] && pass "đơn vị rỗng người khớp database ($SO_RONG đơn vị)" \
  || fail "API báo $SO_RONG, database có $DB_RONG"
echo "$KQ" | grep -q '"code":"HCNS"' && pass "Phòng HCNS nằm trong danh sách chặn thật" || fail "thiếu HCNS"
CHAN_CO_NGUOI=$(echo "$KQ" | jq_ "all(p['headcount']>0 for p in d['departmentsWithoutManager'])")
[ "$CHAN_CO_NGUOI" = "True" ] && pass "mọi phòng trong danh sách chặn đều thật sự có người" || fail "có phòng rỗng lọt vào"
MA=$(ma -H "Authorization: Bearer $AT_RND" "$API/scorecards/readiness/company")
[ "$MA" = "403" ] && pass "MANAGER không xem được readiness toàn công ty -> 403" || fail "-> $MA"

# Dọn phiếu trưởng phòng để không ảnh hưởng phần sau
sql "DELETE FROM \"ScorecardEvent\" WHERE \"scorecardId\"='$SC_TP';" >/dev/null
sql "DELETE FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC_TP';" >/dev/null
sql "DELETE FROM \"Scorecard\" WHERE id='$SC_TP';" >/dev/null

buoc "LUỒNG KÝ NHẬN"
MA=$(ma -X POST -H "Authorization: Bearer $AT_TT" -H 'Content-Type: application/json' -d '{}' "$API/scorecards/$SC1/propose")
[ "$MA" = "200" ] && pass "trưởng bộ phận gửi phiếu đi ký -> 200" || fail "propose -> $MA"
TT=$(sql "SELECT \"assignStatus\" FROM \"Scorecard\" WHERE id='$SC1';")
[ "$TT" = "PROPOSED" ] && pass "trạng thái PROPOSED" || fail "status=$TT"

MA=$(ma -X POST -H "Authorization: Bearer $AT_NV2" "$API/scorecards/$SC1/accept")
[ "$MA" = "403" ] && pass "nhân viên khác ký hộ -> 403" || fail "ký hộ -> $MA (mong đợi 403)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_TT" "$API/scorecards/$SC1/accept")
[ "$MA" = "403" ] && pass "trưởng phòng ký thay nhân viên -> 403" || fail "trưởng phòng ký thay -> $MA"

MA=$(ma -X POST -H "Authorization: Bearer $AT_NV1" -H 'Content-Type: application/json' -d '{"reason":"abc"}' "$API/scorecards/$SC1/dispute")
[ "$MA" = "400" ] && pass "nêu ý kiến lý do quá ngắn -> 400" || fail "-> $MA (mong đợi 400)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_NV1" -H 'Content-Type: application/json' -d '{}' "$API/scorecards/$SC1/dispute")
[ "$MA" = "400" ] && pass "nêu ý kiến không có lý do -> 400" || fail "-> $MA (mong đợi 400)"

MA=$(ma -X POST -H "Authorization: Bearer $AT_NV1" -H 'Content-Type: application/json' \
  -d '{"reason":"Chỉ tiêu tiến độ quá cao so với khối lượng thực tế"}' "$API/scorecards/$SC1/dispute")
[ "$MA" = "200" ] && pass "nhân viên nêu ý kiến -> 200" || fail "dispute -> $MA"
TT=$(sql "SELECT \"assignStatus\" FROM \"Scorecard\" WHERE id='$SC1';")
[ "$TT" = "DISPUTED" ] && pass "trạng thái DISPUTED" || fail "status=$TT"

buoc "DISPUTED KHÔNG PHẢI NGÕ CỤT"
MA=$(ma -X POST -H "Authorization: Bearer $AT_TT" -H 'Content-Type: application/json' -d '{}' "$API/scorecards/$SC1/propose")
[ "$MA" = "400" ] && pass "gửi lại từ DISPUTED mà không ghi chú -> 400" || fail "-> $MA (mong đợi 400)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_TT" -H 'Content-Type: application/json' \
  -d '{"note":"Đã trao đổi trực tiếp, hai bên thống nhất giữ nguyên KPI"}' "$API/scorecards/$SC1/propose")
[ "$MA" = "200" ] && pass "gửi lại nguyên trạng kèm ghi chú -> 200" || fail "-> $MA"
SO=$(sql "SELECT count(*) FROM \"ScorecardEvent\" WHERE \"scorecardId\"='$SC1' AND action='RE_PROPOSED_UNCHANGED';")
[ "$SO" = "1" ] && pass "ghi ScorecardEvent kiểu RE_PROPOSED_UNCHANGED" || fail "có $SO bản ghi"

MA=$(ma -X POST -H "Authorization: Bearer $AT_NV1" "$API/scorecards/$SC1/accept")
[ "$MA" = "200" ] && pass "chính chủ ký nhận -> 200" || fail "accept -> $MA"
TT=$(sql "SELECT \"assignStatus\" FROM \"Scorecard\" WHERE id='$SC1';")
[ "$TT" = "ACCEPTED" ] && pass "trạng thái ACCEPTED" || fail "status=$TT"

buoc "SCORECARDEVENT LÀ NGUỒN SỰ THẬT"
SO=$(sql "SELECT count(*) FROM \"ScorecardEvent\" WHERE \"scorecardId\"='$SC1';")
[ "$SO" -ge 5 ] && pass "lịch sử đủ $SO sự kiện (CREATE, PROPOSE, DISPUTE, RE_PROPOSED, ACCEPT)" || fail "chỉ có $SO"
LY_DO=$(sql "SELECT comment FROM \"ScorecardEvent\" WHERE \"scorecardId\"='$SC1' AND action='DISPUTE';")
echo "$LY_DO" | grep -q "quá cao" && pass "lý do phản đối còn nguyên trong lịch sử sau khi đã ký lại" || fail "mất lý do"
CACHE=$(sql "SELECT \"disputeReason\" FROM \"Scorecard\" WHERE id='$SC1';")
echo "$CACHE" | grep -q "quá cao" && pass "cột cache disputeReason khớp sự kiện" || fail "cache lệch: $CACHE"

buoc "PUT /items — THÊM, SỬA, XOÁ DÒNG"
# Dựng lại cả cây từ dữ liệu hiện có, thêm một tiêu chí mới
python3 - "$SC1" > "$TMP/cay.json" <<'PYEOF'
import json, subprocess, sys
sc = sys.argv[1]
raw = subprocess.run(['docker','exec','kpi-postgres','psql','-U','kpi_dev','-d','kpi_db','-t','-A','-F','\t','-c',
  f'SELECT id, COALESCE("parentId",\'\'), name, section, weight, "displayOrder", COALESCE("templateItemId",\'\') '
  f'FROM "ScorecardItem" WHERE "scorecardId"=\'{sc}\' ORDER BY section, "displayOrder"'],
  capture_output=True, text=True).stdout.strip().split('\n')
items=[]
for line in raw:
    if not line.strip(): continue
    i,p,n,sec,w,o,t = line.split('\t')
    items.append({'key':i,'parentKey':p or None,'name':n,'section':sec,
                  'weight':float(w),'displayOrder':int(o),
                  'templateItemId': t or None})
# Bớt 10 khỏi tiêu chí BSC đầu tiên, thêm một tiêu chí mới trọng số 10
for it in items:
    if it['parentKey'] is None and it['section']=='BSC_WORK':
        it['weight'] = round(it['weight']-10, 2); break
items.append({'key':'moi-1','parentKey':None,'name':'Tiêu chí thêm tay',
              'section':'BSC_WORK','weight':10,'displayOrder':99,'templateItemId':None})
print(json.dumps({'items':items}, ensure_ascii=False))
PYEOF
SO_TRUOC=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1';")
MA=$(curl -s -o /dev/null -w '%{http_code}' -X PUT -H "Authorization: Bearer $AT_TT" \
  -H 'Content-Type: application/json' --data-binary "@$TMP/cay.json" "$API/scorecards/$SC1/items")
[ "$MA" = "200" ] && pass "lưu cả cây, THÊM một tiêu chí mới -> 200" || fail "-> $MA"
SO_SAU=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1';")
[ "$SO_SAU" = "$((SO_TRUOC+1))" ] && pass "số dòng tăng đúng 1 ($SO_TRUOC -> $SO_SAU)" || fail "$SO_TRUOC -> $SO_SAU"
sql "SELECT name FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND name='Tiêu chí thêm tay';" | grep -q "thêm tay" \
  && pass "tiêu chí mới có trong phiếu" || fail "không thấy tiêu chí mới"
TONG=$(sql "SELECT sum(weight) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND \"parentId\" IS NULL;")
[ "$TONG" = "100.00" ] && pass "tổng vẫn đúng 100 sau khi thêm dòng" || fail "tổng = $TONG"
CON=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND \"parentId\" IS NOT NULL;")
[ "$CON" = "31" ] && pass "quan hệ cha con giữ nguyên 31 KPI con" || fail "còn $CON KPI con"
SNAP=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1' AND \"templateItemId\" IS NOT NULL;")
[ "$SNAP" = "$SO_TRUOC" ] && pass "giữ nguyên nguồn gốc mẫu cho $SNAP dòng cũ" || fail "chỉ còn $SNAP dòng có templateItemId"
TT=$(sql "SELECT \"assignStatus\" FROM \"Scorecard\" WHERE id='$SC1';")
[ "$TT" = "DRAFT" ] && pass "phiếu đã ký tự quay về DRAFT sau khi sửa" || fail "status=$TT"
SO=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityId\"='$SC1' AND action='UPDATE_ITEMS';")
[ "$SO" -ge 1 ] && pass "có AuditLog UPDATE_ITEMS" || fail "có $SO bản ghi"

buoc "PUT /items — TỪ CHỐI CÂY SAI"
KQ=$(curl -s -X PUT -H "Authorization: Bearer $AT_TT" -H 'Content-Type: application/json' \
  -d '{"items":[{"key":"a","parentKey":null,"name":"A","section":"BSC_WORK","weight":60,"displayOrder":1}]}' \
  "$API/scorecards/$SC1/items")
echo "$KQ" | grep -q "60" && pass "trọng số lệch -> từ chối, nêu con số" || fail "không chặn: $KQ"
KQ=$(curl -s -X PUT -H "Authorization: Bearer $AT_TT" -H 'Content-Type: application/json' \
  -d '{"items":[{"key":"a","parentKey":null,"name":"A","section":"BSC_WORK","weight":70,"displayOrder":1},{"key":"b","parentKey":"a","name":"B","section":"BSC_WORK","weight":100,"displayOrder":1},{"key":"c","parentKey":"b","name":"C","section":"BSC_WORK","weight":100,"displayOrder":1}]}' \
  "$API/scorecards/$SC1/items")
echo "$KQ" | grep -q "hai cấp" && pass "cây ba cấp -> từ chối" || fail "không chặn cấp 3: $KQ"
SO_GIU=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC1';")
[ "$SO_GIU" = "$SO_SAU" ] && pass "lưu thất bại thì phiếu giữ nguyên $SO_GIU dòng" || fail "còn $SO_GIU dòng"

# ============================================ 5. SAO CHÉP
buoc "SAO CHÉP TỪ KỲ TRƯỚC"
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"departmentId\":\"$P_KTSD\",\"sourcePeriodId\":\"$KY_08\",\"targetPeriodId\":\"$KY_09\"}" \
  "$API/scorecards/copy-from-period")
CHEP=$(echo "$KQ" | jq_ "d['created']")
# Kỳ 08 của tổ Shop Drawing có 2 phiếu (người thứ ba mang chức danh
# "Tổ trưởng" chưa có mẫu xuất bản nên chưa từng được lập phiếu).
SO_NGUON=$(sql "SELECT count(*) FROM \"Scorecard\" WHERE \"periodId\"='$KY_08' AND \"departmentId\"='$P_KTSD';")
[ "$CHEP" = "$SO_NGUON" ] && pass "chép đủ $CHEP phiếu, đúng bằng số phiếu ở kỳ nguồn" \
  || fail "chép $CHEP phiếu nhưng kỳ nguồn có $SO_NGUON"
TT=$(sql "SELECT DISTINCT \"assignStatus\" FROM \"Scorecard\" WHERE \"periodId\"='$KY_09';")
[ "$TT" = "DRAFT" ] && pass "phiếu mới đều ở DRAFT" || fail "status=$TT"
SO=$(sql "SELECT count(*) FROM \"Scorecard\" WHERE \"periodId\"='$KY_09' AND (\"acceptedAt\" IS NOT NULL OR \"proposedAt\" IS NOT NULL OR \"disputeReason\" IS NOT NULL);")
[ "$SO" = "0" ] && pass "không mang theo dấu vết duyệt của kỳ cũ" || fail "$SO phiếu còn dấu vết"
SO=$(sql "SELECT count(*) FROM \"ScorecardItem\" i JOIN \"Scorecard\" s ON s.id=i.\"scorecardId\" WHERE s.\"periodId\"='$KY_09' AND (i.\"selfScore\" IS NOT NULL OR i.\"managerScore\" IS NOT NULL);")
[ "$SO" = "0" ] && pass "không mang theo điểm số của kỳ cũ" || fail "$SO dòng còn điểm"
SO_NGUON_ITEM=$(sql "SELECT count(*) FROM \"ScorecardItem\" i JOIN \"Scorecard\" s ON s.id=i.\"scorecardId\" WHERE s.\"periodId\"='$KY_08' AND s.\"ownerUserId\"='$U_NV1';")
SO_ITEM=$(sql "SELECT count(*) FROM \"ScorecardItem\" i JOIN \"Scorecard\" s ON s.id=i.\"scorecardId\" WHERE s.\"periodId\"='$KY_09' AND s.\"ownerUserId\"='$U_NV1';")
[ "$SO_ITEM" = "$SO_NGUON_ITEM" ] && pass "chép nguyên $SO_ITEM dòng, đúng bằng phiếu nguồn" || fail "nguồn $SO_NGUON_ITEM dòng, chép ra $SO_ITEM dòng"

KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"departmentId\":\"$P_KTSD\",\"sourcePeriodId\":\"$KY_08\",\"targetPeriodId\":\"$KY_09\"}" \
  "$API/scorecards/copy-from-period")
echo "$KQ" | jq_ "d['created']" | grep -q '^0$' && pass "chép lần hai: bỏ qua hết, không lỗi" || fail "$KQ"
echo "$KQ" | grep -q "Đã có phiếu" && pass "nêu lý do bỏ qua" || fail "không nêu lý do"

buoc "SAO CHÉP BỎ QUA NGƯỜI ĐÃ NGHỈ VIỆC"
sql "UPDATE \"Scorecard\" SET \"periodId\"='$KY_08' WHERE false;" >/dev/null
sql "DELETE FROM \"ScorecardEvent\" WHERE \"scorecardId\" IN (SELECT id FROM \"Scorecard\" WHERE \"periodId\"='$KY_09');" >/dev/null
sql "DELETE FROM \"ScorecardItem\" WHERE \"scorecardId\" IN (SELECT id FROM \"Scorecard\" WHERE \"periodId\"='$KY_09');" >/dev/null
sql "DELETE FROM \"Scorecard\" WHERE \"periodId\"='$KY_09';" >/dev/null
sql "UPDATE \"User\" SET \"isActive\"=false WHERE id='$U_NV2';" >/dev/null
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"departmentId\":\"$P_KTSD\",\"sourcePeriodId\":\"$KY_08\",\"targetPeriodId\":\"$KY_09\"}" \
  "$API/scorecards/copy-from-period")
echo "$KQ" | grep -q "Đã nghỉ việc" && pass "bỏ qua người isActive = false, nêu rõ lý do" || fail "$KQ"
sql "UPDATE \"User\" SET \"isActive\"=true WHERE id='$U_NV2';" >/dev/null

# ============================================ 6. PHÂN QUYỀN VÀ KHOÁ KỲ
buoc "PHÂN QUYỀN"
MA=$(ma -X POST -H "Authorization: Bearer $AT_RND" -H 'Content-Type: application/json' \
  -d "{\"departmentId\":\"$P_KTSD\",\"periodId\":\"$KY_08\"}" "$API/scorecards/batch")
[ "$MA" = "403" ] && pass "MANAGER R&D thao tác trên phòng Kỹ thuật -> 403" || fail "-> $MA (mong đợi 403)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_RND" -H 'Content-Type: application/json' -d '{}' "$API/scorecards/$SC1/propose")
[ "$MA" = "403" ] && pass "MANAGER R&D gửi phiếu phòng khác -> 403" || fail "-> $MA (mong đợi 403)"
SO=$(curl -s -H "Authorization: Bearer $AT_NV1" "$API/scorecards?periodId=$KY_08&limit=100" | jq_ "d['total']")
[ "$SO" = "1" ] && pass "STAFF chỉ thấy phiếu của chính mình trong kỳ" || fail "STAFF thấy $SO phiếu"
KHAC=$(curl -s -H "Authorization: Bearer $AT_NV1" "$API/scorecards?periodId=$KY_08&limit=100" | jq_ "d['data'][0]['ownerUserId']")
[ "$KHAC" = "$U_NV1" ] && pass "và đúng là phiếu của chính họ" || fail "thấy phiếu của người khác"

buoc "KHOÁ KỲ"
sql "UPDATE \"Period\" SET \"isLocked\"=true WHERE id='$KY_08';" >/dev/null
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_KTNV\",\"periodId\":\"$KY_08\"}" "$API/scorecards")
[ "$MA" = "400" ] && pass "sinh phiếu khi kỳ đã khoá -> 400" || fail "-> $MA (mong đợi 400)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_TT" -H 'Content-Type: application/json' -d '{}' "$API/scorecards/$SC1/propose")
[ "$MA" = "400" ] && pass "gửi ký khi kỳ đã khoá -> 400" || fail "-> $MA (mong đợi 400)"
sql "UPDATE \"Period\" SET \"isLocked\"=false WHERE id='$KY_08';" >/dev/null

buoc "AUDITLOG CHO MỌI THAO TÁC"
for A in CREATE PROPOSE DISPUTE RE_PROPOSED_UNCHANGED ACCEPT UPDATE_ITEMS; do
  SO=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE action='$A' AND \"entityType\"='Scorecard';")
  [ "$SO" -ge 1 ] && pass "có AuditLog cho $A" || fail "thiếu AuditLog cho $A"
done

buoc "PENDING-MY-ACTION"
# Đưa phiếu về PROPOSED để có việc thật mà kiểm
curl -s -o /dev/null -X POST -H "Authorization: Bearer $AT_TT" -H 'Content-Type: application/json' \
  -d '{}' "$API/scorecards/$SC1/propose"
KQ=$(curl -s -H "Authorization: Bearer $AT_NV1" "$API/scorecards/pending-my-action")
echo "$KQ" | grep -q "CHO_KY_NHAN" && pass "nhân viên thấy việc chờ ký nhận" || fail "$KQ"
echo "$KQ" | grep -q '"type"' && pass "trả mảng việc có kiểu {type,message,count,link,daysUntilDeadline,isOverdue}" || fail "$KQ"
echo "$KQ" | grep -q '"daysUntilDeadline"' && pass "có trường daysUntilDeadline" || fail "thiếu daysUntilDeadline"
echo "$KQ" | grep -q '"isOverdue"' && pass "có trường isOverdue tách riêng" || fail "thiếu isOverdue"
# Việc ĐẦU KỲ không có hạn — hạn ngày 02 là hạn nộp KẾT QUẢ cuối kỳ.
# Xem hằng KHONG_CO_HAN trong scorecard-query.service.ts và Câu 0c ở no-ky-thuat.md.
echo "$KQ" | grep -q '"daysUntilDeadline": *null' && pass "việc đầu kỳ KHÔNG bịa hạn (null)" || fail "gắn hạn cho việc đầu kỳ: $KQ"
echo "$KQ" | grep -q '"isOverdue": *false' && pass "việc đầu kỳ không bị báo quá hạn" || fail "$KQ"
# Nhãn kỳ phải là kỳ chứa HÔM NAY, không phải kỳ mới nhất (tự sinh luôn
# tạo sẵn tháng kế tiếp — bản cũ lấy nhầm và lệch nguyên một tháng).
TEN_KY_NAY=$(sql "SELECT name FROM \"Period\" WHERE type='MONTH' AND \"startDate\"<=CURRENT_DATE AND \"endDate\">=CURRENT_DATE;")
echo "$KQ" | grep -q "$TEN_KY_NAY" && pass "câu chữ ghi đúng kỳ hiện tại ($TEN_KY_NAY)" || fail "không thấy '$TEN_KY_NAY' trong: $KQ"
KQ=$(curl -s -H "Authorization: Bearer $AT_TT" "$API/scorecards/pending-my-action")
echo "$KQ" | grep -qE "chưa gửi|chưa được giao|ý kiến" && pass "trưởng bộ phận thấy việc của mình" || fail "$KQ"

buoc "GET /scorecards TRẢ SẴN TỔNG TRỌNG SỐ"
KQ=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/scorecards?periodId=$KY_08&limit=5")
echo "$KQ" | grep -q '"totalWeight"' && pass "có totalWeight" || fail "thiếu totalWeight"
echo "$KQ" | grep -q '"itemCount"' && pass "có itemCount" || fail "thiếu itemCount"
echo "$KQ" | grep -q '"items"' && fail "trả cả cây item — nặng không cần thiết" || pass "KHÔNG trả cây item trong danh sách"

# ======================= 7. DỮ LIỆU NỀN CHO MÀN GIAO KPI
# Hai phiếu ở KỲ HIỆN TẠI, một PROPOSED và một DRAFT.
#
# Trước đây hai phiếu này là dữ liệu tạo tay còn sót lại từ lượt điều tra
# GĐ2.5 — chạy `migrate reset` là mất, và không ai dựng lại được. Đưa vào
# đây để mọi kiểm tra của màn giao KPI có nền tái lập được, và để hàm
# don_du_lieu_thu() dọn nốt khi script kết thúc.
#
# Kỳ lấy bằng truy vấn CURRENT_DATE, KHÔNG viết cứng '2026-09': sang tháng
# sau script vẫn phải chạy đúng.
buoc "DỮ LIỆU NỀN — HAI PHIẾU Ở KỲ HIỆN TẠI"
KY_NAY=$(sql "SELECT id FROM \"Period\" WHERE type='MONTH' AND \"startDate\"<=CURRENT_DATE AND \"endDate\">=CURRENT_DATE;")
if [ -z "$KY_NAY" ]; then
  fail "không có kỳ tháng nào chứa hôm nay — tác vụ tự sinh kỳ chưa chạy?"
else
  pass "tìm được kỳ chứa hôm nay bằng truy vấn, không viết cứng mã kỳ"

  # Dọn sạch kỳ hiện tại trước, vì các mục trên có tạo phiếu ở đây
  sql "DELETE FROM \"ScorecardEvent\" WHERE \"scorecardId\" IN (SELECT id FROM \"Scorecard\" WHERE \"periodId\"='$KY_NAY');" >/dev/null
  sql "DELETE FROM \"ScorecardItem\" WHERE \"scorecardId\" IN (SELECT id FROM \"Scorecard\" WHERE \"periodId\"='$KY_NAY');" >/dev/null
  sql "DELETE FROM \"Scorecard\" WHERE \"periodId\"='$KY_NAY';" >/dev/null

  SC_NEN1=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
    -d "{\"userId\":\"$U_NV1\",\"periodId\":\"$KY_NAY\"}" "$API/scorecards" | jq_ "d['id']")
  SC_NEN2=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
    -d "{\"userId\":\"$U_NV2\",\"periodId\":\"$KY_NAY\"}" "$API/scorecards" | jq_ "d['id']")
  { [ -n "$SC_NEN1" ] && [ -n "$SC_NEN2" ]; } && pass "dựng lại được 2 phiếu nền" || fail "SC1=$SC_NEN1 SC2=$SC_NEN2"

  # Một phiếu gửi đi ký để có đủ cả hai trạng thái
  curl -s -o /dev/null -X POST -H "Authorization: Bearer $AT_TT" -H 'Content-Type: application/json' \
    -d '{}' "$API/scorecards/$SC_NEN1/propose"
  TT1=$(sql "SELECT \"assignStatus\" FROM \"Scorecard\" WHERE id='$SC_NEN1';")
  TT2=$(sql "SELECT \"assignStatus\" FROM \"Scorecard\" WHERE id='$SC_NEN2';")
  [ "$TT1" = "PROPOSED" ] && pass "phiếu nền 1 ở PROPOSED" || fail "phiếu nền 1 = $TT1"
  [ "$TT2" = "DRAFT" ] && pass "phiếu nền 2 ở DRAFT" || fail "phiếu nền 2 = $TT2"

  # Số người trong cây phòng Kỹ thuật CHƯA có phiếu — con số màn giao KPI cần.
  # Tính bằng truy vấn, không viết số: seed đổi thì kỳ vọng đổi theo.
  TONG_KT=$(sql "WITH RECURSIVE cay AS (SELECT id FROM \"Department\" WHERE code='KT' UNION ALL SELECT d.id FROM \"Department\" d JOIN cay ON d.\"parentId\"=cay.id) SELECT count(*) FROM \"User\" u JOIN cay ON u.\"departmentId\"=cay.id WHERE u.\"isActive\";")
  CO_PHIEU_KT=$(sql "WITH RECURSIVE cay AS (SELECT id FROM \"Department\" WHERE code='KT' UNION ALL SELECT d.id FROM \"Department\" d JOIN cay ON d.\"parentId\"=cay.id) SELECT count(*) FROM \"Scorecard\" s JOIN cay ON s.\"departmentId\"=cay.id WHERE s.\"periodId\"='$KY_NAY';")
  [ "$CO_PHIEU_KT" = "2" ] && pass "cây phòng Kỹ thuật: $TONG_KT người hoạt động, $CO_PHIEU_KT đã có phiếu, $((TONG_KT-CO_PHIEU_KT)) chưa có" \
    || fail "mong đợi đúng 2 phiếu trong cây KT, đang có $CO_PHIEU_KT"
fi

echo
printf '%.0s=' {1..60}; echo
if [ "$SO_FAIL" -eq 0 ]; then
  printf '\033[32mTẤT CẢ %d KIỂM TRA ĐỀU PASS\033[0m\n' "$SO_PASS"
else
  printf '\033[31m%d PASS, %d FAIL\033[0m\n' "$SO_PASS" "$SO_FAIL"
fi
printf '%.0s=' {1..60}; echo
exit "$([ "$SO_FAIL" -eq 0 ] && echo 0 || echo 1)"
