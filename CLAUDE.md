# Phần mềm quản lý KPI nội bộ — Công ty Hoàng Minh

Hệ thống giao KPI theo phương pháp BSC cho khoảng 200 nhân sự.
Giai đoạn 2 sẽ mở rộng sang chấm công ca cho HR.

**Chỉ có một lập trình viên duy nhất duy trì dự án này.** Ưu tiên code
dễ đọc, dễ bảo trì hơn code ngắn gọn hay "thông minh".

## Giao tiếp

- Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vấn đề.
- Giải thích ngắn khi dùng thuật ngữ chuyên môn.

## Stack (đã chốt)

**Backend:** NestJS 12 + TypeScript (**ESM**) · Prisma 6 · PostgreSQL 16
(Docker) · **Vitest**
**Frontend (`web/`):** Vite + React + TypeScript · **Ant Design** ·
TanStack Query · React Router · axios

Dev: WSL2 Ubuntu 24.04. Triển khai sau: Viettel Cloud, Ubuntu 24.04.

- **Không nâng Prisma lên 7 hoặc 8** — CLI đã đổi cú pháp.
- **Frontend dùng Ant Design. Không dùng Tailwind hay shadcn/ui.**
- Luôn cố định số phiên bản khi cài gói. Không dùng bản rc/beta/alpha.
- Không tự ý nâng cấp thư viện.
- Dự án là **ESM**: import tương đối trong `src/` phải có đuôi `.js`.
  NestJS 12 là ESM thuần nên không quay lại CommonJS được.

## Ràng buộc tuyệt đối

- Mật khẩu băm bằng argon2. Không lưu dạng thường, kể cả trong seed/test.
- Kiểm tra phân quyền ở backend (Guard), không chỉ ẩn nút ở giao diện.
- Số liệu tiền và điểm dùng `Decimal`, không dùng `Float`.
- Module `org/` (phòng ban, chức danh, nhân viên) phải độc lập với các
  module KPI (`kpi-template/`, `scorecard/`, `scoring/`). Logic KPI không
  được rò rỉ vào `org/` — giai đoạn 2 sẽ thêm `attendance/` dùng chung lõi.
- Không commit `.env`.
- **Không dùng `dangerouslySetInnerHTML`, không chèn HTML thô từ dữ liệu
  người dùng.** Refresh token đang nằm ở `localStorage` nên một lỗ XSS là
  mất phiên đăng nhập 7 ngày — xem `docs/no-ky-thuat.md`.

## Tài liệu

Đọc khi cần, không nạp sẵn:

- `docs/kien-truc.md` — cấu trúc thư mục, phân chia module
- `docs/mo-hinh-du-lieu.md` — giải thích schema và ràng buộc nghiệp vụ
- `docs/quyet-dinh-cong-nghe.md` — vì sao chọn từng công nghệ

## Trạng thái

@docs/trang-thai.md
@docs/no-ky-thuat.md

## Cách làm việc

- Tính năng lớn: trình bày hướng tiếp cận, chờ xác nhận rồi mới viết code.
- Làm từng bước nhỏ, mỗi bước chạy được rồi mới sang bước sau.
- Nếu thấy thiết kế hiện tại có vấn đề, nói thẳng thay vì làm theo.