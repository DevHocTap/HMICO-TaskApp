---
paths:
  - prisma/**
  - src/**/*.service.ts
---

# Quy tắc khi làm việc với Prisma

- Mọi thay đổi schema phải qua `npx prisma migrate dev --name <ten>`.
  Không sửa trực tiếp database.
- Ràng buộc CHECK viết bằng raw SQL trong file migration (Prisma chưa hỗ trợ trực tiếp).
- Tránh N+1 query: dùng `include` hoặc lấy một lần rồi ghép trong code.
- Số tiền và điểm: `@db.Decimal(18, 4)`.