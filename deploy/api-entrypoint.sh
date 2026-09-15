#!/bin/sh
# Khởi động API: đợi database, áp migration còn thiếu, rồi chạy.
# `migrate deploy` KHÔNG hỏi gì — đó là lý do phải có bản sao lưu trước mỗi
# lần cập nhật (docs/trien-khai.md).
set -e
echo "[api] đợi database..."
for i in $(seq 1 30); do
  if npx prisma migrate deploy >/tmp/migrate.log 2>&1; then
    cat /tmp/migrate.log | tail -5
    break
  fi
  if [ "$i" = "30" ]; then echo "[api] không nối được database sau 30 lần:"; cat /tmp/migrate.log; exit 1; fi
  sleep 2
done
echo "[api] chạy"
exec node dist/main.js
