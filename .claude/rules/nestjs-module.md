---
paths:
  - src/modules/**
---

# Quy tắc khi viết module NestJS

- Ba lớp bắt buộc: `controller` → `service` → `dto`. Controller không
  được gọi database trực tiếp.
- Mọi dữ liệu đầu vào phải có DTO với `class-validator`. Không nhận
  `any` hay object trần.
- Đặt tên biến, hàm, class bằng tiếng Anh. Comment và thông báo lỗi trả
  về cho người dùng bằng tiếng Việt.
- Không dùng `any` trừ khi thật sự không tránh được, kèm comment giải thích.
- Ném lỗi bằng exception có sẵn của NestJS (`NotFoundException`,
  `ForbiddenException`...), không trả về mã lỗi thủ công.
- Module `org/` không được chứa bất kỳ logic nào liên quan KPI.