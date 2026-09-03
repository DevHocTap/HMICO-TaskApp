#!/usr/bin/env bash
#
# Kiểm chứng module period bằng curl trên hệ thống chạy thật.
#
# Chạy:  ./scripts/verify-period.sh
# Yêu cầu: PostgreSQL đang chạy, đã `npm run build` và `npx prisma db seed`.
#
# Tự khởi động API ở cổng 3192, tự tắt và TỰ DỌN dữ liệu thử khi xong.

set -uo pipefail
cd "$(dirname "$0")/.."

# Chốt chặn: script này xoá dữ liệu, chỉ được chạy trên database cục bộ.
. "$(dirname "$0")/_chi-chay-cuc-bo.sh"

PORT=3192
API="http://localhost:$PORT"
MAT_KHAU="${SEED_PASSWORD:-Hmico@2026}"

TMP=$(mktemp -d)
SO_PASS=0
SO_FAIL=0

pass() { SO_PASS=$((SO_PASS+1)); printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { SO_FAIL=$((SO_FAIL+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$1"; }
buoc() { printf '\n\033[1m%s\033[0m\n' "$1"; }

sql() { docker exec kpi-postgres psql -U kpi_dev -d kpi_db -t -A -c "$1" 2>/dev/null; }

# Mốc dữ liệu: script chỉ được xoá thứ CHÍNH NÓ tạo ra.
. "$(dirname "$0")/_moc-du-lieu.sh"

don_du_lieu_thu() {
  # CHỈ xoá thứ script tạo ra: Scorecard và AuditLog theo mốc id chụp lúc
  # bắt đầu, Period theo tiền tố ZTEST, khoá kỳ khôi phục về trạng thái cũ
  # (KHÔNG mở khoá tất cả — kỳ người dùng cố ý khoá phải giữ nguyên).
  xoa_phieu_cua_script
  xoa_auditlog_cua_script
  khoi_phuc_khoa_ky
  docker exec kpi-postgres psql -U kpi_dev -d kpi_db -c "
    DELETE FROM \"Period\" WHERE code LIKE 'ZTEST%';
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

# Chụp mốc TRƯỚC khi dọn: dữ liệu đang có là của người dùng, không đụng tới.
chup_moc_du_lieu
don_du_lieu_thu

# Tiền điều kiện: các kỳ script cần phải đang MỞ.
#
# Script KHÔNG tự mở khoá: kỳ bị khoá là quyết định của người dùng, không
# phải rác của lần chạy trước. Trước đây phần dọn mở khoá tất tay, nên lỗi
# này không bao giờ lộ ra — nó im lặng huỷ quyết định của người dùng.
KY_DANG_KHOA=$(sql "SELECT string_agg(code, ', ') FROM \"Period\" WHERE code IN ('2026-08') AND \"isLocked\";")
if [ -n "$KY_DANG_KHOA" ]; then
  echo
  echo "DỪNG: các kỳ sau đang bị khoá nên script không thao tác được: $KY_DANG_KHOA"
  echo "Script cố ý KHÔNG tự mở — khoá kỳ là quyết định của bạn."
  echo "Mở bằng: POST /periods/<id>/unlock, hoặc"
  echo "  docker exec kpi-postgres psql -U kpi_dev -d kpi_db -c \\"
  echo "    \"UPDATE \\\"Period\\\" SET \\\"isLocked\\\"=false WHERE code IN ('2026-08');\""
  exit 1
fi

if [ -z "$(token_cua admin@hmico.vn)" ]; then
  echo; echo "Không đăng nhập được bằng tài khoản seed (admin@hmico.vn)."
  echo "Thường do đã đổi mật khẩu qua trình duyệt. Chạy: npx prisma db seed"; exit 1
fi

AT_ADMIN=$(token_cua admin@hmico.vn)
AT_HR=$(token_cua hcns@hmico.vn)
AT_BGD=$(token_cua giamdoc@hmico.vn)
AT_TP=$(token_cua truongphong.kythuat@hmico.vn)
AT_NV=$(token_cua sd.nhanvien1@hmico.vn)

U_ADMIN=$(sql "SELECT id FROM \"User\" WHERE email='admin@hmico.vn';")
KY_08=$(sql "SELECT id FROM \"Period\" WHERE code='2026-08';")
KY_Q3=$(sql "SELECT id FROM \"Period\" WHERE type='QUARTER' ORDER BY \"startDate\" LIMIT 1;")
KY_NAM=$(sql "SELECT id FROM \"Period\" WHERE type='YEAR' ORDER BY \"startDate\" LIMIT 1;")

# ================================================ 1. ĐỌC DANH SÁCH
# Danh sách kỳ chỉ là danh sách tháng, không có gì để giấu. MỌI vai trò đã
# đăng nhập đều đọc được — mọi màn hình phiếu KPI cần nó để đổ ô chọn kỳ.
buoc "GET /periods — MỌI VAI TRÒ ĐÃ ĐĂNG NHẬP ĐỌC ĐƯỢC"
for CAP in "ADMIN:$AT_ADMIN" "HR:$AT_HR" "EXECUTIVE:$AT_BGD" "MANAGER:$AT_TP" "STAFF:$AT_NV"; do
  VAI=${CAP%%:*}; TOK=${CAP#*:}
  MA=$(ma -H "Authorization: Bearer $TOK" "$API/periods")
  [ "$MA" = "200" ] && pass "$VAI đọc được danh sách kỳ" || fail "$VAI -> $MA (mong đợi 200)"
done
MA=$(ma "$API/periods")
[ "$MA" = "401" ] && pass "không đăng nhập -> 401" || fail "-> $MA (mong đợi 401)"

# scorecardCount giữ nguyên cho mọi vai trò: đây là số phiếu của cả kỳ,
# không phải dữ liệu của riêng phòng nào.
SO_A=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/periods" | jq_ "len(d)")
SO_S=$(curl -s -H "Authorization: Bearer $AT_NV" "$API/periods" | jq_ "len(d)")
[ "$SO_A" = "$SO_S" ] && pass "STAFF thấy đúng $SO_S kỳ, bằng ADMIN" || fail "ADMIN $SO_A, STAFF $SO_S"
curl -s -H "Authorization: Bearer $AT_NV" "$API/periods" | grep -q '"scorecardCount"' \
  && pass "STAFF vẫn nhận scorecardCount" || fail "STAFF thiếu scorecardCount"

buoc "GET /periods — NỘI DUNG VÀ BỘ LỌC"
KQ=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/periods")
SO_API=$(echo "$KQ" | jq_ "len(d)")
SO_DB=$(sql "SELECT count(*) FROM \"Period\";")
[ "$SO_API" = "$SO_DB" ] && pass "trả đủ $SO_API kỳ, khớp số đếm trong database" || fail "API $SO_API, database $SO_DB"

for TRUONG in id code name type startDate endDate assignDeadline selfScoreDeadline managerScoreDeadline submitDeadline isLocked createdById scorecardCount; do
  echo "$KQ" | grep -q "\"$TRUONG\"" && pass "có trường $TRUONG" || fail "thiếu trường $TRUONG"
done

# Sắp xếp startDate giảm dần
GIAM=$(echo "$KQ" | python3 -c "
import json,sys
d=[x['startDate'] for x in json.load(sys.stdin)]
print('OK' if d==sorted(d,reverse=True) else 'SAI')" 2>/dev/null)
[ "$GIAM" = "OK" ] && pass "sắp xếp theo startDate giảm dần" || fail "thứ tự sai"

SO_THANG_DB=$(sql "SELECT count(*) FROM \"Period\" WHERE type='MONTH';")
SO_THANG=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/periods?type=MONTH" | jq_ "len(d)")
[ "$SO_THANG" = "$SO_THANG_DB" ] && pass "lọc type=MONTH trả $SO_THANG kỳ, khớp database" || fail "API $SO_THANG, database $SO_THANG_DB"

NAM=$(sql "SELECT EXTRACT(YEAR FROM \"startDate\")::int FROM \"Period\" ORDER BY \"startDate\" LIMIT 1;")
SO_NAM_DB=$(sql "SELECT count(*) FROM \"Period\" WHERE EXTRACT(YEAR FROM \"startDate\")=$NAM;")
SO_NAM=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/periods?year=$NAM" | jq_ "len(d)")
[ "$SO_NAM" = "$SO_NAM_DB" ] && pass "lọc year=$NAM trả $SO_NAM kỳ, khớp database" || fail "API $SO_NAM, database $SO_NAM_DB"
SO_TRONG=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/periods?year=2001" | jq_ "len(d)")
[ "$SO_TRONG" = "0" ] && pass "năm không có kỳ nào -> mảng rỗng" || fail "-> $SO_TRONG kỳ"
MA=$(ma -H "Authorization: Bearer $AT_ADMIN" "$API/periods?type=THANG")
[ "$MA" = "400" ] && pass "type sai -> 400" || fail "-> $MA (mong đợi 400)"

# ================================================ 2. scorecardCount
buoc "scorecardCount ĐỐI CHIẾU VỚI COUNT(*) CHẠY TAY"
U_NV=$(sql "SELECT id FROM \"User\" WHERE email='sd.nhanvien1@hmico.vn';")
curl -s -o /dev/null -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d "{\"userId\":\"$U_NV\",\"periodId\":\"$KY_08\"}" "$API/scorecards"
DEM_DB=$(sql "SELECT count(*) FROM \"Scorecard\" WHERE \"periodId\"='$KY_08';")
DEM_SCRIPT=$(sql "SELECT count(*) FROM \"Scorecard\" WHERE \"periodId\"='$KY_08' AND $PHIEU_CUA_SCRIPT;")
DEM_API=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/periods" \
  | python3 -c "
import json,sys
for k in json.load(sys.stdin):
    if k['id']=='$KY_08': print(k['scorecardCount'])" 2>/dev/null)
[ "$DEM_API" = "$DEM_DB" ] && [ "$DEM_DB" -ge 1 ] \
  && pass "kỳ 2026-08: API báo $DEM_API, SELECT count(*) ra $DEM_DB" \
  || fail "API $DEM_API, database $DEM_DB (phải >=1 và bằng nhau)"

RONG=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/periods" \
  | python3 -c "
import json,sys
print(sum(1 for k in json.load(sys.stdin) if k['scorecardCount']==0))" 2>/dev/null)
RONG_DB=$(sql "SELECT count(*) FROM \"Period\" p WHERE NOT EXISTS (SELECT 1 FROM \"Scorecard\" s WHERE s.\"periodId\"=p.id);")
[ "$RONG" = "$RONG_DB" ] && pass "$RONG kỳ chưa có phiếu nào, khớp database" || fail "API $RONG, database $RONG_DB"

xoa_phieu_cua_script "\"periodId\"='$KY_08'"
xoa_auditlog_cua_script "\"entityType\"='Scorecard'"

buoc "BỐN MỐC TRONG THÁNG (HCNS chốt câu A2)"
# Toàn bộ chu trình nằm TRONG chính tháng đó. Bản trước đặt hạn nộp ở ngày 02
# THÁNG SAU — lệch hẳn một tháng.
MOC=$(sql "SELECT \"assignDeadline\"::text || '|' || \"selfScoreDeadline\"::text || '|' || \"managerScoreDeadline\"::text || '|' || \"submitDeadline\"::text FROM \"Period\" WHERE code='2026-09';")
[ "$MOC" = "2026-08-25|2026-09-25|2026-09-29|2026-09-30" ] \
  && pass "kỳ 2026-09: lên KPI 25/08, tự chấm 25/09, TP chấm 29/09, gửi HCNS 30/09" \
  || fail "mốc kỳ 2026-09 = $MOC"
# Hạn lên KPI phải nằm ở THÁNG TRƯỚC kỳ đó
SO_SAI=$(sql "SELECT count(*) FROM \"Period\" WHERE type='MONTH' AND \"assignDeadline\" >= \"startDate\";")
[ "$SO_SAI" = "0" ] && pass "hạn lên KPI của mọi kỳ đều nằm trước ngày đầu kỳ" || fail "$SO_SAI kỳ sai"
# Ba mốc còn lại phải nằm trong lòng kỳ
SO_SAI=$(sql "SELECT count(*) FROM \"Period\" WHERE type='MONTH' AND (\"selfScoreDeadline\" < \"startDate\" OR \"submitDeadline\" > \"endDate\" OR \"managerScoreDeadline\" > \"submitDeadline\");")
[ "$SO_SAI" = "0" ] && pass "tự chấm -> TP chấm -> gửi HCNS đúng thứ tự và nằm trong kỳ" || fail "$SO_SAI kỳ sai"
# Kỳ quý và năm không có mốc nào
SO_SAI=$(sql "SELECT count(*) FROM \"Period\" WHERE type <> 'MONTH' AND (\"assignDeadline\" IS NOT NULL OR \"selfScoreDeadline\" IS NOT NULL OR \"managerScoreDeadline\" IS NOT NULL OR \"submitDeadline\" IS NOT NULL);")
[ "$SO_SAI" = "0" ] && pass "kỳ quý và kỳ năm không có mốc nào" || fail "$SO_SAI kỳ tổng hợp có mốc"

# ================================================ 3. TẠO KỲ
buoc "POST /periods — TẠO KỲ THỦ CÔNG"
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-01","name":"ZTEST Tháng thử 01","type":"MONTH","startDate":"2025-01-01","endDate":"2025-01-31","assignDeadline":"2024-12-25","selfScoreDeadline":"2025-01-25","managerScoreDeadline":"2025-01-29","submitDeadline":"2025-01-30"}' \
  "$API/periods")
KY_MOI=$(echo "$KQ" | jq_ "d['id']")
[ -n "$KY_MOI" ] && pass "ADMIN tạo được kỳ tháng" || fail "không tạo được: $KQ"

TAO_BOI=$(sql "SELECT COALESCE(\"createdById\",'(null)') FROM \"Period\" WHERE code='ZTEST-01';")
[ "$TAO_BOI" = "$U_ADMIN" ] && pass "kỳ tạo tay có createdById = id người tạo" || fail "createdById=$TAO_BOI, mong đợi $U_ADMIN"

TU_SINH=$(sql "SELECT COALESCE(\"createdById\",'(null)') FROM \"Period\" WHERE code='2026-08';")
[ "$TU_SINH" = "(null)" ] && pass "kỳ hệ thống tự sinh có createdById = NULL" || fail "createdById=$TU_SINH, mong đợi NULL"

# Ngày phải lưu nguyên vẹn, không lệch múi giờ
NGAY=$(sql "SELECT \"startDate\"::text || '|' || \"endDate\"::text || '|' || \"assignDeadline\"::text || '|' || \"selfScoreDeadline\"::text || '|' || \"managerScoreDeadline\"::text || '|' || \"submitDeadline\"::text FROM \"Period\" WHERE code='ZTEST-01';")
[ "$NGAY" = "2025-01-01|2025-01-31|2024-12-25|2025-01-25|2025-01-29|2025-01-30" ] \
  && pass "cả sáu ngày lưu đúng nguyên văn, không lệch múi giờ" || fail "lưu ra: $NGAY"

SO_LOG=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityType\"='Period' AND action='CREATE' AND \"entityId\"='$KY_MOI';")
[ "$SO_LOG" = "1" ] && pass "có AuditLog CREATE" || fail "$SO_LOG dòng AuditLog CREATE"

buoc "POST /periods — TỪ CHỐI DỮ LIỆU SAI"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-01","name":"ZTEST tên khác","type":"MONTH","startDate":"2025-01-01","endDate":"2025-01-31"}' "$API/periods")
[ "$MA" = "409" ] && pass "tạo trùng code -> 409" || fail "-> $MA (mong đợi 409)"
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-01","name":"ZTEST tên khác","type":"MONTH","startDate":"2025-01-01","endDate":"2025-01-31"}' "$API/periods")
echo "$KQ" | grep -q "Đã có kỳ mang mã" && pass "409 kèm thông điệp tiếng Việt rõ ràng" || fail "$KQ"

MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-02","name":"ZTEST Tháng thử 01","type":"MONTH","startDate":"2025-02-01","endDate":"2025-02-28"}' "$API/periods")
[ "$MA" = "409" ] && pass "tạo trùng name -> 409" || fail "-> $MA (mong đợi 409)"

# Ràng buộc (b): submitDeadline chỉ dành cho kỳ MONTH
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-Q1","name":"ZTEST Quý thử 1","type":"QUARTER","startDate":"2025-01-01","endDate":"2025-03-31","submitDeadline":"2025-03-30"}' "$API/periods")
echo "$KQ" | grep -q "Chỉ kỳ THÁNG mới có hạn gửi HCNS" && pass "tạo QUARTER kèm submitDeadline -> 400, nêu đúng tên hạn" || fail "$KQ"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-Q1","name":"ZTEST Quý thử 1","type":"QUARTER","startDate":"2025-01-01","endDate":"2025-03-31","submitDeadline":"2025-03-30"}' "$API/periods")
[ "$MA" = "400" ] && pass "và đúng mã 400" || fail "-> $MA (mong đợi 400)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-Q3","name":"ZTEST Quý thử 3","type":"QUARTER","startDate":"2025-07-01","endDate":"2025-09-30","selfScoreDeadline":"2025-09-25"}' "$API/periods")
[ "$MA" = "400" ] && pass "tạo QUARTER kèm hạn tự đánh giá -> 400" || fail "-> $MA (mong đợi 400)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-Y1","name":"ZTEST Năm thử","type":"YEAR","startDate":"2025-01-01","endDate":"2025-12-31","assignDeadline":"2024-12-25"}' "$API/periods")
[ "$MA" = "400" ] && pass "tạo YEAR kèm submitDeadline -> 400" || fail "-> $MA (mong đợi 400)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-Q2","name":"ZTEST Quý thử 2","type":"QUARTER","startDate":"2025-04-01","endDate":"2025-06-30"}' "$API/periods")
[ "$MA" = "201" ] && pass "QUARTER KHÔNG kèm submitDeadline -> tạo được" || fail "-> $MA (mong đợi 201)"

MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-03","name":"ZTEST ngày ngược","type":"MONTH","startDate":"2025-03-31","endDate":"2025-03-01"}' "$API/periods")
[ "$MA" = "400" ] && pass "ngày bắt đầu sau ngày kết thúc -> 400" || fail "-> $MA (mong đợi 400)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-04","name":"ZTEST ngày có giờ","type":"MONTH","startDate":"2025-04-01T00:00:00+07:00","endDate":"2025-04-30"}' "$API/periods")
[ "$MA" = "400" ] && pass "ngày kèm giờ và múi giờ -> 400 (chỉ nhận YYYY-MM-DD)" || fail "-> $MA (mong đợi 400)"

# ================================================ 4. KHOÁ VÀ MỞ KỲ
buoc "KHOÁ KỲ — CHỈ KỲ THÁNG"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/periods/$KY_08/lock")
[ "$MA" = "200" ] && pass "khoá kỳ MONTH -> 200" || fail "-> $MA (mong đợi 200)"
DA_KHOA=$(sql "SELECT \"isLocked\" FROM \"Period\" WHERE id='$KY_08';")
[ "$DA_KHOA" = "t" ] && pass "database ghi nhận isLocked = true" || fail "isLocked=$DA_KHOA"
KHOA_BOI=$(sql "SELECT COALESCE(\"lockedById\",'(null)') FROM \"Period\" WHERE id='$KY_08';")
[ "$KHOA_BOI" = "$U_ADMIN" ] && pass "ghi lại ai khoá" || fail "lockedById=$KHOA_BOI"
SO_LOG=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityType\"='Period' AND action='LOCK' AND \"entityId\"='$KY_08';")
[ "$SO_LOG" = "1" ] && pass "có AuditLog LOCK" || fail "$SO_LOG dòng"

MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/periods/$KY_08/lock")
[ "$MA" = "400" ] && pass "khoá kỳ đã khoá -> 400, không ghi log trùng" || fail "-> $MA (mong đợi 400)"
# Thông điệp phải nói rõ TRẠNG THÁI HIỆN TẠI, không phải lỗi chung chung
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/periods/$KY_08/lock")
echo "$KQ" | grep -q "đã được khoá" && pass "thông điệp nói rõ kỳ ĐÃ ĐƯỢC KHOÁ" || fail "$KQ"
echo "$KQ" | grep -q "mở kỳ trước" && pass "và chỉ ra việc cần làm tiếp" || fail "$KQ"
printf '        \033[2m%s\033[0m\n' "$(echo "$KQ" | jq_ "d['message']")"
SO_LOG=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityType\"='Period' AND action='LOCK' AND \"entityId\"='$KY_08';")
[ "$SO_LOG" = "1" ] && pass "vẫn đúng 1 dòng AuditLog LOCK" || fail "$SO_LOG dòng"

# Ràng buộc (a): chặn ở BACKEND, không chỉ ẩn nút
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/periods/$KY_Q3/lock")
echo "$KQ" | grep -q "Chỉ khoá được kỳ THÁNG" && pass "khoá kỳ QUARTER -> từ chối kèm lý do" || fail "$KQ"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/periods/$KY_Q3/lock")
[ "$MA" = "400" ] && pass "và đúng mã 400" || fail "-> $MA (mong đợi 400)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/periods/$KY_NAM/lock")
[ "$MA" = "400" ] && pass "khoá kỳ YEAR -> 400" || fail "-> $MA (mong đợi 400)"
Q3_KHOA=$(sql "SELECT \"isLocked\" FROM \"Period\" WHERE id='$KY_Q3';")
[ "$Q3_KHOA" = "f" ] && pass "kỳ QUARTER vẫn không bị khoá sau khi bị từ chối" || fail "isLocked=$Q3_KHOA"

buoc "MỞ KỲ"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/periods/$KY_08/unlock")
[ "$MA" = "200" ] && pass "mở kỳ -> 200" || fail "-> $MA (mong đợi 200)"
DA_KHOA=$(sql "SELECT \"isLocked\" FROM \"Period\" WHERE id='$KY_08';")
[ "$DA_KHOA" = "f" ] && pass "database ghi nhận isLocked = false" || fail "isLocked=$DA_KHOA"
SO_LOG=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityType\"='Period' AND action='UNLOCK' AND \"entityId\"='$KY_08';")
[ "$SO_LOG" = "1" ] && pass "có AuditLog UNLOCK" || fail "$SO_LOG dòng"
MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/periods/$KY_08/unlock")
[ "$MA" = "400" ] && pass "mở kỳ đang không khoá -> 400" || fail "-> $MA (mong đợi 400)"
KQ=$(curl -s -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/periods/$KY_08/unlock")
echo "$KQ" | grep -q "đang mở" && pass "thông điệp nói rõ kỳ ĐANG MỞ" || fail "$KQ"
printf '        \033[2m%s\033[0m\n' "$(echo "$KQ" | jq_ "d['message']")"

MA=$(ma -X POST -H "Authorization: Bearer $AT_ADMIN" "$API/periods/00000000-0000-4000-8000-000000000000/lock")
[ "$MA" = "404" ] && pass "khoá kỳ không tồn tại -> 404" || fail "-> $MA (mong đợi 404)"

# ================================================ 5. GHI: CHỈ ADMIN
# HCNS chốt 03/09/2026 (câu A5): chốt sổ tháng là quyết định NGHIỆP VỤ, nên
# HCNS và ban giám đốc khoá được kỳ. Trưởng phòng và nhân viên thì không —
# muốn sửa điểm kỳ đã chốt phải gửi yêu cầu cho HCNS hoặc BGĐ.
buoc "PHÂN QUYỀN GHI — HCNS VÀ BGĐ CHỐT SỔ ĐƯỢC"
BODY='{"code":"ZTEST-99","name":"ZTEST tạo bởi HCNS","type":"MONTH","startDate":"2025-09-01","endDate":"2025-09-30"}'
MA=$(ma -X POST -H "Authorization: Bearer $AT_BGD" "$API/periods/$KY_08/lock")
[ "$MA" = "200" ] && pass "EXECUTIVE khoá kỳ -> 200" || fail "-> $MA (mong đợi 200)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_BGD" "$API/periods/$KY_08/unlock")
[ "$MA" = "200" ] && pass "EXECUTIVE mở kỳ -> 200" || fail "-> $MA (mong đợi 200)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_HR" "$API/periods/$KY_08/lock")
[ "$MA" = "200" ] && pass "HR khoá kỳ -> 200" || fail "-> $MA (mong đợi 200)"
KHOA_BOI=$(sql "SELECT COALESCE(\"lockedById\",'(null)') FROM \"Period\" WHERE id='$KY_08';")
U_HR=$(sql "SELECT id FROM \"User\" WHERE email='hcns@hmico.vn';")
[ "$KHOA_BOI" = "$U_HR" ] && pass "ghi đúng HCNS là người chốt sổ" || fail "lockedById=$KHOA_BOI"
MA=$(ma -X POST -H "Authorization: Bearer $AT_HR" "$API/periods/$KY_08/unlock")
[ "$MA" = "200" ] && pass "HR mở kỳ -> 200" || fail "-> $MA (mong đợi 200)"

MA=$(ma -X POST -H "Authorization: Bearer $AT_HR" -H 'Content-Type: application/json' -d "$BODY" "$API/periods")
[ "$MA" = "201" ] && pass "HR tạo kỳ -> 201" || fail "-> $MA (mong đợi 201)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_BGD" -H 'Content-Type: application/json' \
  -d '{"code":"ZTEST-98","name":"ZTEST BGĐ không tạo được","type":"MONTH","startDate":"2025-10-01","endDate":"2025-10-31"}' "$API/periods")
[ "$MA" = "403" ] && pass "EXECUTIVE tạo kỳ -> 403 (chốt sổ khác với dựng kỳ)" || fail "-> $MA (mong đợi 403)"

MA=$(ma -X POST -H "Authorization: Bearer $AT_TP" "$API/periods/$KY_08/lock")
[ "$MA" = "403" ] && pass "MANAGER khoá kỳ -> 403" || fail "-> $MA (mong đợi 403)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_NV" "$API/periods/$KY_08/lock")
[ "$MA" = "403" ] && pass "STAFF khoá kỳ -> 403" || fail "-> $MA (mong đợi 403)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_TP" -H 'Content-Type: application/json' -d "$BODY" "$API/periods")
[ "$MA" = "403" ] && pass "MANAGER tạo kỳ -> 403 (đọc được không có nghĩa ghi được)" || fail "-> $MA (mong đợi 403)"
MA=$(ma -X POST -H "Authorization: Bearer $AT_NV" -H 'Content-Type: application/json' -d "$BODY" "$API/periods")
[ "$MA" = "403" ] && pass "STAFF tạo kỳ -> 403" || fail "-> $MA (mong đợi 403)"

SO_LEN=$(sql "SELECT count(*) FROM \"Period\" WHERE code='ZTEST-98';")
[ "$SO_LEN" = "0" ] && pass "không kỳ nào lọt qua bằng vai trò không đủ quyền" || fail "$SO_LEN kỳ đã lọt"

# ================================================ 6. TỰ DỌN
buoc "TỰ DỌN DỮ LIỆU THỬ"
don_du_lieu_thu
CON=$(sql "SELECT count(*) FROM \"Period\" WHERE code LIKE 'ZTEST%';")
[ "$CON" = "0" ] && pass "không còn kỳ ZTEST nào" || fail "còn $CON kỳ ZTEST"
# So với MỐC, không so với 0: kỳ người dùng cố ý khoá phải giữ nguyên khoá.
CON=$(sql "SELECT count(*) FROM \"Period\" p JOIN ztest_moc_period m ON m.id=p.id WHERE p.\"isLocked\" IS DISTINCT FROM m.\"isLocked\";")
[ "$CON" = "0" ] && pass "trạng thái khoá mọi kỳ đã về đúng như trước khi chạy" || fail "$CON kỳ còn lệch so với mốc"
CON=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE id NOT IN (SELECT id FROM ztest_moc_auditlog);")
[ "$CON" = "0" ] && pass "dọn sạch AuditLog do script tạo, giữ nguyên phần có trước" || fail "còn $CON dòng"
CON=$(sql "SELECT count(*) FROM \"Scorecard\" WHERE $PHIEU_CUA_SCRIPT;")
[ "$CON" = "0" ] && pass "không còn phiếu nào do script tạo" || fail "còn $CON phiếu"

echo
printf '%.0s=' {1..60}; echo
if [ "$SO_FAIL" -eq 0 ]; then
  printf '\033[32mTẤT CẢ %d KIỂM TRA ĐỀU PASS\033[0m\n' "$SO_PASS"
else
  printf '\033[31m%d PASS, %d FAIL\033[0m\n' "$SO_PASS" "$SO_FAIL"
fi
printf '%.0s=' {1..60}; echo
exit "$([ "$SO_FAIL" -eq 0 ] && echo 0 || echo 1)"
