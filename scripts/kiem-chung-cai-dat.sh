#!/usr/bin/env bash
#
# Kiểm chứng CÀI ĐẶT HỆ THỐNG — /settings và những chỗ đọc nó.
#
# Chạy:  ./scripts/kiem-chung-cai-dat.sh
# Yêu cầu: PostgreSQL đang chạy, đã `npm run build` và `npx prisma db seed`.
#
# ⚠️ CHẠY `pg_dump` TRƯỚC LẦN ĐẦU:
#     docker exec kpi-postgres pg_dump -U kpi_dev kpi_db > /tmp/kpi-truoc-kiem-chung.sql
#   Script SỬA bảng SystemSetting (chụp lại lúc đầu, khôi phục lúc cuối),
#   tạo phiếu và chấm điểm. Mọi thứ đều được hoàn nguyên, nhưng bản sao lưu
#   là thứ duy nhất cứu được nếu script chết giữa chừng.
#
# Tự khởi động API ở cổng 3196, tự tắt và TỰ DỌN dữ liệu thử khi xong.

set -uo pipefail
cd "$(dirname "$0")/.."

# Chốt chặn: chỉ chạy khi có biến đồng ý tường minh, KHÔNG đoán môi trường
# bằng hostname hay chuỗi kết nối.
. "$(dirname "$0")/_chi-chay-cuc-bo.sh"

PORT=3197
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

khoi_phuc_cai_dat() {
  # Khôi phục NGUYÊN VĂN bảng SystemSetting và bốn mốc của mọi kỳ từ bản chụp
  # lúc đầu — đổi lịch giờ áp thẳng vào kỳ đang mở.
  sql "
    DELETE FROM \"SystemSetting\";
    INSERT INTO \"SystemSetting\" SELECT * FROM ztest_moc_setting;
    UPDATE \"Period\" p SET
      \"assignDeadline\" = m.\"assignDeadline\",
      \"selfScoreDeadline\" = m.\"selfScoreDeadline\",
      \"managerScoreDeadline\" = m.\"managerScoreDeadline\",
      \"submitDeadline\" = m.\"submitDeadline\"
      FROM ztest_moc_period_moc m WHERE m.id = p.id;
    DROP TABLE IF EXISTS ztest_moc_setting;
    DROP TABLE IF EXISTS ztest_moc_period_moc;
  " >/dev/null 2>&1
}

don_dep() {
  [ -n "${PID_API:-}" ] && kill "$PID_API" 2>/dev/null
  wait 2>/dev/null
  khoi_phuc_cai_dat
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
sql "DROP TABLE IF EXISTS ztest_moc_setting; CREATE TABLE ztest_moc_setting AS SELECT * FROM \"SystemSetting\";
     DROP TABLE IF EXISTS ztest_moc_period_moc;
     CREATE TABLE ztest_moc_period_moc AS SELECT id, \"assignDeadline\", \"selfScoreDeadline\", \"managerScoreDeadline\", \"submitDeadline\" FROM \"Period\";" >/dev/null
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


put_settings() { goi PUT "$1" /settings "$2"; }
lay_cai_dat() { curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/settings" | jq_ "$1"; }

# ================================================= 1-4 ĐỌC / PHÂN QUYỀN
buoc "1–4  ĐỌC VÀ PHÂN QUYỀN"
R=$(goi GET "$AT_NV1" /settings)
mong "$(ma_cua "$R")" 200 "1. STAFF đọc được cài đặt"
# Máy dev có thể đã được sửa tay, nên chỉ kiểm hình dạng: đủ 5 nhóm và 5 mục capNhat
MD=$(than_cua "$R" | jq_ "'|'.join(sorted(d['caiDat'])) + '#' + str(len(d['capNhat']))")
[ "$MD" = "baoMat|chamDiem|kyDanhGia|lichKy|nguongXepLoai|trongSo#6" ] && pass "    đủ 6 nhóm cài đặt và 6 mục capNhat" || fail "    nhận: $MD"

R=$(put_settings "$AT_NV1" '{"kyDanhGia":{"tuSinhHangThang":false}}')
mong "$(ma_cua "$R")" 403 "2. STAFF ghi -> 403"
R=$(put_settings "$AT_KT" '{"kyDanhGia":{"tuSinhHangThang":false}}')
mong "$(ma_cua "$R")" 403 "3. MANAGER ghi -> 403"
R=$(put_settings "$AT_HR" '{}')
mong "$(ma_cua "$R")" 400 "4. HR gửi body rỗng -> 400"

# ================================================= 5-8 KIỂM QUAN HỆ
buoc "5–8  KIỂM QUAN HỆ GIỮA CÁC GIÁ TRỊ"
R=$(put_settings "$AT_HR" '{"lichKy":{"ngayLenKpiThangSau":25,"ngayTuCham":30,"ngayTruongCham":29,"ngayGuiHcns":30}}')
mong "$(ma_cua "$R")" 400 "5. tự chấm (30) sau trưởng chấm (29) -> 400" "$(than_cua "$R")"
R=$(put_settings "$AT_HR" '{"nguongXepLoai":{"canCaiThien":90,"hoanThanh":80,"vuot":100}}')
mong "$(ma_cua "$R")" 400 "6. ngưỡng không tăng dần -> 400"
R=$(put_settings "$AT_HR" '{"lichKy":{"ngayLenKpiThangSau":25,"ngayTuCham":32,"ngayTruongCham":29,"ngayGuiHcns":30}}')
mong "$(ma_cua "$R")" 400 "7. ngày 32 -> 400"
R=$(put_settings "$AT_HR" '{"baoMat":{"batBuocDoiMatKhauLanDau":true,"khoaTamKhiSaiNhieu":true,"soLanSaiToiDa":2,"phutKhoaTam":15}}')
mong "$(ma_cua "$R")" 400 "8. số lần sai tối đa = 2 -> 400"

# ================================================= 9-11 GHI MỘT NHÓM
buoc "9–11  GHI MỘT NHÓM, NHÓM KHÁC GIỮ NGUYÊN, CÓ AUDIT"
R=$(put_settings "$AT_HR" '{"lichKy":{"ngayLenKpiThangSau":20,"ngayTuCham":22,"ngayTruongCham":26,"ngayGuiHcns":28}}')
mong "$(ma_cua "$R")" 200 "9. HR đổi lịch kỳ" "$(than_cua "$R")"
KQ=$(lay_cai_dat "f\"{d['caiDat']['lichKy']['ngayGuiHcns']}|{d['caiDat']['nguongXepLoai']['hoanThanh']}|{d['capNhat']['lichKy']['updatedByName']}\"")
[ "$KQ" = "28|90|Chuyên viên Hành chính nhân sự" ] \
  && pass "10. lịch đổi, ngưỡng giữ nguyên, ghi tên người sửa" || fail "10. nhận: $KQ"
SO=$(sql "SELECT count(*) FROM \"AuditLog\" WHERE \"entityType\"='Setting' AND \"entityId\"='lichKy' AND id NOT IN (SELECT id FROM ztest_moc_auditlog);")
[ "$SO" = "1" ] && pass "11. một dòng AuditLog Setting/lichKy" || fail "11. có $SO dòng audit"

# ================================================= 12-13 LỊCH MỚI ÁP VÀO KỲ ĐANG MỞ
buoc "12–13  ĐỔI LỊCH THÌ KỲ THÁNG ĐANG MỞ ĐỔI MỐC NGAY"
# Mục 9 vừa đặt 20/22/26/28. Kỳ chứa hôm nay phải mang mốc mới; kỳ quá khứ giữ nguyên.
KY_NAY_CODE=$(sql "SELECT code FROM \"Period\" WHERE type='MONTH' AND \"startDate\"<=CURRENT_DATE AND \"endDate\">=CURRENT_DATE;")
MOC=$(sql "SELECT to_char(\"selfScoreDeadline\",'DD') || '|' || to_char(\"managerScoreDeadline\",'DD') || '|' || to_char(\"submitDeadline\",'DD') FROM \"Period\" WHERE code='$KY_NAY_CODE';")
[ "$MOC" = "22|26|28" ] && pass "12. kỳ $KY_NAY_CODE đổi sang 22/26/28 ngay khi lưu" || fail "12. kỳ $KY_NAY_CODE có mốc $MOC (mong 22|26|28)"
MOC_CU=$(sql "SELECT to_char(\"selfScoreDeadline\",'DD') FROM \"Period\" WHERE code='2026-08';")
[ "$MOC_CU" = "25" ] && pass "13. kỳ quá khứ 2026-08 giữ mốc cũ (25)" || fail "13. kỳ 2026-08 bị đổi thành $MOC_CU"
KY_AP=$(sql "SELECT after->'kyDaApMoc' FROM \"AuditLog\" WHERE \"entityType\"='Setting' AND \"entityId\"='lichKy' AND id NOT IN (SELECT id FROM ztest_moc_auditlog) ORDER BY \"createdAt\" DESC LIMIT 1;")
echo "$KY_AP" | grep -q "$KY_NAY_CODE" && pass "    AuditLog ghi danh sách kỳ đã áp mốc: $KY_AP" || fail "    AuditLog không ghi kỳ đã áp: $KY_AP"
# Kỳ tạo tay vẫn không tự gán mốc
NAM_SAU=$(( $(date +%Y) + 1 ))
R=$(goi POST "$AT_ADMIN" /periods "{\"code\":\"ZTEST-$NAM_SAU-03\",\"name\":\"ZTEST tháng 03/$NAM_SAU\",\"type\":\"MONTH\",\"startDate\":\"$NAM_SAU-03-01\",\"endDate\":\"$NAM_SAU-03-31\"}")
mong "$(ma_cua "$R")" 201 "    tạo kỳ tay không kèm mốc"
[ "$(than_cua "$R" | jq_ "d.get('submitDeadline')")" = "None" ] \
  && pass "    kỳ tạo tay không tự gán mốc (HCNS chủ động điền)" \
  || fail "    kỳ tạo tay bị gán mốc"

# ================================================= 14-17 NGƯỠNG XẾP LOẠI
buoc "14–17  NGƯỠNG XẾP LOẠI ÁP VÀO LẦN CHỐT ĐIỂM"
# Phiếu chấm đủ thang -> 100 điểm. Mặc định: 100 = COMPLETED (≤ vượt 100).
R=$(goi POST "$AT_ADMIN" /scorecards "{\"userId\":\"$U_SD\",\"periodId\":\"$KY_08\"}")
SC=$(than_cua "$R" | jq_ "d['id']")
goi POST "$AT_KT" "/scorecards/$SC/propose" >/dev/null
goi POST "$AT_SD" "/scorecards/$SC/accept" >/dev/null
goi PUT "$AT_SD" "/scorecards/$SC/self-scores" "$(payload_cham_du "$SC")" >/dev/null
goi POST "$AT_SD" "/scorecards/$SC/self-submit" >/dev/null
goi PUT "$AT_KT" "/scorecards/$SC/manager-scores" "$(payload_cham_du "$SC")" >/dev/null
R=$(goi POST "$AT_KT" "/scorecards/$SC/manager-submit" '{}')
mong "$(ma_cua "$R")" 200 "14. chốt điểm với ngưỡng mặc định"
XL=$(than_cua "$R" | jq_ "f\"{d['scorecard']['managerTotalScore']}|{d['scorecard']['grade']}\"")
[ "$XL" = "100|COMPLETED" ] && pass "    100 -> COMPLETED" || fail "    nhận $XL"

# Hạ ngưỡng vượt xuống 95: cùng số điểm phải ra EXCEEDED ở lần chốt SAU
R=$(put_settings "$AT_ADMIN" '{"nguongXepLoai":{"canCaiThien":70,"hoanThanh":85,"vuot":95}}')
mong "$(ma_cua "$R")" 200 "15. ADMIN hạ ngưỡng vượt xuống 95"
XL_CU=$(sql "SELECT grade FROM \"Scorecard\" WHERE id='$SC';")
[ "$XL_CU" = "COMPLETED" ] && pass "16. phiếu ĐÃ chốt KHÔNG bị tính lại (vẫn COMPLETED)" || fail "16. phiếu cũ đổi thành $XL_CU"

# Phiếu thứ hai, chốt sau khi đổi ngưỡng
R=$(goi POST "$AT_ADMIN" /scorecards "{\"userId\":\"$U_NV1\",\"periodId\":\"$KY_08\"}")
SC2=$(than_cua "$R" | jq_ "d['id']")
goi POST "$AT_KT" "/scorecards/$SC2/propose" >/dev/null
goi POST "$AT_NV1" "/scorecards/$SC2/accept" >/dev/null
goi PUT "$AT_NV1" "/scorecards/$SC2/self-scores" "$(payload_cham_du "$SC2")" >/dev/null
goi POST "$AT_NV1" "/scorecards/$SC2/self-submit" >/dev/null
goi PUT "$AT_KT" "/scorecards/$SC2/manager-scores" "$(payload_cham_du "$SC2")" >/dev/null
R=$(goi POST "$AT_KT" "/scorecards/$SC2/manager-submit" '{}')
XL=$(than_cua "$R" | jq_ "d['scorecard']['grade']")
[ "$XL" = "EXCEEDED" ] && pass "17. chốt sau khi đổi ngưỡng: 100,00 -> EXCEEDED" || fail "17. nhận $XL"

# ================================================= 18-23 TRẢ LẠI PHIẾU ĐÃ CHỐT
buoc "18–23  CÀI ĐẶT 'CHO PHÉP TRẢ LẠI PHIẾU ĐÃ CHỐT'"
# Mặc định TẮT: trưởng phòng không rút lại được phiếu đã chốt, HR không trả lại được
R=$(goi POST "$AT_KT" "/scorecards/$SC2/reject" '{"reason":"Chấm nhầm, xin rút lại"}')
mong "$(ma_cua "$R")" 409 "18. TẮT: trưởng phòng trả lại phiếu MANAGER_SCORED -> 409"
R=$(goi POST "$AT_HR" "/scorecards/$SC2/reject" '{"reason":"HCNS thấy sai"}')
mong "$(ma_cua "$R")" 403 "19. TẮT: HR trả lại -> 403"
CR=$(goi GET "$AT_KT" "/scorecards/$SC2/scoring" | cut -d'|' -f2- | jq_ "d['permissions']['canReject']")
[ "$CR" = "False" ] && pass "    permissions.canReject = false" || fail "    canReject = $CR"

R=$(put_settings "$AT_ADMIN" '{"chamDiem":{"choPhepTraLaiPhieuDaChot":true}}')
mong "$(ma_cua "$R")" 200 "20. ADMIN bật cho phép trả lại phiếu đã chốt"
CR=$(goi GET "$AT_KT" "/scorecards/$SC2/scoring" | cut -d'|' -f2- | jq_ "d['permissions']['canReject']")
[ "$CR" = "True" ] && pass "    permissions.canReject = true ngay, không cần khởi động lại" || fail "    canReject = $CR"
R=$(goi POST "$AT_KT" "/scorecards/$SC2/reject" '{"reason":"Chấm nhầm, xin rút lại"}')
mong "$(ma_cua "$R")" 200 "21. BẬT: trưởng phòng trả lại phiếu đã chốt -> 200" "$(than_cua "$R")"
TT=$(than_cua "$R" | jq_ "d['scorecard']['resultStatus']")
[ "$TT" = "REJECTED" ] && pass "    phiếu về REJECTED, điểm cũ còn trong DB" || fail "    trạng thái $TT"
SO=$(sql "SELECT count(*) FROM \"ScorecardItem\" WHERE \"scorecardId\"='$SC2' AND \"managerScore\" IS NOT NULL;")
[ "${SO:-0}" -gt 0 ] && pass "    điểm trưởng phòng đã chấm KHÔNG bị xoá ($SO ô)" || fail "    điểm bị xoá"

# Phiếu 1 đã RECEIVED: HR trả lại được khi bật
R=$(goi POST "$AT_HR" "/scorecards/$SC/receive")
mong "$(ma_cua "$R")" 200 "22. HCNS tiếp nhận phiếu 1"
R=$(goi POST "$AT_HR" "/scorecards/$SC/reject" '{"reason":"Tiếp nhận nhầm, đề nghị chấm lại"}')
mong "$(ma_cua "$R")" 200 "23. BẬT: HR trả lại phiếu ĐÃ TIẾP NHẬN -> 200" "$(than_cua "$R")"
SK=$(sql "SELECT count(*) FROM \"ScorecardEvent\" WHERE \"scorecardId\"='$SC' AND action='REJECT';")
[ "$SK" = "1" ] && pass "    có dòng ScorecardEvent REJECT kèm lý do" || fail "    $SK dòng REJECT"

# ================================================= 24-25 MẬT KHẨU LẦN ĐẦU
buoc "24–25  'BẮT BUỘC ĐỔI MẬT KHẨU LẦN ĐẦU'"
R=$(put_settings "$AT_ADMIN" '{"baoMat":{"batBuocDoiMatKhauLanDau":false,"khoaTamKhiSaiNhieu":true,"soLanSaiToiDa":10,"phutKhoaTam":15}}')
mong "$(ma_cua "$R")" 200 "24. tắt bắt buộc đổi mật khẩu lần đầu"
R=$(goi POST "$AT_ADMIN" /users '{"employeeCode":"ZTEST-CD1","email":"ztest.caidat1@hmico.vn","fullName":"ZTEST Cài đặt","role":"STAFF"}')
MCP=$(than_cua "$R" | jq_ "d.get('mustChangePassword')")
[ "$MCP" = "False" ] && pass "25. tài khoản mới có mustChangePassword=false" || fail "25. mustChangePassword=$MCP"

# ================================================= 26 KHÓA TẠM THEO CÀI ĐẶT
buoc "26  KHOÁ TẠM: NGƯỠNG 3 LẦN"
R=$(put_settings "$AT_ADMIN" '{"baoMat":{"batBuocDoiMatKhauLanDau":true,"khoaTamKhiSaiNhieu":true,"soLanSaiToiDa":3,"phutKhoaTam":15}}')
mong "$(ma_cua "$R")" 200 "    đặt ngưỡng 3 lần"
for _ in 1 2 3 4; do
  curl -s -o /dev/null -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d '{"email":"ztest.caidat1@hmico.vn","password":"sai-roi"}'
done
MA=$(ma -X POST "$API/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"ztest.caidat1@hmico.vn","password":"sai-roi"}')
[ "$MA" = "423" ] || [ "$MA" = "429" ] \
  && pass "26. sai lần thứ 5 với ngưỡng 3 -> bị khoá (HTTP $MA)" \
  || fail "26. sai lần thứ 5 -> HTTP $MA (mong 423/429)"

# ================================================= 27-29 TRỌNG SỐ HAI MỤC
buoc "27–29  TRỌNG SỐ HAI MỤC LẤY TỪ CÀI ĐẶT (không bó cứng 70/30)"
R=$(put_settings "$AT_HR" '{"trongSo":{"bscWork":60,"compliance":30}}')
mong "$(ma_cua "$R")" 400 "27. 60 + 30 ≠ 100 -> 400"
# Mẫu chức danh tổng 60: mặc định 70 thì xuất bản sai; cài 60/40 thì được
R=$(goi POST "$AT_ADMIN" /kpi-templates "{\"code\":\"ZTEST-TS60\",\"name\":\"Thử tỉ lệ 60\",\"jobTitleId\":\"$(sql "SELECT id FROM \"JobTitle\" WHERE code='KT-KSTK';")\"}")
ID_TS=$(than_cua "$R" | jq_ "d['id']")
goi PUT "$AT_ADMIN" "/kpi-templates/$ID_TS/items" '{"items":[{"key":"a","parentKey":null,"name":"Tiến độ","section":"BSC_WORK","weight":60,"displayOrder":1}]}' >/dev/null
R=$(goi POST "$AT_ADMIN" "/kpi-templates/$ID_TS/publish")
mong "$(ma_cua "$R")" 400 "28. mặc định 70/30: mẫu tổng 60 không xuất bản được"
R=$(put_settings "$AT_HR" '{"trongSo":{"bscWork":60,"compliance":40}}')
mong "$(ma_cua "$R")" 200 "    HR đặt tỉ lệ 60/40"
R=$(goi POST "$AT_ADMIN" "/kpi-templates/$ID_TS/publish")
mong "$(ma_cua "$R")" 200 "29. sau khi đặt 60/40: mẫu tổng 60 xuất bản được ngay, không khởi động lại" "$(than_cua "$R")"
WR=$(curl -s -H "Authorization: Bearer $AT_ADMIN" "$API/kpi-templates" | jq_ "next((t['weightRequired'] for t in d if t['id']=='$ID_TS'), None)")
[ "$WR" = "60" ] && pass "    danh sách mẫu trả weightRequired=60" || fail "    weightRequired=$WR"
sql "DELETE FROM \"KpiTemplateItem\" WHERE \"templateId\"='$ID_TS'; DELETE FROM \"AuditLog\" WHERE \"entityId\"='$ID_TS'; DELETE FROM \"KpiTemplate\" WHERE id='$ID_TS';" >/dev/null

# ================================================= TỔNG KẾT
buoc "TỔNG KẾT"
echo "  PASS: $SO_PASS    FAIL: $SO_FAIL"
[ "$SO_FAIL" -eq 0 ] || exit 1
