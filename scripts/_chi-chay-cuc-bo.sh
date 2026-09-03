#!/usr/bin/env bash
#
# Chốt chặn dùng chung cho MỌI script verify-*.sh.
#
# Các script kiểm chứng XOÁ dữ liệu thật: `DELETE FROM "Scorecard"`,
# `DELETE FROM "AuditLog"`, mở khoá mọi kỳ đang khoá. Trên máy dev đó là
# việc dọn dẹp bình thường; trỏ nhầm sang máy chủ thật thì đó là xoá sạch
# điểm KPI của 200 người — căn cứ tính lương, không có cách nào cứu.
#
# HAI LỚP, theo đúng thứ tự đó:
#
#  1. BIẾN ĐỒNG Ý TƯỜNG MINH (lớp chính). Phải đặt CHO_PHEP_XOA_DU_LIEU
#     đúng giá trị quy ước bên dưới. Đặt trong `.env.local` — file này đã
#     nằm trong .gitignore và CỐ Ý KHÔNG có trong `.env.example`, để lệnh
#     `cp .env.example .env` lúc dựng máy chủ không vô tình kéo nó theo.
#
#  2. Kiểm localhost (lớp phụ, bắt lỗi trỏ nhầm sang máy khác).
#
# Vì sao lớp 1 phải là lớp chính: trên VPS Viettel, PostgreSQL chạy CÙNG
# MÁY với ứng dụng nên `DATABASE_URL` ở đó cũng là `localhost`. Nếu chỉ
# kiểm localhost thì guard sẽ cho qua đúng vào lúc nguy hiểm nhất — nó
# phân biệt được "máy khác" nhưng không phân biệt được "máy thật".
#
# Danh sách CHO PHÉP tường minh, không phải danh sách CHẶN: máy chưa được
# khai báo thì mặc định là không được chạy.

CHUOI_DONG_Y='toi-dong-y-xoa-sach-du-lieu-may-dev'

# --- Lớp 1: biến đồng ý ---
DONG_Y="${CHO_PHEP_XOA_DU_LIEU:-}"
if [ -z "$DONG_Y" ] && [ -f .env.local ]; then
  DONG_Y=$(grep -m1 '^CHO_PHEP_XOA_DU_LIEU=' .env.local | cut -d= -f2- | tr -d '"'"'"'' | tr -d '[:space:]')
fi

if [ "$DONG_Y" != "$CHUOI_DONG_Y" ]; then
  echo "TỪ CHỐI: script kiểm chứng chỉ chạy trên máy dev đã khai báo." >&2
  echo >&2
  echo "Script này XOÁ Scorecard, ScorecardItem, AuditLog và mở khoá mọi kỳ." >&2
  echo "Để cho phép, thêm dòng sau vào .env.local (KHÔNG commit, KHÔNG đưa" >&2
  echo "vào .env.example):" >&2
  echo >&2
  echo "  CHO_PHEP_XOA_DU_LIEU=$CHUOI_DONG_Y" >&2
  exit 1
fi

# --- Lớp 2: database phải là cục bộ ---
DB_URL="${DATABASE_URL:-}"
if [ -z "$DB_URL" ] && [ -f .env ]; then
  DB_URL=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '"'"'"'')
fi

case "$DB_URL" in
  *localhost*|*127.0.0.1*) ;;
  *)
    echo "TỪ CHỐI: database không phải cục bộ." >&2
    echo "DATABASE_URL hiện tại: ${DB_URL:-(không đặt)}" >&2
    exit 1
    ;;
esac
