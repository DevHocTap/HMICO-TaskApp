# Trạng thái dự án

> Cập nhật mỗi khi hoàn thành một mảng việc.
> Đây là trí nhớ của Claude Code giữa các phiên — để lạc hậu là nó sẽ
> làm lại thứ đã có hoặc bỏ sót thứ đang dở.

Cập nhật lần cuối: 13/09/2026

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
  kiểu TypeScript. **Hiện: 327 test backend + 41 test frontend + 3 e2e; 35 + 63 + 51 + 82 + 159 + 96 + 76 + 37 kiểm tra curl.**

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

**Lát cắt 5 — `scoring`: XONG CẢ HAI ĐẦU (09/09), hạn nộp nối 10/09.**

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
- `scripts/kiem-chung-lat-cat-5.sh`: **90 kiểm tra bằng curl**.

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

- **Ba việc chấm điểm đã có hạn thật (10/09).** Tự chấm lấy
  `selfScoreDeadline` (25), trưởng bộ phận chấm lấy `managerScoreDeadline`
  (29), HCNS tiếp nhận lấy `submitDeadline` (30) — đúng ba cột mục 5.5 đã
  chốt từ 03/09.
- **Mọi việc CÓ PHIẾU giờ đo hạn theo kỳ CỦA PHIẾU** (10/09), kể cả ba việc
  đầu kỳ `CHO_KY_NHAN` / `CHUA_GUI_KY` / `CO_Y_KIEN` vốn đo theo kỳ chứa hôm
  nay. Phiếu tháng 8 chưa xử lý mà sang tháng 9 mới mở trang chủ thì báo quá
  hạn thật, không còn hiện "còn N ngày" cho việc trễ cả tháng. Nhiều phiếu ở
  nhiều kỳ thì lấy hạn sớm nhất. Việc `CHUA_GIAO_KPI` vẫn theo kỳ hiện tại vì
  nó đếm người CHƯA có phiếu — xem `no-ky-thuat.md` Câu 0c.

  (Prompt lát cắt 5 ghi lịch cũ "ngày 02 tháng kế tiếp" và "nhắc từ 28/30";
  từ chỗ đó tôi đã kết luận nhầm là mốc chưa chốt. Không phải — mốc có sẵn.)

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
03/09/2026 (Câu 3): đây là mẫu thử nghiệm.

**Chốt 10/09: không có phiếu KPI thật để đối chiếu, bộ KPI thật sẽ tự xây
mới trên hệ thống.** `doi-chieu-excel.spec.ts` giữ lại làm test hồi quy cho
công thức tính điểm; bốn file trong `docs/mau-kpi/` từ nay chỉ là dữ liệu
test, không phải nguồn sự thật nghiệp vụ.

**LÁT CẮT 5 XONG CẢ HAI ĐẦU.**

---

**Chuẩn bị chạy thật (10/09) — ba việc hạ tầng đã xong:**

- **Hạn mức đăng nhập đổi KHOÁ, không nâng số.** Ba lớp: 5 lần/phút theo
  cặp `(IP, email)`, 120 lần/phút theo IP, khoá tạm theo email >10 lần sai
  /15 phút. Trước đây khoá theo IP thuần nên 200 người sau NAT dùng chung
  một hạn mức — người thứ sáu đăng nhập buổi sáng đã bị chặn.
- **`AllExceptionsFilter`** — dịch lỗi Prisma sang mã HTTP đúng
  (`P2002`→409, `P2025`→404, `P2003`→400), lỗi 5xx ghi stack vào log máy chủ
  và chỉ trả ra ngoài một câu chung. Giữ nguyên hình dạng body cũ.
- **`/admin/audit-logs`** — màn nhật ký thao tác, chỉ đọc. ADMIN xem mọi
  loại; ban giám đốc chỉ xem `Scorecard`. Đã nối `AuditService` vào `auth`
  nên đăng nhập, đăng nhập sai, đổi mật khẩu đều để lại dấu vết.
- Thêm `TRUST_PROXY` — **phải đặt `1` khi triển khai sau nginx.**

`scripts/kiem-chung-lat-cat-5.sh` nay **90 kiểm tra**.

**Quyết định hạ tầng đã chốt 10/09:**

| Việc | Chốt |
|---|---|
| Nơi chạy | **máy chủ đặt tại công ty**, không thuê Viettel Cloud nữa. Tên miền đã có, IP tĩnh — xem `quyet-dinh-cong-nghe.md` |
| Số tiến trình | **MỘT** tiến trình Node, không PM2 cluster (bộ đếm hạn mức nằm trong bộ nhớ tiến trình) |
| Sao lưu | `pg_dump` hằng đêm, giữ **tại chính máy đó**; đẩy ra ngoài làm sau — nợ có chủ ý |
| Ai xem nhật ký | ADMIN mọi loại; **ban giám đốc chỉ `Scorecard`** (ai sửa điểm, nộp, duyệt); HR và MANAGER không xem |
| Hạn mức đăng nhập | 3 lớp: 5/phút theo `(IP, email)`, 120/phút theo IP, khoá tạm theo email |

**CHƯA LÀM — phần triển khai.** Chưa có nginx, systemd, CI, hay
`.env.production.example`. Hướng đã trình bày nhưng chưa duyệt. Còn một việc
ngoài code chưa xác nhận: **mở cổng 80/443 từ internet vào máy chủ công ty**
— việc của IT, và là điều kiện bắt buộc để tên miền dùng được.

---

**Lát cắt 6 — báo cáo: XONG CẢ HAI ĐẦU (10/09).**

- **`GET /reports/submission-progress`** + màn **`/kpi/progress`** — mỗi
  phòng một dòng, bảy cột đếm theo trạng thái phiếu, bảng dạng cây mở sẵn.
  Chỉ nhận kỳ THÁNG (quý/năm trả 400 kèm lý do). Số của phòng cha ĐÃ cộng
  dồn từ cây con — làm ở backend bằng `congDonTheoCay()`, hàm thuần có 11
  test. **5 truy vấn cố định**, không tăng theo số phòng.
- **`GET /reports/export`** + nút trên màn tiến độ — file `.xlsx` một kỳ,
  mỗi người một dòng, 13 cột. Điểm ghi dạng SỐ định dạng `0.00`; phiếu chưa
  chốt để ô TRỐNG chứ không ghi 0. Đóng băng tiêu đề, bật autoFilter. Ghi
  `AuditLog` mỗi lần xuất. `exceljs@4.4.0`.
- **`GET /reports/dashboard`** + màn **`/kpi/dashboard`** — đếm theo trạng
  thái, phân bố xếp loại, điểm trung bình theo phòng. **Chỉ phiếu ĐÃ CHỐT**
  vào hai mục sau; mọi chỗ hiện trung bình đều kèm "tính trên N/M phiếu đã
  chốt". Không thêm thư viện biểu đồ.
- `scripts/kiem-chung-lat-cat-6.sh`: **47 kiểm tra bằng curl**, trong đó có
  đọc lại chính file Excel vừa tải để kiểm từng ô.

**Hai chỗ cố ý khác prompt, đã ghi lý do trong code:**
- Bản xuất Excel gồm cả **người đã nghỉ việc mà còn phiếu trong kỳ** — lát
  cắt 5 cho phép chốt điểm phiếu của họ, bỏ ra là mất chính con số dùng
  tính lương.
- Điểm trung bình **KHÔNG cộng dồn** lên phòng cha: trung bình của các
  trung bình không phải trung bình chung.

---

**Làm mới giao diện theo bộ mẫu thiết kế (11/09) — ĐANG LÀM, từng màn một.**

Bộ mẫu: chữ có chân (Lora), xanh ngọc `#0987b1` chủ đạo, nền xám ấm, hồng
`#e8367d` cho số liệu cần chú ý. Đã áp:

- **Theme toàn app** — `web/src/config/theme.ts` (token antd: màu, font, bo
  góc, Menu/Layout). Font tự phục vụ qua `@fontsource/lora@5.3.0`, nạp ở
  `main.tsx`, không gọi Google Fonts. **Phát hiện tiện thể:** `index.css`
  trước đó chưa từng được import — rule `.dong-can-xu-ly` của lát cắt 6 chưa
  bao giờ chạy; đã nối.
- **Đăng nhập** — hai cột, cột trái nền tối có lưới; ẩn cột trái < 900px.
  Bỏ "Quên mật khẩu?" (không có luồng), "Ghi nhớ đăng nhập" (không có tác
  dụng), ba con số 200/10/2 (không có API công khai) — chốt 11/09.
- **Đổi mật khẩu** — thẻ nền ấm, thanh độ mạnh 4 đoạn, quy tắc tick ✓ khi đạt.
  **Chỉ hiện 2 quy tắc backend thật sự kiểm** (8 ký tự, khác mật khẩu cũ);
  "10 ký tự", "có chữ và số" trong mẫu không có ở backend nên không hiện.
- **Khung chung `AdminLayout`** — sidebar có logo, nhãn nhóm, **badge số
  việc** trên mục menu (đếm `pending-my-action` theo `link`), thẻ kỳ tháng ở
  đáy; header có avatar chữ tắt, "chức danh · phòng ban". Bỏ dãy tab đổi vai
  và mục "Cài đặt" của mẫu.
- **Trang chủ** — eyebrow kỳ, chào **tên gọi** (từ cuối họ tên, không
  anh/chị), câu dẫn + nút chính theo vai, "Việc của tôi" kiểu mới, **bốn thẻ
  số liệu theo vai**, "Điểm trung bình theo phòng" (vai quản lý), "Lịch tháng
  này" 4 mốc (Đã qua / Đang mở ≤ 7 ngày / Sắp tới).
- **`GET /reports/home-summary`** — MỘT endpoint trả bộ số theo vai
  (`HomeSummaryService`, 10 test): ADMIN đếm tài khoản / phòng thiếu trưởng /
  mẫu / thao tác 24h; EXECUTIVE điểm TB trên **toàn bộ** phiếu đã chốt (không
  phải TB của TB), % hoàn thành trở lên, phòng dưới **80** (chốt 11/09); HR
  phiếu / chốt / tiếp nhận / phòng nộp đủ; MANAGER phòng mình; STAFF điểm
  tháng trước, TB ≤ 3 kỳ đã chốt, tiêu chí lá chưa tự chấm. Mở cho STAFF —
  ghi đè `@Roles` cấp class, chỉ trả số của chính họ.
  `kiem-chung-lat-cat-6.sh` nay **63 kiểm tra** (mục 22–28 so với SQL).
- Tách `NGUOI_CO_KPI` / `VAI_TRO_KHONG_AP_KPI` ra `scorecard/nguoi-co-kpi.ts`
  (file thuần) để `reports/` dùng chung.

- **Giao KPI** — tiêu đề + câu dẫn, bộ chọn bo tròn, thanh "N người chưa có
  phiếu" + 3 nút, phòng ban thành dòng phụ dưới tên, **bỏ cột Ngày ký nhận**,
  trọng số < 100% tô hồng, dòng chưa có phiếu nền xanh nhạt. Nút hàng: đã ký
  nhận → "Chấm điểm", chưa → "Mở phiếu".
- **Chấm điểm** — hai cột: trái là dải trạng thái + hạn ("Hạn chấm 29/10 —
  còn 4 ngày", tính từ kỳ của phiếu) và hai mục dạng bảng 5 cột (Tiêu chí ·
  Trọng số · NV tự chấm · Trưởng BP · Đóng góp); phải là thẻ tổng điểm nền tối
  (xếp loại, chênh lệch tổng) và **Lịch sử phiếu** (đọc thêm
  `GET /scorecards/:id`, chủ phiếu cũng gọi được). **Bỏ ba cột Mục tiêu /
  Thang / Chênh lệch**: Mục tiêu thành dòng phụ dưới tên, Thang lên đầu mục,
  chênh lệch từng dòng thành **màu ô Trưởng BP** (hồng thấp hơn / xanh cao
  hơn, tooltip số lệch) — chốt 11/09. Nút hành động lên góc phải đầu trang.
  `LichSuPhieu` thành component dùng chung với màn chi tiết.
- **Nhân viên** — chip lọc nhanh (Tất cả · Trưởng bộ phận · Chưa đổi mật
  khẩu · Đã nghỉ việc, **không kèm số đếm**) + ô chọn phòng/chức danh; hàng:
  avatar + tên / mã · email, chức danh (cấp bậc dòng phụ), phòng, vai trò,
  trạng thái chữ màu; "Sửa" + menu ⋯ chứa Đặt lại mật khẩu / Vô hiệu hoá.
  Backend thêm lọc `mustChangePassword`.
- **Lỗi có sẵn bị lộ ra khi làm chip:** `?isActive=false` từng trả về người
  ĐANG hoạt động vì `@Type(() => Boolean)` gọi `Boolean("false")` = `true`.
  Sửa bằng `@BoolQuery()` (`src/common/transforms/bool-query.ts`, 4 test);
  `verify-org.sh` thêm 3 kiểm → **63**.

- **Mẫu KPI** — lưới thẻ: mã, trạng thái, tên, "N tiêu chí · N KPI con ·
  phiên bản", thanh trọng số (hồng khi thiếu), "Xem trước" (tải chi tiết khi
  bấm, dùng lại `TemplatePreviewModal`), Sửa + menu ⋯. Backend trả thêm
  `subCriteriaCount` / `weightTotal` / `weightRequired` — một truy vấn cho cả
  danh sách (`tongHopItem()`), `verify-kpi-template.sh` **38**.
- **Cài đặt hệ thống — MODULE MỚI `settings/`** (chốt làm đủ 11/09):
  bảng `SystemSetting` (key-value JSON, migration
  `20260911090000_cai_dat_he_thong`), `SettingsService` @Global giữ cache
  trong bộ nhớ, `GET /settings` mọi vai, `PUT /settings` ADMIN + HR, mỗi nhóm
  một dòng AuditLog `Setting`. Năm nhóm và chỗ đọc:
  | Nhóm | Đọc ở |
  |---|---|
  | `lichKy` 25/25/29/30 | `kyThang()` / `cacKyCanBaoDam()` qua `PeriodService` — chỉ kỳ sinh SAU khi đổi |
  | `nguongXepLoai` 80/90/100 | `xepLoaiTuTongDiem()` qua `ScorecardScoringService` — chỉ lần chốt SAU khi đổi |
  | `baoMat` | `UsersService` (mustChangePassword khi tạo / đặt lại), `LoginAttemptService` (ngưỡng, phút, bật/tắt) |
  | `kyDanhGia.tuSinhHangThang` | `PeriodScheduler` |
  | `chamDiem.choPhepTraLaiPhieuDaChot` | `reject()`: bật thì người chấm rút lại phiếu MANAGER_SCORED, HR/ADMIN trả lại phiếu RECEIVED — vẫn qua reject, vẫn ScorecardEvent |
  **Hai chỗ CỐ Ý khác mẫu:** ngưỡng khởi tạo 80/90/100 (mẫu vẽ 70 — sai
  quy tắc mục 4); "Cho phép sửa điểm sau khi chốt sổ" hiện thực thành "cho
  phép TRẢ LẠI phiếu đã chốt", không có đường ghi đè điểm hay ghi vào kỳ khoá.
  **Lưu lịch áp ngay vào kỳ đang mở** (12/09, `apMocVaoKyDangMo`).
  `kiem-chung-cai-dat.sh`: **37 kiểm tra**, chụp và khôi phục cả bảng cài đặt lẫn mốc kỳ.
  Màn `/admin/settings` cho ADMIN / HR / EXECUTIVE (EXECUTIVE chỉ đọc).
- **Nhật ký thao tác** — backend dựng **câu tiếng Việt** cho từng dòng
  (`mo-ta-ban-ghi.ts`, file thuần, 7 test; tra tên phiếu/người/kỳ mỗi loại
  một truy vấn, không N+1) + `GET /audit-logs/export` ra .xlsx (trần 20.000
  dòng, tự ghi `EXPORT_AUDIT`). Điểm chốt nay ghi thẳng vào `after` của sự
  kiện `MANAGER_SCORE` / `SELF_SCORE`. Màn: hàng "giờ · người · câu · tag",
  bấm dòng mở before/after + IP, nút Xuất Excel; **giữ bộ lọc**.
  `kiem-chung-lat-cat-5.sh` **96**.

---

**Đổi sang bộ mẫu thứ hai (12/09) — phong cách PerformKPI.** Chốt 12/09:
chữ không chân **Inter** (`@fontsource/inter@5.3.0`, gỡ Lora), xanh dương
`#1d4ed8`, nền `#f5f7fb`, thẻ trắng viền mảnh; đỏ / vàng / xanh lá là màu
theo nghĩa (chờ ai đó = vàng, xong = xanh lá, trả lại / trễ = đỏ). Màu trong
CSS đi qua biến `--mau-*` ở `:root` của `index.css`.

- **Khung** — header 60px: breadcrumb · chip "Kỳ tháng X · Giai đoạn N"
  (`giaiDoanCuaKy()`, 4 test) · chuông đếm việc mở danh sách. **Menu trái
  gọn còn 7 mục** một nhóm; năm màn phụ thành **tab trong màn cha**
  (`ThanhTab.tsx`): Báo cáo kỳ = Tổng quan · Tiến độ nộp; Quản lý nhân sự =
  Nhân viên · Phòng ban · Chức danh; Cài đặt hệ thống = Cài đặt · Kỳ đánh
  giá · Nhật ký. Route giữ nguyên, tab ẩn theo quyền.
- **Dashboard (`/kpi/dashboard`)** — stepper 3 giai đoạn có tiến độ từng
  bước; 4 thẻ có icon và **so với tháng trước** (từ `GET /reports/trend`,
  endpoint mới, 2 groupBy cho cả dãy, script 6 → **68**); thẻ đỏ "Cần chú ý"
  (trễ tự chấm / trễ chấm / bị trả lại, tính theo mốc kỳ); phân bố xếp loại
  (thanh chia phần + 4 ô, bảng màu qua validator); xếp hạng phòng; xu hướng 6
  tháng (2 đường SVG tay, có "Xem bảng"); việc cần xử lý; nút Xuất báo cáo.
  **Không** vẽ bell curve, quỹ thưởng, PIP, gợi ý AI, "Thực đạt" — hệ thống
  không có các khái niệm đó.
- **Chấm điểm** — 5 ô đầu trang (nhân viên + tiến trình · NV tự chấm · Trưởng
  BP · Độ lệch · Xếp loại), bảng toàn chiều ngang, dưới là **Ý kiến nhân
  viên** / **Nhận xét trưởng bộ phận** (gom từ ghi chú từng tiêu chí, không
  có trường nhận xét chung) và Lịch sử.
- **Chi tiết phiếu** — hàng thẻ: nhân viên · đồng hồ trọng số hai mục · hạn
  giao KPI (`assignDeadline` nay có trong `GET /scorecards/:id`); cây tiêu
  chí xem gập/mở (`CayTieuChi.tsx`, sửa lỗi con đứng trước cha).
- **Nhân viên** — 3 thẻ đầu trang từ `home-summary` theo vai.
- **Cài đặt** — lịch kỳ thành 4 thẻ giai đoạn, ngưỡng thành bảng có chấm màu.
- Component `ThanhNgang` (SVG) hiện không màn nào dùng — giữ cho màn sau.

- **Quyền soạn mẫu KPI đổi (12/09):** TRƯỞNG BỘ PHẬN soạn cho chức danh
  phòng mình + ADMIN; HCNS và BGĐ chỉ xem (trước: ADMIN + HR ghi, MANAGER
  đọc). `VAI_TRO_GHI` ở controller, `assertCoTheGhi` / `assertCoTheGhiChucDanh`
  ở service; frontend `coTheGhiMau()`, form tạo mẫu bắt trưởng phòng chọn chức
  danh có phòng. `verify-kpi-template.sh` **44**. Ghi ở quy-tac mục 7.

- **Tổng quan (`/`) theo mẫu bảng điều hành (12/09):** vai quản lý thấy
  `BangDieuHanhKy` (khối dùng chung với Báo cáo kỳ: stepper, 4 thẻ, xếp loại,
  phòng) + **`PhieuCanXuLyGap`** — thẻ từng người: trưởng BP/BGĐ thấy phiếu
  chờ mình chấm và phiếu trễ hạn tự chấm; HCNS/ADMIN thấy phiếu chờ tiếp nhận
  kèm nhãn "Lệch N đ" khi hai cột lệch quá 10. Nhân viên giữ bộ thẻ riêng.
  Backend: `GET /scorecards` thêm lọc `evaluatorId` và trả `selfTotalScore`,
  `managerTotalScore`, `grade`, `selfScoredAt`, `managerScoredAt` — endpoint
  này lần đầu có màn hình gọi. Script 6 → **72**.

- **Báo cáo kỳ (`/kpi/dashboard`) theo mẫu chốt sổ HCNS (12/09):** 4 thẻ
  (tiến độ thẩm định · trễ hạn tự nộp kèm tên phòng · bị trả lại · **hạn chốt
  sổ** thẻ tối), 4 thẻ hạng có số / % / **điểm TB từng hạng** (backend
  `diemTrungBinhTheoXepLoai`), xếp loại + hiệu suất phòng (`TheBaoCao.tsx`
  dùng chung với Tổng quan), **bảng nhân sự** lọc theo phòng (chip) / xếp loại
  (`GET /scorecards?grade=`) / trạng thái, dòng đỏ khi chưa đạt hoặc quá hạn
  tự nộp; nút Xuất .xlsx và **Khoá sổ kỳ** (HCNS, BGĐ, ADMIN, có xác nhận).
  Xu hướng 6 tháng bỏ khỏi màn này (chỉ còn dùng cho "so tháng trước").
  Thay thế của mẫu: PIP → bị trả lại; đếm ngược tự khoá → hạn chốt sổ (hệ
  thống KHÔNG tự khoá). Script 6 → **76**.

- **13/09:** năm màn còn lại (Phiếu của tôi, Tiến độ nộp, Kỳ đánh giá, Phòng
  ban, Chức danh) đổi sang đầu trang `TieuDeTrang` + nút/bộ chọn bo tròn —
  toàn bộ màn đã cùng một khung. Thêm `POST /kpi-templates/:id/activate` +
  `includeInactive` (đóng nợ kích hoạt lại mẫu), `verify-kpi-template.sh` **51**.

**Mọi màn đã theo bộ mẫu thứ hai.** Chưa có mẫu riêng cho bảng Tiến độ nộp,
Kỳ đánh giá, Phòng ban, Chức danh — chỉ đồng bộ đầu trang.

**Việc tiếp: triển khai** (tuần 13+). Chưa có nginx, systemd, CI hay
`.env.production.example` — xem `no-ky-thuat.md`. Một endpoint cũ vẫn chưa
màn hình nào gọi: `GET /scorecards/readiness` (`GET /scorecards` đã có Tổng quan gọi từ 12/09).

## Kế hoạch — lát cắt dọc, mỗi tuần có thứ mở lên xem được

| Tuần | Lát cắt |
|---|---|
| 1–2 | `auth`: argon2, JWT 15', RefreshToken 7 ngày có xoay vòng, `RoleGuard`, `getAccessibleDepartmentIds` + màn đăng nhập, đổi mật khẩu lần đầu |
| 3–4 | `org`: phòng ban, chức danh, nhân viên, import Excel + màn quản trị |
| 5–6 | `kpi-template`: một màn hình tạo cây hai cấp + nhập 4 mẫu phòng Kỹ thuật |
| 7–8 | `scorecard`: giao KPI tháng, ký nhận, sao chép từ kỳ trước |
| 9–10 | `scoring`: hai cột chấm, tính điểm, xếp loại |
| **11** | ~~Đối chiếu Excel tháng 08 thật~~ — **đã đổi**: không có phiếu thật, đã đối chiếu công thức với cả 4 mẫu (`doi-chieu-excel.spec.ts`) |
| 12 | **XONG** — theo dõi tiến độ nộp, xuất Excel, dashboard ("Việc của tôi" đã xong ở lát cắt 5) |
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
- **Mốc nghiệm thu thay thế — ĐÃ ĐÓNG (10/09).** Không có phiếu KPI thật để
  đối chiếu; **bộ KPI thật sẽ tự xây mới trên hệ thống**, không dựa vào bốn
  file Excel cũ.

  Việc còn giữ lại từ mốc cũ: `doi-chieu-excel.spec.ts` (27 test, khớp tuyệt
  đối cả bốn file) **giữ nguyên làm test hồi quy cho công thức tính điểm** —
  nó vẫn chứng minh engine ra đúng số của biểu mẫu BM.01, kể cả khi nội dung
  KPI thay bằng bộ mới. Bốn file trong `docs/mau-kpi/` từ nay chỉ là dữ liệu
  test, không phải nguồn sự thật nghiệp vụ.

## Việc cần làm ngoài code

- [x] ~~Xin file Excel nhân sự của HR~~ — không cần, nhập tay (chốt 03/09)
- [x] ~~Xin bốn file Excel KPI phòng Kỹ thuật~~ — đã có, đã nhập
- [x] ~~Trình sếp mốc mới: một phòng chạy thật tháng 11~~ — **đã trình
      (10/09).**
- [x] ~~Xin HCNS một phiếu KPI thật đã chấm~~ — **không có (chốt 10/09).**
      Bộ KPI thật sẽ tự xây mới, không dựa vào bốn file Excel cũ.
- [x] ~~Bổ nhiệm trưởng bộ phận cho phòng còn trống~~ — **không phải nợ
      (chốt 10/09).** Máy dev thì tự thêm để thử; triển khai thật thì ADMIN
      tạo tài khoản và bổ nhiệm.
