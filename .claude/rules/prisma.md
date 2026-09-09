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
- Kiểu `Decimal` theo đúng thứ đang lưu — KHÔNG dùng một kiểu cho tất cả:
  - **Điểm chấm và tổng điểm**: `@db.Decimal(6, 2)` (`selfScore`,
    `managerScore`, `selfTotalScore`, `managerTotalScore`). Điểm chỉ có 2
    chữ số thập phân; để rộng hơn là cho lưu những giá trị mà giao diện
    không hiện đủ, rồi số trên màn hình khác số trong database.
  - **Trọng số**: `@db.Decimal(5, 2)` — nằm trong khoảng 0–100.
  - **Số liệu thô của hướng B** (`targetValue`, `minValue`): `@db.Decimal(18, 4)`.
    Đây mới là chỗ cần dải rộng: mục tiêu có thể là tiền, là tỷ lệ, là số lần.
  - Số tiền: `@db.Decimal(18, 4)`.
- **Không bao giờ dùng `Float` cho tiền hay điểm**, và không tính toán bằng
  `number` ở bước trung gian: `28.4 + 35.8 + 35.8 = 99.99999999999999`.