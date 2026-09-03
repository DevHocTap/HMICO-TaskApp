#!/usr/bin/env bash
#
# Chốt chặn dùng chung cho MỌI script verify-*.sh.
#
# Các script kiểm chứng XOÁ dữ liệu thật: `DELETE FROM "Scorecard"`,
# `DELETE FROM "AuditLog"`, mở khoá mọi kỳ đang khoá. Trên máy dev đó là
# việc dọn dẹp bình thường; trỏ nhầm sang máy chủ thật thì đó là xoá sạch
# điểm KPI của 200 người — căn cứ tính lương, không có cách nào cứu.
#
# Chỉ cho chạy khi DATABASE_URL trỏ localhost hoặc 127.0.0.1.
# Source từ đầu mỗi script, NGAY SAU lệnh cd về thư mục dự án.

DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ] && [ -f .env ]; then
  DB_URL=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"'"'"'')
fi

case "$DB_URL" in
  *localhost*|*127.0.0.1*) ;;
  *)
    echo "TỪ CHỐI: script kiểm chứng chỉ chạy trên database cục bộ." >&2
    echo "DATABASE_URL hiện tại: ${DB_URL:-(không đặt)}" >&2
    exit 1
    ;;
esac
