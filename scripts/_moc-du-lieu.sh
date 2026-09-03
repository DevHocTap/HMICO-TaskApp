#!/usr/bin/env bash
#
# Mốc dữ liệu — để script kiểm chứng chỉ xoá ĐÚNG thứ nó tạo ra.
#
# Vì sao cần: `Scorecard` và `AuditLog` KHÔNG có cột nào đánh dấu được.
# Script tạo chúng qua API, cho các tài khoản seed thật, nên không gắn được
# tiền tố ZTEST như với `User`, `Period`, `KpiTemplate`. Không có mốc thì
# cách duy nhất để dọn là `DELETE` không điều kiện — và khi đó phiếu người
# dùng tạo tay lúc thử nghiệm cũng bay theo.
#
# Cách làm: chụp lại danh sách id CÓ TRƯỚC khi script chạy vào bảng tạm,
# rồi chỉ xoá những dòng KHÔNG có trong danh sách đó. Dòng nào tồn tại
# trước khi script bắt đầu thì không bao giờ bị đụng tới.
#
# Riêng `Period.isLocked` thì KHÔI PHỤC về đúng trạng thái cũ, không mở
# khoá tất cả: kỳ người dùng cố ý khoá phải giữ nguyên khoá.
#
# Yêu cầu: hàm `sql()` đã được định nghĩa trước khi source file này.

chup_moc_du_lieu() {
  sql "
    DROP TABLE IF EXISTS ztest_moc_scorecard;
    DROP TABLE IF EXISTS ztest_moc_auditlog;
    DROP TABLE IF EXISTS ztest_moc_period;
    CREATE TABLE ztest_moc_scorecard AS SELECT id FROM \"Scorecard\";
    CREATE TABLE ztest_moc_auditlog  AS SELECT id FROM \"AuditLog\";
    CREATE TABLE ztest_moc_period    AS
      SELECT id, \"isLocked\", \"lockedAt\", \"lockedById\" FROM \"Period\";
  " >/dev/null 2>&1
}

# Điều kiện dùng lại trong các lệnh xoá giữa script.
readonly PHIEU_CUA_SCRIPT='id NOT IN (SELECT id FROM ztest_moc_scorecard)'

# Xoá mọi phiếu script tạo ra, kèm item và sự kiện của chúng.
# Nhận thêm điều kiện lọc phụ, ví dụ: xoa_phieu_cua_script "\"periodId\"='abc'"
xoa_phieu_cua_script() {
  local them="${1:-TRUE}"
  sql "
    DELETE FROM \"ScorecardEvent\" WHERE \"scorecardId\" IN
      (SELECT id FROM \"Scorecard\" WHERE $PHIEU_CUA_SCRIPT AND ($them));
    DELETE FROM \"ScorecardItem\" WHERE \"scorecardId\" IN
      (SELECT id FROM \"Scorecard\" WHERE $PHIEU_CUA_SCRIPT AND ($them));
    DELETE FROM \"Scorecard\" WHERE $PHIEU_CUA_SCRIPT AND ($them);
  " >/dev/null 2>&1
}

# Xoá nhật ký do script sinh ra. Nhận thêm điều kiện lọc phụ.
xoa_auditlog_cua_script() {
  local them="${1:-TRUE}"
  sql "DELETE FROM \"AuditLog\"
       WHERE id NOT IN (SELECT id FROM ztest_moc_auditlog) AND ($them);" >/dev/null 2>&1
}

# Trả trạng thái khoá kỳ về đúng như trước khi script chạy.
khoi_phuc_khoa_ky() {
  sql "
    UPDATE \"Period\" p
       SET \"isLocked\"=m.\"isLocked\", \"lockedAt\"=m.\"lockedAt\", \"lockedById\"=m.\"lockedById\"
      FROM ztest_moc_period m
     WHERE p.id=m.id AND p.\"isLocked\" IS DISTINCT FROM m.\"isLocked\";
  " >/dev/null 2>&1
}

bo_moc_du_lieu() {
  sql "
    DROP TABLE IF EXISTS ztest_moc_scorecard;
    DROP TABLE IF EXISTS ztest_moc_auditlog;
    DROP TABLE IF EXISTS ztest_moc_period;
  " >/dev/null 2>&1
}
