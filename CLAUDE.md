# Phần mềm quản lý KPI nội bộ — Công ty Hoàng Minh

Hệ thống giao KPI theo phương pháp BSC cho khoảng 200 nhân sự.
Giai đoạn 2 sẽ mở rộng sang chấm công ca cho HR.

**Chỉ có một lập trình viên duy nhất duy trì dự án này.** Ưu tiên code
dễ đọc, dễ bảo trì hơn code ngắn gọn hay "thông minh".

## Giao tiếp

- Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vấn đề.
- Giải thích ngắn khi dùng thuật ngữ chuyên môn.

## Stack (đã chốt)

NestJS + TypeScript (CommonJS) · Prisma 6 · PostgreSQL 16 (Docker) · Jest
Dev: WSL2 Ubuntu 24.04. Triển khai sau: Viettel Cloud, Ubuntu 24.04.

- **Không nâng Prisma lên 7 hoặc 8** — CLI đã đổi cú pháp.
- Luôn cố định số phiên bản khi cài gói. Không dùng bản rc/beta/alpha.
- Không tự ý nâng cấp thư viện.

## Ràng buộc tuyệt đối

- Mật khẩu băm bằng argon2. Không lưu dạng thường, kể cả trong seed/test.
- Kiểm tra phân quyền ở backend (Guard), không chỉ ẩn nút ở giao diện.
- Số liệu tiền và điểm dùng `Decimal`, không dùng `Float`.
- Module `org/` (phòng ban + nhân viên) phải độc lập với `kpi/`.
  Logic KPI không được rò rỉ vào `org/`.
- Không commit `.env`.

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