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
echo "$KQ" | grep -q "tự chấm chính mình" && pass "nêu lý do: trưởng bộ phận không tự chấm mình được" || fail "không nêu: $KQ"

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
# Tổ trưởng Shop Drawing là managerId của chính tổ đó. Không chặn thì phiếu
# của họ sẽ tự gửi, tự ký, và ở lát cắt chấm điểm là tự cho mình điểm.
U_TT=$(sql "SELECT id FROM \"User\" WHERE email='totruong.shopdrawing@hmico.vn';")
sql "UPDATE \"User\" SET \"jobTitleId\"=(SELECT id FROM \"JobTitle\" WHERE code='KT-SD-NV') WHERE id='$U_TT';" >/dev/null
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_TT\",\"periodId\":\"$KY_08\"}" "$API/scorecards")
echo "$KQ" | grep -q "tự chấm chính mình" && pass "sinh phiếu cho trưởng bộ phận của chính phòng -> bị chặn" \
  || fail "không chặn tự chấm: $KQ"

KQ=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/scorecards/readiness?departmentId=$P_KTSD")
echo "$KQ" | grep -q "employeesNeedingExternalEvaluator" && pass "readiness có mục người cần chỉ định người chấm khác" \
  || fail "readiness thiếu mục này: $KQ"
echo "$KQ" | grep -q "Đang là trưởng bộ phận của chính phòng này" && pass "readiness nêu rõ lý do" || fail "$KQ"

# Đường thoát: chỉ định người chấm khác
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_TT\",\"periodId\":\"$KY_08\",\"evaluatorId\":\"$U_ADMIN\"}" "$API/scorecards")
[ "$MA" = "201" ] && pass "chỉ định người chấm khác -> tạo được phiếu" || fail "-> $MA (mong đợi 201)"
sql "DELETE FROM \"ScorecardEvent\" WHERE \"scorecardId\" IN (SELECT id FROM \"Scorecard\" WHERE \"ownerUserId\"='$U_TT');" >/dev/null
sql "DELETE FROM \"ScorecardItem\" WHERE \"scorecardId\" IN (SELECT id FROM \"Scorecard\" WHERE \"ownerUserId\"='$U_TT');" >/dev/null
sql "DELETE FROM \"Scorecard\" WHERE \"ownerUserId\"='$U_TT';" >/dev/null
sql "UPDATE \"User\" SET \"jobTitleId\"=(SELECT id FROM \"JobTitle\" WHERE code='TT') WHERE id='$U_TT';" >/dev/null

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
echo "$KQ" | grep -q '"type"' && pass "trả mảng việc có kiểu {type,message,count,link,daysUntilDeadline}" || fail "$KQ"
echo "$KQ" | grep -q "daysUntilDeadline" && pass "có số ngày còn lại tới hạn nộp" || fail "thiếu daysUntilDeadline"
KQ=$(curl -s -H "Authorization: Bearer $AT_TT" "$API/scorecards/pending-my-action")
echo "$KQ" | grep -qE "chưa gửi|chưa được giao|ý kiến" && pass "trưởng bộ phận thấy việc của mình" || fail "$KQ"

buoc "GET /scorecards TRẢ SẴN TỔNG TRỌNG SỐ"
KQ=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/scorecards?periodId=$KY_08&limit=5")
echo "$KQ" | grep -q '"totalWeight"' && pass "có totalWeight" || fail "thiếu totalWeight"
echo "$KQ" | grep -q '"itemCount"' && pass "có itemCount" || fail "thiếu itemCount"
echo "$KQ" | grep -q '"items"' && fail "trả cả cây item — nặng không cần thiết" || pass "KHÔNG trả cây item trong danh sách"

echo
printf '%.0s=' {1..60}; echo
if [ "$SO_FAIL" -eq 0 ]; then
  printf '\033[32mTẤT CẢ %d KIỂM TRA ĐỀU PASS\033[0m\n' "$SO_PASS"
else
  printf '\033[31m%d PASS, %d FAIL\033[0m\n' "$SO_PASS" "$SO_FAIL"
fi
printf '%.0s=' {1..60}; echo
exit "$([ "$SO_FAIL" -eq 0 ] && echo 0 || echo 1)"
