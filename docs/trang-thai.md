# Trạng thái dự án

> Cập nhật mỗi khi hoàn thành một mảng việc.
> Đây là trí nhớ của Claude Code giữa các phiên — để lạc hậu là nó sẽ
> làm lại thứ đã có hoặc bỏ sót thứ đang dở.

Cập nhật lần cuối: 30/08/2026

**Mốc bàn giao: một phòng Kỹ thuật chạy thật tháng 11/2026.**
Nguồn sự thật nghiệp vụ: `docs/quy-tac-nghiep-vu.md`.

## Đã xong

- Môi trường dev: WSL2 Ubuntu 24.04 + Docker Desktop + PostgreSQL 16
- `docker-compose.yml` cho PostgreSQL local
- `PrismaService` với `@Global()`, đã nối vào `app.module.ts`
- Module `org`: `GET /departments/tree` trả về cây phòng ban lồng nhau
- **Chốt toàn bộ quy tắc nghiệp vụ** dựa trên biểu mẫu thật
  `BM.01-KPI.KYTHUAT` — xem `docs/quy-tac-nghiep-vu.md`
- **Schema thế hệ 2** (30/08): 11 bảng, migration `init` dựng lại từ đầu
  - Thêm `Scorecard` + `ScorecardItem` — phiếu KPI là thực thể riêng,
    trạng thái nằm ở cấp phiếu chứ không rải trên từng dòng
  - `ScorecardItem` **chụp lại** nội dung KPI: sửa mẫu không làm đổi
    phiếu đã chấm
  - Bỏ `KpiDefinition`, `KpiAssignment`, `KpiResult`, `Approval`
  - Thêm `JobTitle`, `KpiTemplate`, `KpiTemplateItem`, `RefreshToken`,
    `ScorecardEvent`
  - `Department.managerId`, `Period.parentId` + `dueDate`, vai trò `HR`
- `prisma/seed.ts` viết lại: cây 4 tầng thật (14 phòng ban), 6 chức danh,
  8 người dùng, **mật khẩu băm argon2**, 4 kỳ, mẫu hệ thống COMPLIANCE
- `argon2@0.45.1` đã cài (cố định phiên bản), chạy native trên WSL2
- **Chuyển sang ESM + Vitest** (30/08): `"type": "module"`, import tương đối
  có đuôi `.js`, Vitest + SWC (esbuild không hỗ trợ `emitDecoratorMetadata`
  nên DI của NestJS sẽ hỏng nếu thiếu SWC). Bỏ Jest, `ts-node`,
  `tsconfig-paths`. Seed chạy thẳng `node prisma/seed.ts` — Node 22 tự bóc
  kiểu TypeScript. **7 test unit + 1 e2e đều chạy qua.**

## Đang làm

**Tuần 1–2: `auth`** — phần backend đã xong và chạy được. Còn màn đăng nhập
+ đổi mật khẩu lần đầu (frontend).

Đã có:
- `POST /auth/login` — trả access token (15') + refresh token (7 ngày) + hồ sơ
- `POST /auth/refresh` — xoay vòng, thu hồi token cũ ngay trong cùng giao dịch
- `POST /auth/logout`, `POST /auth/change-password`, `GET /auth/me`
- `JwtAuthGuard` + `RolesGuard` đăng ký **toàn cục**: mặc định mọi endpoint
  đều cần đăng nhập, muốn mở phải gắn `@Public()`. Quên gắn Guard ở
  controller mới sẽ không tạo lỗ hổng.
- `@CurrentUser()`, `@Roles()`, `@Public()`
- `DepartmentScopeService.getAccessibleDepartmentIds()` trong `org/` —
  hàm phân quyền dùng chung, đi theo cây phòng ban
- Kiểm tra biến môi trường lúc khởi động, `.env.example`
- 35 test unit + 3 e2e

## Kế hoạch — lát cắt dọc, mỗi tuần có thứ mở lên xem được

| Tuần | Lát cắt |
|---|---|
| 1–2 | `auth`: argon2, JWT 15', RefreshToken 7 ngày có xoay vòng, `RoleGuard`, `getAccessibleDepartmentIds` + màn đăng nhập, đổi mật khẩu lần đầu |
| 3–4 | `org`: phòng ban, chức danh, nhân viên, import Excel + màn quản trị |
| 5–6 | `kpi-template`: một màn hình tạo cây hai cấp + nhập 4 mẫu phòng Kỹ thuật |
| 7–8 | `scorecard`: giao KPI tháng, ký nhận, sao chép từ kỳ trước |
| 9–10 | `scoring`: hai cột chấm, tính điểm, xếp loại |
| **11** | **Đối chiếu Excel tháng 08 thật — số phải khớp tuyệt đối** |
| 12 | "Việc của tôi", theo dõi tiến độ nộp, xuất Excel |
| 13+ | Chạy thật một phòng, sửa theo phản hồi |

## Chưa quyết

- Trưởng chi nhánh HCM có xem được dữ liệu Hà Nội không (mặc định: không)
- Tên bốn chức danh thật phòng Kỹ thuật — seed đang để tạm
- Số lượng nhân sự thực tế từng phòng
- Định dạng file Excel nhân sự của HR

## Việc cần làm ngoài code

- [ ] Xin file Excel nhân sự của HR (chặn tuần 3–4)
- [ ] Xin bốn file Excel KPI phòng Kỹ thuật (chặn tuần 5–6)
- [ ] Trình sếp mốc mới: một phòng chạy thật tháng 11 thay vì toàn công ty
      ngày 31/12. **Làm sớm nhất** — đổi mốc lúc còn 4 tháng là điều chỉnh
      kế hoạch, đổi mốc vào tháng 12 là báo cáo thất bại.
