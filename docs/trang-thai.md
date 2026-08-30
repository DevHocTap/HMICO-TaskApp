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
- `prisma/seed.ts` viết lại: cây 4 tầng thật (14 phòng ban), 7 chức danh,
  9 người dùng, **mật khẩu băm argon2**, 4 kỳ, mẫu hệ thống COMPLIANCE
- `argon2@0.45.1` đã cài (cố định phiên bản), chạy native trên WSL2
- **Tuần 1–2 `auth` XONG CẢ HAI ĐẦU** (30/08):
  - `POST /auth/login` (5 lần/phút/IP + khoá tạm email sai >10 lần/15 phút),
    `/auth/refresh` (xoay vòng, thu hồi token cũ trong cùng giao dịch),
    `/auth/logout` (luôn 204, 10 lần/phút/IP), `/auth/logout-all`,
    `/auth/change-password`, `/auth/me`
  - `JwtAuthGuard` + `RolesGuard` toàn cục; `@Public()`, `@Roles()`,
    `@CurrentUser()`, `@RateLimit()`
  - `getAccessibleDepartmentIds()` — hàm phân quyền duy nhất, đã nối vào
    `GET /departments/tree` và `GET /departments/:id`
  - CORS giới hạn theo `CORS_ORIGINS`, không mở cho mọi nguồn
  - `scripts/verify-auth.sh`: **35 kiểm tra bằng curl trên hệ thống chạy thật**
- **Frontend `web/` — khung + ba màn hình** (30/08):
  - Vite + React + Ant Design (locale tiếng Việt), TanStack Query,
    React Router, axios
  - Access token trong bộ nhớ, refresh token ở localStorage
  - Interceptor tự làm mới token, **single-flight** để nhiều 401 cùng lúc
    chỉ gọi `/auth/refresh` một lần
  - `/login`, `/change-password` (có thanh độ mạnh mật khẩu), `/` (tạm)
- **Chuyển sang ESM + Vitest** (30/08): `"type": "module"`, import tương đối
  có đuôi `.js`, Vitest + SWC (esbuild không hỗ trợ `emitDecoratorMetadata`
  nên DI của NestJS sẽ hỏng nếu thiếu SWC). Bỏ Jest, `ts-node`,
  `tsconfig-paths`. Seed chạy thẳng `node prisma/seed.ts` — Node 22 tự bóc
  kiểu TypeScript. **Hiện: 55 test unit + 3 e2e + 35 kiểm tra curl.**

## Đang làm

**Tuần 3–4: `org`** — chưa bắt đầu. Bị chặn bởi file Excel nhân sự của HR.

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
