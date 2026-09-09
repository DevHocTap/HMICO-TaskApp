#!/usr/bin/env bash
#
# Kiểm chứng lát cắt 5 — chấm điểm — bằng curl trên hệ thống chạy thật.
#
# Chạy:  ./scripts/kiem-chung-lat-cat-5.sh
# Yêu cầu: PostgreSQL đang chạy, đã `npm run build` và `npx prisma db seed`.
#
# ⚠️ CHẠY `pg_dump` TRƯỚC LẦN ĐẦU:
#     docker exec kpi-postgres pg_dump -U kpi_dev kpi_db > /tmp/kpi-truoc-kiem-chung.sql
#   Script tạo phiếu, chấm điểm, khoá/mở kỳ và tạm vô hiệu hoá một tài khoản.
#   Mọi thứ đều được hoàn nguyên lúc kết thúc, nhưng bản sao lưu là thứ duy
#   nhất cứu được nếu script chết giữa chừng.
#
# Tự khởi động API ở cổng 3195, tự tắt và TỰ DỌN dữ liệu thử khi xong.

set -uo pipefail
cd "$(dirname "$0")/.."

# Chốt chặn: chỉ chạy khi có biến đồng ý tường minh, KHÔNG đoán môi trường
# bằng hostname hay chuỗi kết nối.
. "$(dirname "$0")/_chi-chay-cuc-bo.sh"

PORT=3195
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

# Tài khoản bị tạm vô hiệu hoá cho ca "người đã nghỉ việc" (ca 22–23).
# Ghi lại trạng thái gốc để trả về đúng như cũ, kể cả khi script chết.
EMAIL_NGHI_VIEC='sd.nhanvien2@hmico.vn'
ISACTIVE_GOC=''

# psql -t -A in ra 't' / 'f' — KHÔNG phải literal boolean của SQL. Ghi thẳng
# `isActive=t` thì PostgreSQL hiểu `t` là tên cột, câu lệnh hỏng và tài khoản
# kẹt ở trạng thái vô hiệu hoá sang tận lần chạy sau.
khoi_phuc_tai_khoan() {
  case "$ISACTIVE_GOC" in
    t) sql "UPDATE \"User\" SET \"isActive\"=true WHERE email='$EMAIL_NGHI_VIEC';" >/dev/null ;;
    f) sql "UPDATE \"User\" SET \"isActive\"=false WHERE email='$EMAIL_NGHI_VIEC';" >/dev/null ;;
  esac
}

don_du_lieu_thu() {
  # CHỈ xoá thứ script tạo ra: phiếu theo mốc id chụp lúc bắt đầu, kỳ và
  # người dùng theo tiền tố ZTEST. Không có DELETE không điều kiện ở đâu.
  xoa_phieu_cua_script
  xoa_auditlog_cua_script
  khoi_phuc_khoa_ky
  khoi_phuc_tai_khoan
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

KY_DANG_KHOA=$(sql "SELECT string_agg(code, ', ') FROM \"Period\" WHERE code IN ('2026-08','2026-09','2026-Q3') AND \"isLocked\";")
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
AT_NV2=$(token_cua "$EMAIL_NGHI_VIEC")

if [ -z "$AT_ADMIN" ] || [ -z "$AT_NV1" ]; then
  echo; echo "Không đăng nhập được bằng tài khoản seed. Chạy: npx prisma db seed"; exit 1
fi

KY_08=$(sql "SELECT id FROM \"Period\" WHERE code='2026-08';")
KY_09=$(sql "SELECT id FROM \"Period\" WHERE code='2026-09';")
KY_Q3=$(sql "SELECT id FROM \"Period\" WHERE code='2026-Q3';")
U_NV1=$(sql "SELECT id FROM \"User\" WHERE email='kt.trienkhai1@hmico.vn';")
U_NV2=$(sql "SELECT id FROM \"User\" WHERE email='$EMAIL_NGHI_VIEC';")
U_KT=$(sql "SELECT id FROM \"User\" WHERE email='truongphong.kythuat@hmico.vn';")
ISACTIVE_GOC=$(sql "SELECT \"isActive\" FROM \"User\" WHERE email='$EMAIL_NGHI_VIEC';")

# ========================================================= DỰNG PHIẾU NỀN
buoc "DỰNG DỮ LIỆU — phiếu đã ký nhận, sẵn sàng chấm"

R=$(goi POST "$AT_ADMIN" /scorecards "{\"userId\":\"$U_NV1\",\"periodId\":\"$KY_08\"}")
SC=$(than_cua "$R" | jq_ "d['id']")
[ -n "$SC" ] && pass "sinh phiếu tháng 08 cho nhân viên Kỹ thuật" || { fail "không sinh được phiếu: $R"; exit 1; }

goi POST "$AT_KT" "/scorecards/$SC/propose" >/dev/null
R=$(goi POST "$AT_NV1" "/scorecards/$SC/accept")
mong "$(ma_cua "$R")" 200 "nhân viên ký nhận phiếu -> ACCEPTED"

# Phiếu thứ hai: CỐ Ý để nguyên DRAFT, dùng cho ca 19.
R=$(goi POST "$AT_ADMIN" /scorecards "{\"userId\":\"$U_NV2\",\"periodId\":\"$KY_08\"}")
SC_DRAFT=$(than_cua "$R" | jq_ "d['id']")
[ -n "$SC_DRAFT" ] && pass "sinh phiếu thứ hai, giữ nguyên DRAFT" || fail "không sinh được: $R"

# ========================================================= 1–4 CỘT TỰ CHẤM
buoc "1–4  CỘT TỰ CHẤM"

ITEM_LA=$(sql "SELECT i.id FROM \"ScorecardItem\" i
                WHERE i.\"scorecardId\"='$SC'
                  AND NOT EXISTS (SELECT 1 FROM \"ScorecardItem\" c WHERE c.\"parentId\"=i.id)
                ORDER BY i.\"displayOrder\" LIMIT 1;")
ITEM_CHA=$(sql "SELECT i.id FROM \"ScorecardItem\" i
                 WHERE i.\"scorecardId\"='$SC'
                   AND EXISTS (SELECT 1 FROM \"ScorecardItem\" c WHERE c.\"parentId\"=i.id)
                 LIMIT 1;")
ITEM_CPL=$(sql "SELECT id FROM \"ScorecardItem\"
                 WHERE \"scorecardId\"='$SC' AND section='COMPLIANCE' LIMIT 1;")

R=$(goi PUT "$AT_NV1" "/scorecards/$SC/self-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"score\":8}]}")
mong "$(ma_cua "$R")" 200 "1. STAFF lưu nháp điểm phiếu của mình" "$(than_cua "$R")"

R=$(goi PUT "$AT_NV2" "/scorecards/$SC/self-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"score\":8}]}")
mong "$(ma_cua "$R")" 403 "2. STAFF chấm phiếu người khác"

# C1 — itemId phải thuộc ĐÚNG phiếu :id
ITEM_LA_PHIEU_KHAC=$(sql "SELECT i.id FROM \"ScorecardItem\" i
                           WHERE i.\"scorecardId\"='$SC_DRAFT'
                             AND NOT EXISTS (SELECT 1 FROM \"ScorecardItem\" c WHERE c.\"parentId\"=i.id)
                           LIMIT 1;")
DIEM_TRUOC=$(sql "SELECT COALESCE(\"selfScore\"::text,'NULL') FROM \"ScorecardItem\" WHERE id='$ITEM_LA_PHIEU_KHAC';")

R=$(goi PUT "$AT_NV1" "/scorecards/$SC/self-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA_PHIEU_KHAC\",\"score\":9}]}")
MA_LA=$(ma_cua "$R")
SO_LA=$(than_cua "$R" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('itemIds',[])))" 2>/dev/null)
if [ "$MA_LA" = "400" ] && [ "${SO_LA:-0}" = "1" ]; then
  pass "2b. STAFF gửi itemId của phiếu người khác -> 400, liệt kê itemId lạ"
else
  fail "2b. itemId phiếu khác -> HTTP $MA_LA, itemIds=${SO_LA:-?}"
fi
DIEM_SAU=$(sql "SELECT COALESCE(\"selfScore\"::text,'NULL') FROM \"ScorecardItem\" WHERE id='$ITEM_LA_PHIEU_KHAC';")
[ "$DIEM_SAU" = "$DIEM_TRUOC" ] \
  && pass "    điểm của phiếu kia KHÔNG đổi ($DIEM_TRUOC)" \
  || fail "    điểm phiếu kia đổi từ $DIEM_TRUOC thành $DIEM_SAU"

R=$(goi POST "$AT_NV1" "/scorecards/$SC/self-submit")
MA3=$(ma_cua "$R"); THAN3=$(than_cua "$R")
SO_THIEU=$(echo "$THAN3" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('itemIds',[])))" 2>/dev/null)
if [ "$MA3" = "400" ] && [ "${SO_THIEU:-0}" -gt 0 ]; then
  pass "3. self-submit khi còn tiêu chí chưa chấm -> 400, liệt kê $SO_THIEU item"
else
  fail "3. self-submit thiếu điểm -> HTTP $MA3, itemIds=${SO_THIEU:-?}"
fi

R=$(goi PUT "$AT_NV1" "/scorecards/$SC/self-scores" "$(payload_cham_du "$SC")")
mong "$(ma_cua "$R")" 200 "   chấm đủ mọi tiêu chí lá (lưu nháp)" "$(than_cua "$R")"

R=$(goi POST "$AT_NV1" "/scorecards/$SC/self-submit")
mong "$(ma_cua "$R")" 200 "4. self-submit khi đã chấm đủ" "$(than_cua "$R")"
TT=$(sql "SELECT \"resultStatus\" || '|' || COALESCE(\"selfTotalScore\"::text,'NULL') FROM \"Scorecard\" WHERE id='$SC';")
[ "$TT" = "SELF_SCORED|100.00" ] \
  && pass "   resultStatus=SELF_SCORED, selfTotalScore chốt đúng 100.00" \
  || fail "   trạng thái sau self-submit: $TT (mong đợi SELF_SCORED|100.00)"
GRADE_TU_CHAM=$(sql "SELECT COALESCE(grade::text,'NULL') FROM \"Scorecard\" WHERE id='$SC';")
[ "$GRADE_TU_CHAM" = "NULL" ] \
  && pass "   cột tự chấm KHÔNG sinh xếp loại" \
  || fail "   grade sau self-submit = $GRADE_TU_CHAM (phải NULL)"

# C2 — cửa tự chấm đóng lại sau khi đã nộp
TONG_TRUOC=$(sql "SELECT \"selfTotalScore\"::text FROM \"Scorecard\" WHERE id='$SC';")
R=$(goi PUT "$AT_NV1" "/scorecards/$SC/self-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"score\":3}]}")
mong "$(ma_cua "$R")" 409 "4b. sửa self-scores sau khi đã SELF_SCORED"
DIEM_DONG=$(sql "SELECT \"selfScore\"::text FROM \"ScorecardItem\" WHERE id='$ITEM_LA';")
TONG_SAU=$(sql "SELECT \"selfTotalScore\"::text FROM \"Scorecard\" WHERE id='$SC';")
[ "$TONG_SAU" = "$TONG_TRUOC" ] && [ "$DIEM_DONG" != "3.00" ] \
  && pass "    điểm dòng ($DIEM_DONG) và tổng đã chốt ($TONG_SAU) vẫn khớp nhau" \
  || fail "    điểm dòng=$DIEM_DONG, tổng $TONG_TRUOC -> $TONG_SAU"

R=$(goi POST "$AT_NV1" "/scorecards/$SC/self-submit")
mong "$(ma_cua "$R")" 409 "4c. self-submit lần hai khi đã SELF_SCORED"

# ================================================= 5–10 CỘT TRƯỞNG BỘ PHẬN
buoc "5–10  CỘT TRƯỞNG BỘ PHẬN — phân quyền và ràng buộc điểm"

R=$(goi PUT "$AT_RND" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"score\":9}]}")
mong "$(ma_cua "$R")" 403 "5. MANAGER khác phòng gọi manager-scores"

# Đặt ở ĐÂY chứ không cạnh ca 2: lúc đó phiếu còn PENDING nên lớp trạng thái
# chặn trước, và ca này sẽ không kiểm được đúng thứ nó định kiểm.
R=$(goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA_PHIEU_KHAC\",\"score\":9}]}")
mong "$(ma_cua "$R")" 400 "5b. MANAGER gửi itemId của phiếu người khác"
DIEM_SAU=$(sql "SELECT COALESCE(\"managerScore\"::text,'NULL') FROM \"ScorecardItem\" WHERE id='$ITEM_LA_PHIEU_KHAC';")
[ "$DIEM_SAU" = "NULL" ] \
  && pass "    cột trưởng bộ phận của phiếu kia vẫn trống" \
  || fail "    điểm phiếu kia thành $DIEM_SAU"

R=$(goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"score\":12}]}")
mong "$(ma_cua "$R")" 400 "6. chấm 12/10 mà không có ghi chú"

R=$(goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"score\":12,\"comment\":\"Vượt chỉ tiêu, có xác nhận của chủ đầu tư\"}]}")
mong "$(ma_cua "$R")" 200 "7. chấm 12/10 kèm ghi chú" "$(than_cua "$R")"

# C3 — xoá ghi chú trong khi điểm vẫn vượt thang
R=$(goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"comment\":\"\"}]}")
mong "$(ma_cua "$R")" 400 "7b. xoá ghi chú (chuỗi rỗng) trong khi điểm vẫn 12/10"

R=$(goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"comment\":null}]}")
mong "$(ma_cua "$R")" 400 "7c. xoá ghi chú (null) trong khi điểm vẫn 12/10"
GHI_CHU=$(sql "SELECT COALESCE(\"managerComment\",'NULL') FROM \"ScorecardItem\" WHERE id='$ITEM_LA';")
[ "$GHI_CHU" != "NULL" ] \
  && pass "    ghi chú cũ vẫn còn nguyên trong database" \
  || fail "    ghi chú đã bị xoá"

R=$(goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_CPL\",\"score\":3.5,\"comment\":\"thử vượt thang nội quy\"}]}")
mong "$(ma_cua "$R")" 400 "8. chấm COMPLIANCE 3,5/3 — nội quy không được vượt thang"

R=$(goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_CHA\",\"score\":9}]}")
mong "$(ma_cua "$R")" 400 "9. nhập điểm vào tiêu chí CÓ CON"

R=$(goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"score\":8.257}]}")
mong "$(ma_cua "$R")" 400 "10. nhập 8,257 — quá 2 chữ số thập phân của Decimal(6,2)"

# ================================================= 11–14 TRẢ LẠI
buoc "11–14  TRẢ LẠI PHIẾU"

R=$(goi POST "$AT_KT" "/scorecards/$SC/reject" '{"reason":"abc"}')
mong "$(ma_cua "$R")" 400 "11. reject không có lý do hợp lệ"

R=$(goi POST "$AT_KT" "/scorecards/$SC/reject" \
  '{"reason":"Tiêu chí tiến độ tự chấm cao hơn thực tế, đề nghị chấm lại"}')
mong "$(ma_cua "$R")" 200 "12. reject có lý do" "$(than_cua "$R")"
TT=$(sql "SELECT \"resultStatus\" FROM \"Scorecard\" WHERE id='$SC';")
SO_EV=$(sql "SELECT count(*) FROM \"ScorecardEvent\" WHERE \"scorecardId\"='$SC' AND action='REJECT';")
[ "$TT" = "REJECTED" ] && pass "    resultStatus=REJECTED" || fail "    trạng thái=$TT"
[ "$SO_EV" = "1" ] && pass "    sinh 1 dòng ScorecardEvent REJECT" || fail "    có $SO_EV dòng REJECT"

R=$(goi POST "$AT_NV1" "/scorecards/$SC/self-submit")
mong "$(ma_cua "$R")" 200 "13. STAFF nộp lại sau khi bị trả lại" "$(than_cua "$R")"

R=$(goi POST "$AT_KT" "/scorecards/$SC/reject" \
  '{"reason":"Vẫn còn lệch ở tiêu chí an toàn lao động, chấm lại lần nữa"}')
mong "$(ma_cua "$R")" 200 "14. trả lại lần hai"
SO_EV=$(sql "SELECT count(*) FROM \"ScorecardEvent\" WHERE \"scorecardId\"='$SC' AND action='REJECT';")
[ "$SO_EV" = "2" ] \
  && pass "    hai lần trả lại = hai dòng ScorecardEvent riêng" \
  || fail "    có $SO_EV dòng REJECT (mong đợi 2)"

goi POST "$AT_NV1" "/scorecards/$SC/self-submit" >/dev/null

# ================================================= 15–18 CHỐT VÀ TIẾP NHẬN
buoc "15–18  CHỐT ĐIỂM VÀ TIẾP NHẬN"

goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" "$(payload_cham_du "$SC")" >/dev/null
R=$(goi POST "$AT_KT" "/scorecards/$SC/manager-submit" '{}')
mong "$(ma_cua "$R")" 200 "15. manager-submit" "$(than_cua "$R")"
TT=$(sql "SELECT \"resultStatus\" || '|' || COALESCE(\"managerTotalScore\"::text,'NULL') || '|' || COALESCE(grade::text,'NULL') FROM \"Scorecard\" WHERE id='$SC';")
[ "$TT" = "MANAGER_SCORED|100.00|COMPLETED" ] \
  && pass "    managerTotalScore=100.00, grade=COMPLETED được chốt" \
  || fail "    sau manager-submit: $TT"

# C2 — cửa chấm đóng lại sau khi đã chốt điểm
TONG_TRUOC=$(sql "SELECT \"managerTotalScore\"::text FROM \"Scorecard\" WHERE id='$SC';")
R=$(goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_CPL\",\"score\":1}]}")
mong "$(ma_cua "$R")" 409 "15b. sửa manager-scores sau khi đã MANAGER_SCORED"
DIEM_DONG=$(sql "SELECT \"managerScore\"::text FROM \"ScorecardItem\" WHERE id='$ITEM_CPL';")
TONG_SAU=$(sql "SELECT \"managerTotalScore\"::text FROM \"Scorecard\" WHERE id='$SC';")
[ "$TONG_SAU" = "$TONG_TRUOC" ] && [ "$DIEM_DONG" != "1.00" ] \
  && pass "     điểm dòng ($DIEM_DONG) và tổng đã chốt ($TONG_SAU) vẫn khớp nhau" \
  || fail "     điểm dòng=$DIEM_DONG, tổng $TONG_TRUOC -> $TONG_SAU"

R=$(goi POST "$AT_HR" "/scorecards/$SC/reject" '{"reason":"HCNS thử trả lại phiếu này"}')
mong "$(ma_cua "$R")" 403 "17. HR gọi reject — HCNS không có quyền trả lại"

R=$(goi PUT "$AT_ADMIN" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"score\":7}]}")
mong "$(ma_cua "$R")" 403 "18. ADMIN gọi manager-scores — không ai chấm thay"

R=$(goi POST "$AT_HR" "/scorecards/$SC/receive")
mong "$(ma_cua "$R")" 200 "16. HR tiếp nhận phiếu" "$(than_cua "$R")"
TT=$(sql "SELECT \"resultStatus\" FROM \"Scorecard\" WHERE id='$SC';")
[ "$TT" = "RECEIVED" ] && pass "    resultStatus=RECEIVED" || fail "    trạng thái=$TT"

# C2 — sau RECEIVED thì không còn cửa nào
TONG_TRUOC=$(sql "SELECT \"managerTotalScore\"::text FROM \"Scorecard\" WHERE id='$SC';")
R=$(goi PUT "$AT_NV1" "/scorecards/$SC/self-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"score\":2}]}")
mong "$(ma_cua "$R")" 409 "16b. self-scores sau RECEIVED"
R=$(goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_LA\",\"score\":2}]}")
mong "$(ma_cua "$R")" 409 "16c. manager-scores sau RECEIVED"
R=$(goi POST "$AT_KT" "/scorecards/$SC/reject" \
  '{"reason":"Thử trả lại phiếu HCNS đã tiếp nhận"}')
mong "$(ma_cua "$R")" 409 "16d. reject sau RECEIVED"
R=$(goi POST "$AT_KT" "/scorecards/$SC/manager-submit" '{}')
mong "$(ma_cua "$R")" 409 "16e. manager-submit sau RECEIVED"
TONG_SAU=$(sql "SELECT \"managerTotalScore\"::text FROM \"Scorecard\" WHERE id='$SC';")
DIEM_DONG=$(sql "SELECT \"managerScore\"::text FROM \"ScorecardItem\" WHERE id='$ITEM_LA';")
[ "$TONG_SAU" = "$TONG_TRUOC" ] && [ "$DIEM_DONG" != "2.00" ] \
  && pass "     điểm dòng ($DIEM_DONG) và tổng đã chốt ($TONG_SAU) không ai đụng được" \
  || fail "     điểm dòng=$DIEM_DONG, tổng $TONG_TRUOC -> $TONG_SAU"

# ================================================= 19–21 TRẠNG THÁI VÀ KHOÁ KỲ
buoc "19–21  PHIẾU CHƯA KÝ NHẬN VÀ KHOÁ KỲ"

ITEM_DRAFT=$(sql "SELECT i.id FROM \"ScorecardItem\" i
                   WHERE i.\"scorecardId\"='$SC_DRAFT'
                     AND NOT EXISTS (SELECT 1 FROM \"ScorecardItem\" c WHERE c.\"parentId\"=i.id)
                   LIMIT 1;")
R=$(goi PUT "$AT_NV2" "/scorecards/$SC_DRAFT/self-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_DRAFT\",\"score\":8}]}")
mong "$(ma_cua "$R")" 409 "19. chấm phiếu chưa ký nhận (assignStatus=DRAFT)"

# Phiếu tháng 09 để thử khoá kỳ THÁNG
R=$(goi POST "$AT_ADMIN" /scorecards "{\"userId\":\"$U_NV1\",\"periodId\":\"$KY_09\"}")
SC_09=$(than_cua "$R" | jq_ "d['id']")
goi POST "$AT_KT" "/scorecards/$SC_09/propose" >/dev/null
goi POST "$AT_NV1" "/scorecards/$SC_09/accept" >/dev/null
ITEM_09=$(sql "SELECT i.id FROM \"ScorecardItem\" i
                WHERE i.\"scorecardId\"='$SC_09'
                  AND NOT EXISTS (SELECT 1 FROM \"ScorecardItem\" c WHERE c.\"parentId\"=i.id)
                LIMIT 1;")

goi POST "$AT_HR" "/periods/$KY_09/lock" >/dev/null
R=$(goi PUT "$AT_NV1" "/scorecards/$SC_09/self-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_09\",\"score\":8}]}")
mong "$(ma_cua "$R")" 409 "20. chấm khi kỳ THÁNG của phiếu đã khoá sổ"
goi POST "$AT_HR" "/periods/$KY_09/unlock" >/dev/null

# Khoá kỳ QUÝ 3 rồi chấm phiếu THÁNG 08 nằm trong quý đó
goi POST "$AT_HR" "/periods/$KY_Q3/lock" >/dev/null
R=$(goi PUT "$AT_NV1" "/scorecards/$SC_09/self-scores" \
  "{\"scores\":[{\"itemId\":\"$ITEM_09\",\"score\":8}]}")
mong "$(ma_cua "$R")" 200 "21. kỳ QUÝ 3 khoá KHÔNG lan xuống kỳ tháng" "$(than_cua "$R")"
goi POST "$AT_HR" "/periods/$KY_Q3/unlock" >/dev/null

# ================================================= 22–23 NGƯỜI ĐÃ NGHỈ VIỆC
buoc "22–23  NGƯỜI ĐÃ NGHỈ VIỆC — chốt phiếu thiếu cột tự chấm"

goi POST "$AT_KT" "/scorecards/$SC_DRAFT/propose" >/dev/null
goi POST "$AT_NV2" "/scorecards/$SC_DRAFT/accept" >/dev/null

# Vô hiệu hoá TRƯỚC khi chấm: cửa cột trưởng bộ phận chỉ mở ở SELF_SCORED,
# ngoại lệ duy nhất là chủ phiếu đã nghỉ việc.
sql "UPDATE \"User\" SET \"isActive\"=false WHERE email='$EMAIL_NGHI_VIEC';" >/dev/null
R=$(goi PUT "$AT_KT" "/scorecards/$SC_DRAFT/manager-scores" "$(payload_cham_du "$SC_DRAFT")")
mong "$(ma_cua "$R")" 200 "    chấm được cột trưởng bộ phận dù chưa ai tự chấm" "$(than_cua "$R")"

R=$(goi POST "$AT_KT" "/scorecards/$SC_DRAFT/manager-submit" '{}')
mong "$(ma_cua "$R")" 400 "22. chốt phiếu người đã nghỉ, không có lý do"

R=$(goi POST "$AT_KT" "/scorecards/$SC_DRAFT/manager-submit" \
  '{"noSelfScoreReason":"Nhân viên đã nghỉ việc từ 15/08, không tự chấm được"}')
mong "$(ma_cua "$R")" 200 "23. chốt phiếu người đã nghỉ, CÓ lý do" "$(than_cua "$R")"
TT=$(sql "SELECT \"resultStatus\" || '|' || COALESCE(\"selfTotalScore\"::text,'NULL') FROM \"Scorecard\" WHERE id='$SC_DRAFT';")
[ "$TT" = "MANAGER_SCORED|NULL" ] \
  && pass "    chốt được cột trưởng bộ phận, cột tự chấm vẫn trống" \
  || fail "    sau khi chốt: $TT"
khoi_phuc_tai_khoan

# ================================================= 24–25 BAN GIÁM ĐỐC
buoc "24–25  BAN GIÁM ĐỐC CHẤM TRƯỞNG BỘ PHẬN"

R=$(goi POST "$AT_BGD" /scorecards \
  "{\"userId\":\"$U_KT\",\"periodId\":\"$KY_08\",\"emptyTemplate\":true}")
SC_TP=$(than_cua "$R" | jq_ "d['id']")
[ -n "$SC_TP" ] && pass "BGĐ sinh phiếu rỗng cho trưởng phòng" || fail "không sinh được: $(than_cua "$R")"

goi PUT "$AT_BGD" "/scorecards/$SC_TP/items" '{"items":[
  {"key":"b1","name":"Hoàn thành kế hoạch phòng","section":"BSC_WORK","weight":40,"displayOrder":1},
  {"key":"b2","name":"Quản lý nhân sự phòng","section":"BSC_WORK","weight":30,"displayOrder":2},
  {"key":"c1","name":"Chấp hành nội quy","section":"COMPLIANCE","weight":30,"displayOrder":3}
]}' >/dev/null
goi POST "$AT_BGD" "/scorecards/$SC_TP/propose" >/dev/null
goi POST "$AT_KT" "/scorecards/$SC_TP/accept" >/dev/null

# Trưởng phòng tự chấm trước — cột trưởng bộ phận chỉ mở sau SELF_SCORED.
R=$(goi PUT "$AT_BGD" "/scorecards/$SC_TP/manager-scores" "$(payload_cham_du "$SC_TP")")
mong "$(ma_cua "$R")" 409 "24a. BGĐ chấm khi trưởng phòng chưa tự chấm"
goi PUT "$AT_KT" "/scorecards/$SC_TP/self-scores" "$(payload_cham_du "$SC_TP")" >/dev/null
goi POST "$AT_KT" "/scorecards/$SC_TP/self-submit" >/dev/null

R=$(goi PUT "$AT_BGD" "/scorecards/$SC_TP/manager-scores" "$(payload_cham_du "$SC_TP")")
mong "$(ma_cua "$R")" 200 "24. EXECUTIVE chấm phiếu trưởng bộ phận" "$(than_cua "$R")"

R=$(goi POST "$AT_BGD" "/scorecards/$SC/accept")
mong "$(ma_cua "$R")" 403 "25. EXECUTIVE ký nhận thay người khác"

# ================================================= 26 ADMIN TIẾP NHẬN
buoc "26  ADMIN TIẾP NHẬN THAY HCNS"

R=$(goi POST "$AT_ADMIN" "/scorecards/$SC_DRAFT/receive")
mong "$(ma_cua "$R")" 200 "26. ADMIN tiếp nhận phiếu đã chốt điểm" "$(than_cua "$R")"
TT=$(sql "SELECT \"resultStatus\" FROM \"Scorecard\" WHERE id='$SC_DRAFT';")
NGUOI_NHAN=$(sql "SELECT u.email FROM \"Scorecard\" s JOIN \"User\" u ON u.id=s.\"receivedById\" WHERE s.id='$SC_DRAFT';")
[ "$TT" = "RECEIVED" ] && pass "    resultStatus=RECEIVED" || fail "    trạng thái=$TT"
[ "$NGUOI_NHAN" = "admin@hmico.vn" ] \
  && pass "    ScorecardEvent ghi đúng ai tiếp nhận ($NGUOI_NHAN)" \
  || fail "    receivedById=$NGUOI_NHAN"

# ================================================= 27 DỮ LIỆU CHO MÀN CHẤM ĐIỂM
buoc "27  GET /scorecards/:id/scoring — hợp đồng dữ liệu của giao diện"

R=$(goi GET "$AT_NV1" "/scorecards/$SC/scoring")
mong "$(ma_cua "$R")" 200 "27. chủ phiếu đọc được dữ liệu chấm điểm"
TH=$(than_cua "$R")

SO_ITEM=$(echo "$TH" | jq_ "len(d['items'])")
[ "${SO_ITEM:-0}" -gt 0 ] && pass "    trả về $SO_ITEM dòng tiêu chí" || fail "    items rỗng"

# Điểm và đóng góp TÍNH ĐỘNG: tiêu chí cha không lưu điểm, backend phải tính
CO_TINH_DONG=$(echo "$TH" | python3 -c "
import json,sys
d=json.load(sys.stdin)
cha={i['id'] for i in d['items'] if i['parentId'] is None}
con_cua={i['parentId'] for i in d['items'] if i['parentId']}
mot_cha_co_con=next((i for i in d['items'] if i['id'] in con_cua), None)
print('co' if mot_cha_co_con and mot_cha_co_con['managerComputed']['diem'] is not None else 'khong')" 2>/dev/null)
[ "$CO_TINH_DONG" = "co" ] \
  && pass "    tiêu chí CHA có điểm tính động (không lưu ở database)" \
  || fail "    managerComputed.diem của tiêu chí cha rỗng"

TONG_QL=$(echo "$TH" | jq_ "d['managerPreview']['tongDiem']")
XEP_LOAI=$(echo "$TH" | jq_ "d['scorecard']['grade']")
[ "$TONG_QL" = "100" ] && pass "    managerPreview.tongDiem = 100" || fail "    tổng = $TONG_QL"
[ "$XEP_LOAI" = "COMPLETED" ] && pass "    grade đã chốt = COMPLETED" || fail "    grade = $XEP_LOAI"

TRAN=$(echo "$TH" | python3 -c "
import json,sys
d=json.load(sys.stdin)
bsc=next(i for i in d['items'] if i['section']=='BSC_WORK')
cpl=next(i for i in d['items'] if i['section']=='COMPLIANCE')
print(f\"{bsc['tranDiem']}|{cpl['tranDiem']}\")" 2>/dev/null)
[ "$TRAN" = "12|3" ] \
  && pass "    trần điểm trả sẵn theo mục: BSC 12, nội quy 3" \
  || fail "    trần = $TRAN (mong đợi 12|3)"

QUYEN=$(echo "$TH" | python3 -c "
import json,sys
p=json.load(sys.stdin)['permissions']
print('|'.join(str(p[k]) for k in ['canEditSelfScores','canEditManagerScores','canReject','canReceive']))" 2>/dev/null)
[ "$QUYEN" = "False|False|False|False" ] \
  && pass "    phiếu đã RECEIVED -> giao diện không bày nút nào" \
  || fail "    permissions = $QUYEN"

R=$(goi GET "$AT_NV2" "/scorecards/$SC/scoring")
mong "$(ma_cua "$R")" 403 "    nhân viên khác đọc phiếu này -> 403"

R=$(goi GET "$AT_NV1" "/scorecards/pending-my-action")
VIEC=$(than_cua "$R" | python3 -c "
import json,sys
print(','.join(v['type'] for v in json.load(sys.stdin)))" 2>/dev/null)
mong "$(ma_cua "$R")" 200 "28. trang chủ đọc được việc cần xử lý"
echo "        việc của nhân viên: ${VIEC:-(rỗng)}"

# ================================================= TỔNG KẾT
buoc "TỔNG KẾT"
echo "  PASS: $SO_PASS    FAIL: $SO_FAIL"
[ "$SO_FAIL" -eq 0 ] || exit 1
