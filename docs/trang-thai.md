# Trạng thái dự án

> Cập nhật mỗi khi hoàn thành một mảng việc.
> Đây là trí nhớ của Claude Code giữa các phiên — để lạc hậu là nó sẽ
> làm lại thứ đã có hoặc bỏ sót thứ đang dở.

Cập nhật lần cuối: 09/09/2026

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
  kiểu TypeScript. **Hiện: 267 test backend + 25 test frontend + 3 e2e; 35 + 159 + 35 + 74 kiểm tra curl.**

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

**LÁT CẮT 4 XONG CẢ HAI ĐẦU.**

---

**Lát cắt 5 — `scoring`: XONG CẢ HAI ĐẦU (09/09), trừ mốc hạn nộp.**

Giai đoạn 1 — engine tính điểm:
- `src/modules/scorecard/scoring/scoring-engine.ts` — file THUẦN, không
  import NestJS, không chạm database. Chạy hai lần độc lập cho hai cột.
- Ba quyết định ghi vào `quy-tac-nghiep-vu.md` mục 4: giữ `Decimal` suốt
  quá trình và làm tròn ROUND_HALF_UP 2 chữ số ĐÚNG MỘT LẦN ở bước cuối;
  ngưỡng xếp loại so sánh liên tục (bịt khoảng hở 89,01–89,99 của tài liệu);
  xếp loại CHỈ tính trên cột trưởng bộ phận — chặn ngay tại engine.
- Ô điểm để trống KHÔNG ngầm thành 0; engine cũng KHÔNG tự chuẩn hoá trọng
  số (phiếu mới soạn 60/100 phải ra 60 điểm).
- `scoring/huong-b.ts` — công thức tính điểm từ số liệu thô, viết sẵn kèm
  test, CHƯA nối vào luồng nào.
- 48 test.

Giai đoạn 2 — bảy endpoint:
- `GET :id/scoring`, `PUT :id/self-scores`, `POST :id/self-submit`,
  `PUT :id/manager-scores`, `POST :id/manager-submit`, `POST :id/reject`,
  `POST :id/receive` — `ScorecardScoringService`.
- Lưu nháp là CẬP NHẬT MỘT PHẦN; ô không gửi lên giữ nguyên điểm cũ.
- Cửa ghi điểm đóng theo `resultStatus`: tự chấm mở ở PENDING/REJECTED, cột
  trưởng bộ phận ở SELF_SCORED, sau RECEIVED không còn cửa nào. Muốn chấm
  lại phiếu đã chốt thì phải qua `reject`. Ngoại lệ duy nhất: người đã nghỉ
  việc, cột trưởng bộ phận mở từ PENDING kèm `noSelfScoreReason` bắt buộc.
- Kỳ khoá và phiếu chưa ký nhận trả 409 — đã thống nhất mã này cho cả luồng
  giao KPI của lát cắt 4.
- `scripts/kiem-chung-lat-cat-5.sh`: **69 kiểm tra bằng curl**.

Giai đoạn 3 — giao diện:
- **`/kpi/scorecards/:id/scoring`** — MỘT màn hình cho cả hai vai, hai cột
  điểm cạnh nhau đúng bố cục biểu mẫu. Cột nào sửa được do backend quyết
  (`permissions`), cột kia chỉ đọc. Route nằm NGOÀI `RoleRoute` để STAFF vào
  được.
- Cột phải hiện đóng góp từng tiêu chí cấp 1 và tổng điểm, **cập nhật ngay
  khi gõ**; `web/src/utils/scoring.ts` tính bằng số nguyên, dùng lại đúng bộ
  ca test của engine backend để hai bên không lệch nhau.
- Ô nhập vượt thang đổi màu và tự mở ô ghi chú bắt buộc; cột chênh lệch giữa
  hai cột; nút Lưu nháp / Nộp / Chốt điểm / Trả lại / Tiếp nhận theo vai trò
  và trạng thái.
- Trang chủ "Việc của tôi" thêm ba việc: `CHO_TU_CHAM`, `CHO_TOI_CHAM`,
  `CHO_TIEP_NHAN`.

**CHƯA LÀM — chờ chốt mốc hạn nộp cho việc chấm điểm.** Ba việc mới ở trang
chủ cố ý KHÔNG có hạn (`KHONG_CO_HAN`), nên chưa có thẻ "Quá hạn" hay
"Còn N ngày" và chưa có nhắc theo ngày 28/30. `period-calendar.ts` không bị
đụng tới. Xem `no-ky-thuat.md` mục "Lát cắt 5".

Giai đoạn 4 — đối chiếu Excel: **ĐÃ LÀM, KHÔNG CÓ DÒNG NÀO LỆCH.**

Đối chiếu bằng máy với **cả bốn** file trong `docs/mau-kpi/`, không phải một
file: `excel-mau-kpi.data.ts` sinh thẳng từ .xlsx (không gõ tay), rồi
`doi-chieu-excel.spec.ts` chạy engine thật so từng ô — 27 test, 27 tiêu chí
cấp 1, 120 KPI con.

Khớp tuyệt đối ở: điểm tiêu chí cha suy từ con, đóng góp từng tiêu chí cấp 1
(cột "% đóng góp/tổng"), tổng Mục 1 hai cột. Cộng thêm một lượt đi hết đường
thật qua API trong `kiem-chung-lat-cat-5.sh` mục 29: sinh phiếu Shop Drawing
từ mẫu nhập từ Excel, tự chấm, chốt điểm — ra 100,00 / 100,00 / HOÀN THÀNH,
đóng góp 15/15/10/10/10/10 đúng biểu mẫu.

**HAI CHỖ HỆ THỐNG KHÁC EXCEL, cả hai đều là hệ thống đúng:**

1. **Mục 2 bỏ trống ở cả bốn file.** Excel ngầm coi ô trống là 0 điểm nên ra
   tổng 70% và in **"CHƯA ĐẠT"** — ai cầm tờ giấy đó cũng tưởng người này bị
   đánh giá kém, trong khi sự thật là chưa ai chấm phần nội quy. Hệ thống từ
   chối chốt và chỉ đúng ba dòng còn thiếu. Chấm nốt 3/3 thì ra 100,00 và
   HOÀN THÀNH.
2. **Excel tự nó sai số thực:** ô "Cộng Mục 1" ghi `0.70000000000000007`
   (bảo hành, cấu hình) và `0.70000000000000018` (triển khai), ô "Cộng Mục 2"
   ghi `0.30000000000000004` ở cả bốn file. Hệ thống dùng `Decimal` nên ra
   đúng 70 và 30.

**Bốn file KHÔNG PHẢI phiếu đã chấm của một người** — ô Họ và tên, Mã nhân
viên, Người đánh giá, Ngày đánh giá đều trống. Đúng như HCNS xác nhận
03/09/2026 (Câu 3): đây là mẫu thử nghiệm. Vì vậy mốc "đối chiếu phiếu thật
tháng 08" theo nghĩa đen chưa thực hiện được — cần HCNS đưa một phiếu đã
chấm thật. Mốc thay thế vẫn đang treo, xem mục "Chưa quyết".

**LÁT CẮT 5 XONG CẢ HAI ĐẦU**, trừ mốc hạn nộp cho việc chấm điểm.

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

  **Cập nhật 09/09:** đã đối chiếu bằng máy với cả bốn file, không lệch dòng
  nào (`doi-chieu-excel.spec.ts`). Nhưng đó là đối chiếu với MẪU, không phải
  với phiếu đã chấm thật. **Cần xin HCNS một phiếu KPI thật đã chấm xong của
  tháng bất kỳ** — có tên người, có điểm cả hai cột, có xếp loại. Không có nó
  thì không chứng minh được hệ thống ra đúng số mà công ty đang dùng để tính
  lương.

## Việc cần làm ngoài code

- [x] ~~Xin file Excel nhân sự của HR~~ — không cần, nhập tay (chốt 03/09)
- [x] ~~Xin bốn file Excel KPI phòng Kỹ thuật~~ — đã có, đã nhập
- [ ] Trình sếp mốc mới: một phòng chạy thật tháng 11 thay vì toàn công ty
      ngày 31/12. **Làm sớm nhất** — đổi mốc lúc còn 4 tháng là điều chỉnh
      kế hoạch, đổi mốc vào tháng 12 là báo cáo thất bại.
