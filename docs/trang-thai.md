# Trạng thái dự án

> Cập nhật mỗi khi hoàn thành một mảng việc.
> Đây là trí nhớ của Claude Code giữa các phiên — để lạc hậu là nó sẽ
> làm lại thứ đã có hoặc bỏ sót thứ đang dở.

Cập nhật lần cuối: 04/09/2026

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
- **Tuần 3–4 `org` XONG CẢ HAI ĐẦU** (30/08):
  - 13 endpoint: phòng ban (CRUD, vô hiệu hoá mềm), chức danh, nhân viên
    (phân trang, lọc, tìm kiếm, đặt lại mật khẩu, bật/tắt)
  - Mọi endpoint đọc đều đi qua `getAccessibleDepartmentIds`
  - `UserResponse` khai tường minh — không bao giờ lọt `passwordHash`
  - Chặn vòng lặp cây phòng ban và vòng lặp `User.managerId`
  - HR không thao tác được trên tài khoản ADMIN; không ai tự đổi vai trò
    của chính mình
  - Chặn vô hiệu hoá / chuyển phòng người đang là trưởng bộ phận
  - `AuditService` nối vào toàn bộ thao tác của `org`
  - `prisma/bootstrap.ts` — khởi tạo hệ thống thật, chỉ 1 ADMIN
  - Ba màn hình quản trị: cây phòng ban (có cảnh báo thiếu trưởng bộ phận),
    chức danh, nhân viên
  - `scripts/verify-org.sh`: **46 kiểm tra bằng curl**
- **Tuần 5–6 `kpi-template` XONG CẢ HAI ĐẦU** (30/08):
  - Bỏ hẳn `KpiDefinition`; `KpiTemplateItem` tự chứa nội dung
  - Chín endpoint, kiểm trọng số dồn vào lúc xuất bản, nháp cho phép lệch
  - Kiểm theo LOẠI MẪU: mẫu chức danh 70, mẫu hệ thống 30
  - Mọi phép cộng dùng Decimal ở backend, số nguyên đơn vị ở frontend
  - `PUT :id/items` lưu cả cây một transaction; sửa mẫu đã xuất bản thì
    tự về DRAFT
  - Mẫu hệ thống có endpoint riêng, chỉ ADMIN; không ai xoá được
  - **Bốn mẫu thật của phòng Kỹ thuật đã nhập từ Excel**, cả bốn xuất bản
    được (file gốc đúng 70/100)
  - Màn danh sách mẫu + màn soạn cây hai cấp: thanh tổng trọng số cập nhật
    ngay khi gõ, nút chia đều, xem trước theo bố cục biểu mẫu
  - `scripts/verify-kpi-template.sh`: **35 kiểm tra**
- **Chuyển sang ESM + Vitest** (30/08): `"type": "module"`, import tương đối
  có đuôi `.js`, Vitest + SWC (esbuild không hỗ trợ `emitDecoratorMetadata`
  nên DI của NestJS sẽ hỏng nếu thiếu SWC). Bỏ Jest, `ts-node`,
  `tsconfig-paths`. Seed chạy thẳng `node prisma/seed.ts` — Node 22 tự bóc
  kiểu TypeScript. **Hiện: 130 test backend + 12 test frontend + 3 e2e + 35 + 60 + 35 kiểm tra curl.**

## Đang làm

**Lát cắt 4 — `scorecard`: XONG CẢ HAI ĐẦU (04/09).**

Sau buổi chốt 03/09 với HCNS và ban giám đốc, đã áp:
- Lịch trong tháng đổi sang **bốn mốc 25 / 25 / 29 / 30** (mục 5.5 viết
  lại). Lịch cũ "ngày 02 tháng kế tiếp" sai hẳn một tháng.
- **Chỉ còn MỘT cấp quản lý.** Bỏ hai đơn vị Tổ Shop Drawing và Tổ Bảo trì;
  Shop Drawing, Bảo hành, Phó phòng đều là chức danh. Không còn phòng nào
  bị chặn (trước là 3).
- `ADMIN` và `EXECUTIVE` không có phiếu KPI. BGĐ vẫn chấm trưởng phòng.
- Khoá/mở kỳ mở cho `HR` và `EXECUTIVE`.

Đã làm tiếp sau đó:
- **Trưởng phòng tự soạn KPI trên phiếu** (câu C3): `MANAGER` sinh được
  phiếu rỗng, bỏ chặn "chức danh đã có mẫu thì phải dùng mẫu".
- **`GET /scorecards/assignment-board`** — MỘT dòng cho MỖI nhân viên, kể
  cả người CHƯA có phiếu. `GET /scorecards` chỉ trả phiếu đã có nên không
  dùng được cho màn giao KPI. Ban giám đốc không lọc phòng thì mặc định
  thấy trưởng bộ phận toàn công ty.

**Backend lát cắt 4 xong hẳn.**

Giao diện đã có (04/09):
- Nhãn thanh trên: tài khoản quản trị ghi "Tài khoản kỹ thuật — không
  thuộc phòng ban" thay vì "Chưa gán phòng ban".
- Menu tách hai nhóm **KPI** và **Quản trị**. STAFF trước đây không có mục
  nào, nay có "Phiếu KPI của tôi".
- **`/kpi/my`** — phiếu của chính mình, cây tiêu chí hai cấp, ký nhận và
  nêu ý kiến kèm lý do.
- **`/kpi/assign`** — bảng giao KPI: chọn kỳ và phòng, người chưa có phiếu
  lên đầu; sinh hàng loạt, chép từ kỳ trước, gửi ký hàng loạt. BGĐ không
  lọc phòng thì mặc định thấy trưởng bộ phận toàn công ty.
- **`/kpi/scorecards/:id`** — chi tiết phiếu: trưởng phòng tự thêm/sửa cây
  KPI ngay trên phiếu, thanh tổng trọng số cập nhật khi gõ, gửi đi ký, gửi
  lại kèm ghi chú bắt buộc khi phiếu bị nêu ý kiến, và lịch sử phiếu.

- **Trang chủ "Việc của tôi"** — đọc `pending-my-action`, hiện thẻ "Quá hạn"
  hoặc "Còn N ngày". Hạn lấy từ `Period.assignDeadline` thật (ngày 25 tháng
  trước), đóng nợ ghi ở Câu 0c.

- **`/kpi/periods`** — danh sách kỳ kèm cả bốn mốc, số phiếu, nguồn (tự
  sinh hay tạo tay); chốt sổ và mở lại (HCNS, BGĐ, quản trị); tạo kỳ thủ
  công (quản trị, HCNS). Nút chốt sổ chỉ hiện ở kỳ THÁNG.
- **Nút "Tạo phiếu" trên từng dòng** ở màn giao KPI. Đây là đường DUY NHẤT
  cho hai ca mà nút hàng loạt bó tay: ban giám đốc giao KPI cho trưởng bộ
  phận (`batch` không mở cho EXECUTIVE), và chức danh chưa có mẫu KPI
  (trưởng phòng, phó phòng). Thử sinh từ mẫu trước, backend từ chối vì
  chưa có mẫu thì hỏi người dùng có tạo phiếu trống không.

**LÁT CẮT 4 XONG CẢ HAI ĐẦU.** Việc tiếp: lát cắt 5 — chấm điểm.

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

Ngày 03/09/2026 HCNS và ban giám đốc đã chốt 15 câu — xem
`docs/no-ky-thuat.md`. Còn treo:

- **KPI 3 năm giao cho phòng ban, băm nhỏ xuống năm / quý / tháng.**
  Giai đoạn 1 đã cắt KPI cấp phòng ban; câu trả lời mở lại. Lớn ngang cả
  lát cắt 4 cộng 5 — **làm sau mốc tháng 11**, không kịp trước.
- **HCNS và BGĐ sửa điểm trưởng phòng đã chấm, kèm highlight.** Chưa có
  trong schema. Đề xuất: thêm cột điểm điều chỉnh riêng, KHÔNG ghi đè điểm
  gốc — điểm là căn cứ tính lương, mất bản gốc là mất bằng chứng.
- **Đơn vị đo cho ô Mục tiêu** (%, số nguyên, triệu đồng) và ngưỡng
  Min/Max — điều kiện bắt buộc trước khi bật tính điểm tự động.
- **Mốc nghiệm thu thay thế.** Bốn file Excel chỉ là mẫu tham khảo nên mốc
  "khớp tuyệt đối với Excel" không còn nghĩa. HCNS nói để sau.

## Việc cần làm ngoài code

- [x] ~~Xin file Excel nhân sự của HR~~ — không cần, nhập tay (chốt 03/09)
- [x] ~~Xin bốn file Excel KPI phòng Kỹ thuật~~ — đã có, đã nhập
- [ ] Trình sếp mốc mới: một phòng chạy thật tháng 11 thay vì toàn công ty
      ngày 31/12. **Làm sớm nhất** — đổi mốc lúc còn 4 tháng là điều chỉnh
      kế hoạch, đổi mốc vào tháng 12 là báo cáo thất bại.
