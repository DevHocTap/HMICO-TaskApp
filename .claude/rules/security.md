---
paths:
  - src/modules/auth/**
  - src/common/**
---

# Quy tắc bảo mật

- Băm mật khẩu bằng **argon2**. Không bao giờ lưu dạng thường, kể cả
  trong seed hay test.
- Kiểm tra phân quyền bằng Guard ở backend. Ẩn nút ở giao diện không
  phải là bảo mật.
- Bốn vai trò:
  - `ADMIN` — toàn quyền hệ thống
  - `EXECUTIVE` — xem toàn công ty, không sửa
  - `MANAGER` — chỉ phòng mình và cấp dưới
  - `STAFF` — chỉ dữ liệu bản thân
- Kiểm tra quyền phải xét cả **quan hệ dữ liệu**, không chỉ vai trò:
  MANAGER phòng A không được xem KPI phòng B dù cùng vai trò.
- Không ghi mật khẩu, token, hay dữ liệu nhạy cảm vào log.
- Token JWT thời hạn ngắn, kèm refresh token.
- Không commit `.env`. Mọi cấu hình lấy từ biến môi trường.