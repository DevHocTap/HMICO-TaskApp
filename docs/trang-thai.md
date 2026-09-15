# Trạng thái dự án

> Cập nhật mỗi khi hoàn thành một mảng việc.
> Đây là trí nhớ của Claude Code giữa các phiên — để lạc hậu là nó sẽ
> làm lại thứ đã có hoặc bỏ sót thứ đang dở.

Cập nhật lần cuối: 15/09/2026

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
  kiểu TypeScript. **Hiện: 332 test backend + 41 test frontend + 3 e2e; 35 + 79 + 76 + 82 + 159 + 104 + 76 + 42 kiểm tra curl.**

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
  giá · Nhật ký (Kỳ đánh giá bỏ 15/09). Route giữ nguyên, tab ẩn theo quyền.
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

- **Trọng số hai mục thành cài đặt (13/09):** nhóm `trongSo` (`bscWork` /
  `compliance`, tổng = 100) trong `SystemSetting`, mặc định 70/30. Đọc ở
  `kiemTraMau` (xuất bản mẫu), `kiemTraTrongSoPhieu` (gửi ký phiếu), và
  frontend qua `useTrongSo()` (thanh tổng trọng số, đồng hồ trọng số, mô tả
  mẫu). Màn Cài đặt có thẻ hai ô "sửa một ô, ô kia tự bù" kèm thanh chia
  phần. **ADMIN soạn được mẫu hệ thống từ giao diện** — màn soạn mẫu gọi
  `PUT :id/system-items` khi `isSystem`, kèm cảnh báo áp toàn công ty; vai
  khác chỉ đọc. `kiem-chung-cai-dat.sh` **42** (mục 27–29).

- **Mẫu nội quy theo phòng (13/09):** `KpiTemplate.departmentId` (migration
  `20260913100000_mau_noi_quy_theo_phong`). Trưởng bộ phận **"Sao chép về
  phòng mình"** từ mẫu nội quy dùng chung (menu ⋯ trên thẻ, `duplicate` kèm
  `departmentId`; ADMIN chọn phòng bằng TreeSelect), sửa trọng số Mục 2 qua
  đường thường, xuất bản, ngừng được; mỗi phòng một mẫu (409 nếu chép lần
  hai). Sinh phiếu ưu tiên mẫu của phòng đã xuất bản, không có thì mẫu
  chung (`mustFindSystemTemplate(departmentId)`). Quyền tính trên ĐÍCH sao
  chép, không phải bản gốc. Xem trước: mẫu nội quy chỉ vẽ Mục 2; mẫu chức
  danh ghép Mục 2 từ mẫu của phòng nếu có; số 70/30 đọc từ cài đặt.
  `verify-kpi-template.sh` **71** — gồm sinh phiếu thật và đối chiếu
  `systemTemplateId` bằng SQL. Ghi ở quy-tac mục 2 và 7.

- **Tổng quan vai quản lý — dựng lại theo MÃ HTML mẫu (13/09):** trang riêng
  `pages/TongQuanQuanLy.tsx` + `tong-quan.css` dịch một-đối-một từ Tailwind
  của mẫu (số đo, màu slate/blue/emerald/amber/rose), KHÔNG dùng lại
  `TheSoLieu` / stepper / `TheBaoCao` cũ. Gồm: thanh tiêu đề trong thẻ trắng +
  3 nút (N nhân sự · Chấm điểm/Tiếp nhận (N chờ) · Giao KPI tháng mới), 4 thẻ
  (vòng tròn SVG, huy hiệu xếp loại, thanh tiến độ, ô icon), pipeline 3 giai
  đoạn (thẻ đang chạy nền xanh), lưới 8/4: xu hướng có vùng tô + vạch mục tiêu
  nét đứt (`bieu-do/DuongVung.tsx`, nhãn tháng kèm số dưới biểu đồ), donut xếp
  loại + chú giải 2×2, hiệu suất nhóm (trưởng phòng: theo chức danh — backend
  `diemTrungBinhTheoChucDanh`; HCNS/BGĐ: theo phòng), dải hàng đợi; cột phải:
  mốc tiến độ tháng (timeline chấm màu) + quy chế & biểu mẫu (thang xếp loại
  từ Cài đặt, minh chứng bắt buộc, nút tối "Tải bảng tổng hợp (.xlsx)").
  **Header** đổi sang ô chọn "Kỳ:" (`contexts/KyDangXem.tsx`, dùng chung với
  Tổng quan) + chip "Tiến độ thẩm định N%"; **sidebar** thẻ "Chu kỳ hiện tại ·
  ACTIVE · Hạn chốt". Thay thế của mẫu: "Khoá sổ tự động 18:00" → "Hạn chốt
  sổ"; "Tải Quy chế HMICO 2026" → tải Excel tổng hợp kỳ (không có file quy
  chế); "Nhắc nộp KPI" → "Tiến độ nộp" (không có kênh thông báo); "Lịch sử T8"
  → đổi kỳ đang xem sang tháng trước. Nhân viên giữ trang chủ riêng.

- **Phiếu đánh giá của tôi (`/kpi/my`) — dựng lại theo mã HTML mẫu (13/09):**
  `MyScorecardsPage.tsx` + `phieu-cua-toi.css` (màu hmico `#0f62fe`). Tiêu đề
  kèm **mã nhân viên** (`/auth/me` nay trả `employeeCode`), nút "Hướng dẫn tự
  chấm" (modal lấy thang / trọng số / ngưỡng từ Cài đặt) và "Mở phiếu kỳ
  này"; thẻ tóm tắt kỳ hiện tại (chip tình trạng, điểm lớn: chốt → tự chấm đã
  nộp → dự kiến từ `/scoring`, 3 bước Ký nhận / Tự chấm / Chốt điểm); bảng
  các kỳ có lọc năm + phân đoạn Tất cả / Đang thực hiện / Đã chốt, cột Ký
  nhận · Ngày ký · Tiến độ · Điểm số (điểm chốt + loại, hoặc tự chấm) · Thao
  tác; **bảng kê tiêu chí** của phiếu đang chọn (mã KPI-01 / KPI-01.1, mục
  tiêu, ghi chú tự chấm, điểm tự chấm / thang, điểm TS, tổng cộng) đọc
  `/scoring` khi đã ký nhận, `/:id` khi chưa; ký nhận / nêu ý kiến ở chân
  bảng kê. `GET /scorecards/my` vốn trả nguyên dòng nên `PhieuKpi` khai thêm
  điểm hai cột và `grade`. Thay thế của mẫu: "Xuất phiếu PDF" → "Mở phiếu kỳ
  này" (chưa có bản in từng phiếu); cột "Tệp / Minh chứng" → "Ghi chú tự
  chấm" (hệ thống không có đính kèm); bỏ "Bổ sung tài liệu đính kèm".

- **Lập phiếu KPI (`/kpi/scorecards/:id`) — dựng lại theo mã HTML mẫu
  (13/09):** `ScorecardDetailPage.tsx` + `lap-phieu.css`. Thanh hành động
  (Quay lại · tên — kỳ · badge trạng thái · Huỷ / Lưu nháp / **Lưu & Giao
  KPI** = lưu rồi gửi ký, DISPUTED thành "Lưu & Gửi lại" kèm ghi chú bắt
  buộc); ba thẻ 4/5/3 (nhân sự + người đánh giá · đồng hồ trọng số hai mục
  đỏ/xanh lá · hạn giao kèm "Sắp đến hạn / Quá hạn", gửi ký / ký nhận);
  banner cảnh báo hợp lệ vàng (thiếu/thừa bao nhiêu, nhóm con lệch) hoặc
  xanh lá khi sẵn sàng; hai mục soạn **ngay trong bảng** (ô nhập luôn mở khi
  DRAFT/DISPUTED, KPI con thụt vào có nhánh cây, "+ KPI con · Chia đều ·
  xoá"); phiếu đã gửi ký cùng bố cục nhưng chỉ đọc; lịch sử phiếu dạng dòng
  thời gian. Bỏ chế độ "Sửa nội dung KPI" hai bước và `CayTieuChi`.

- **Báo cáo kỳ (`/kpi/dashboard`) — dựng lại theo mã HTML mẫu (13/09):**
  `DashboardPage.tsx` + `bao-cao-ky.css`. Cùng số liệu như bản 12/09 nhưng
  bố cục/kích thước theo mẫu: tiêu đề + tag giai đoạn + ô chọn kỳ (dùng chung
  `KyDangXem` với header) + Xuất .xlsx + Khoá sổ; 4 thẻ (tiến độ thẩm định có
  thanh, trễ hạn, bị trả lại, **hạn chốt sổ thẻ tối** có quầng sáng); 4 thẻ
  hạng viền trái màu (blue / sky / amber / rose) kèm điểm TB; phân bố xếp
  loại (chú giải + thanh chia + 4 ô) và hiệu suất phòng (STT, thanh, đỏ dưới
  80); bộ lọc chip + 3 ô chọn, bảng nhân sự tự dựng (avatar màu theo tên,
  mã NV mono, pill xếp loại / trạng thái, nút mắt) và chân trang Trước / Sau.
  Gỡ `TheBaoCao.tsx`, `ThanhXepChong`, `ThanhNgang` (không còn ai dùng).

- **Quản lý nhân sự (`/admin/users`) — dựng lại theo mã HTML mẫu (13/09):**
  `UsersPage.tsx` + `quan-ly-nhan-su.css`. Tiêu đề "N nhân sự · phạm vi",
  ô tìm + chọn phòng + "Thêm nhân viên" (HR/ADMIN); banner "Chế độ xem" cho
  vai chỉ đọc; 3 thẻ (tổng nhân sự đang làm việc + đã nghỉ + số trưởng bộ
  phận; tiến độ giao KPI kỳ này có thanh; tài khoản chưa đổi mật khẩu / đang
  hoạt động, link lọc nhanh); chip lọc **có số đếm** (4 truy vấn `limit=1`
  theo phòng đang lọc) + ô chức danh / vai trò; bảng tự dựng: avatar màu theo
  tên, mã · email, chức danh + huy hiệu "cấp bậc · vai trò", **cột "Trạng
  thái KPI tháng"** đọc `assignment-board` của kỳ đang xem (chưa giao / chờ
  ký / đã ký nhận / đã tự chấm / đã chốt / có ý kiến), trạng thái tài khoản,
  "Sửa hồ sơ" + menu ⋯ (HR/ADMIN) hoặc "Xem phiếu" (vai khác); chân bảng
  Trước / trang / Sau + cỡ trang. Thay thế của mẫu: "Xuất Excel" → không có
  (chưa có endpoint xuất nhân sự); "Gửi nhắc nhở" → "Xem danh sách" (không
  có kênh thông báo); "Trạng thái KPI kỳ" ở bộ lọc → không có (API nhân sự
  không lọc theo phiếu). Modal thêm/sửa, đặt lại mật khẩu, vô hiệu hoá giữ
  nguyên.

- **"Xoá mẫu" = ngừng sử dụng, ẩn hẳn với vai khác ADMIN (13/09):** menu ⋯
  đổi thành "Xoá mẫu"; backend `list` bỏ qua `includeInactive` với vai khác
  ADMIN, `getById` mẫu đã ngừng trả 404, `activate` chỉ ADMIN; công tắc "Cả
  mẫu đã ngừng" và nút "Kích hoạt lại" chỉ ADMIN thấy. `verify-kpi-template.sh`
  **76**. Ghi ở quy-tac mục 7.

- **Tổng quan nhân viên (14/09):** `pages/TongQuanNhanVien.tsx` cùng bộ kiểu
  `tong-quan.css` với bảng điều hành quản lý. Thanh tiêu đề "Xin chào, {tên
  gọi}" + tag tháng / hạn tự chấm + nút đúng việc đến lượt (ký nhận / tự chấm
  / chấm lại / xem phiếu); 4 thẻ (điểm tháng trước + hạng, trung bình gần
  đây so chỉ tiêu, tự chấm kỳ này x/y tiêu chí có thanh, hạn tự chấm đếm
  ngày); trái: **phiếu kỳ này** 3 bước (dùng lại kiểu `pt-buoc`) + ba ô
  điểm (NV tự chấm — dự kiến từ `/scoring` khi chưa nộp, Trưởng BP, Xếp loại
  tô màu hạng) và **lịch sử điểm ≤ 6 kỳ** (`DuongVung`, vạch chỉ tiêu);
  phải: `MocTienDoThang` (tách từ Tổng quan quản lý thành component dùng
  chung) + "Việc của tôi". `HomePage.tsx` giờ chỉ chọn trang theo vai. Gỡ
  `PhieuKyNayCuaToi`, `TheSoLieu`, `bieu-do/Duong` (không còn ai dùng).

- **Tải MỘT phiếu KPI ra Excel theo biểu mẫu BM.01 (14/09):**
  `GET /scorecards/:id/export` (`ScorecardExcelService`, quyền xem = quyền
  vào màn Chấm điểm qua `getScoring`). Sheet **BM.01**: đầu trang công ty /
  quốc hiệu, mã biểu mẫu, "Tháng: MM/YYYY", khối thông tin (họ tên, mã NV,
  phòng, chức danh, cấp bậc, người đánh giá; **"Ngày đánh giá" để trống** —
  chốt 14/09), Mục 1 / Mục 2 mỗi tiêu chí cấp 1 một dòng (STT, chỉ tiêu,
  trọng số %, thang, ba cột NLĐ và ba cột TBP: điểm · % đạt · % đóng góp),
  "Cộng Mục", TỔNG hai cột, XẾP LOẠI, thang xếp loại đọc từ Cài đặt, 4 ô ký,
  dòng "Gửi kết quả… trước ngày" theo `submitDeadline`. Sheet **Chi tiết**:
  KPI con theo từng tiêu chí (cách đo, mục tiêu, trọng số nhóm, thang, điểm
  hai cột, ghi chú / nhận xét). Ghi GIÁ TRỊ đã tính từ engine, không ghi công
  thức; tỉ lệ làm tròn 6 chữ số để không lặp lỗi `0.70000000000000007` của
  file gốc. Tên file **`KPI_<mã NV>_<YYYY-MM>.xlsx`** (chốt 14/09). Mỗi lần
  tải một dòng `AuditLog Scorecard/EXPORT`. Nút "Tải phiếu (.xlsx)" ở đầu
  màn Chấm điểm, chân bảng kê Phiếu đánh giá của tôi, và nút tải trên từng
  dòng bảng nhân sự ở Báo cáo kỳ (`taiPhieuExcel()`, `luuBlobXuongMay()`
  dùng chung với bản tổng hợp). `kiem-chung-lat-cat-5.sh` **104** (mục 29b
  đọc lại file, so từng ô với `/scoring`). Đóng nợ "Bản in TỪNG PHIẾU".

- **Sửa tiện thể (14/09):** `prisma/seed.ts` hỏng từ 11/09 vì
  `period-calendar.ts` import `cai-dat-mac-dinh.js` (Node bóc kiểu không đổi
  `.js` → `.ts`) — seed nay đọc từ `dist/`, phải `npm run build` trước.
  Script 5 nhận `KPI_DB` + `DATABASE_URL` để chạy trên database tạm seed
  sạch khi máy dev có dữ liệu thử tay (hướng dẫn ở đầu script).

- **Menu tài khoản + Thông tin cá nhân (14/09):** bấm avatar/tên ở header
  mở menu Thông tin cá nhân · Đổi mật khẩu · Đăng xuất (nút Đăng xuất rời
  header; màn đổi mật khẩu có "Quay lại" khi tự vào, lần đầu bắt buộc thì
  không). Bảng mới `EmployeeProfile` (1–1 `User`) + `EmployeeAssignmentHistory`
  (migration `20260914100000_ho_so_nhan_su`) — lý do tách ghi ở
  `mo-hinh-du-lieu.md`. Endpoint trong `org/` (`ProfileService`):
  `GET/PATCH /users/me/profile` (mọi vai, chỉ 6 trường liên hệ),
  `GET /users/:id/profile` (cùng phạm vi với `GET /users/:id`, CCCD che với
  trưởng phòng), `PUT /users/:id/profile` (HR/ADMIN, thêm ngày vào làm /
  nghỉ việc / CCCD; HR không đụng ADMIN). AuditLog `UPDATE_MY_PROFILE` /
  `UPDATE_PROFILE`. Trang `/ho-so` (`HoSoPage` + `FormHoSo` dùng chung với
  modal "Hồ sơ nhân sự" ở menu ⋯ màn Nhân viên). **Tiện thể sửa lỗi có sẵn
  từ 10/09:** `AllExceptionsFilter` thay mảng lỗi `class-validator` bằng "Đã
  xảy ra lỗi." — mọi lỗi nhập liệu DTO đều mất câu cụ thể; nay lấy câu đầu
  làm `message`, cả mảng ở `errors`. `verify-org.sh` **79** (mục Hồ sơ nhân
  sự 16 kiểm). Chuẩn bị cho chấm công giai đoạn 2 — xem `no-ky-thuat.md`.

- **Đăng nhập — dựng lại theo mã HTML mẫu thẻ đôi (14/09):** `LoginPage.tsx`
  + `dang-nhap.css` (`dn-*`, không antd Form): nền xanh/nhạt chia đôi, thẻ
  bo 40px; trái = logo, form ô nhập bo 16px nền xám, nút hiện/ẩn mật khẩu,
  ô lỗi đỏ dưới nút, chú ý vàng "sai 10 lần / 15 phút"; phải = minh hoạ
  dựng bằng CSS (màn hình, checklist, donut, bóng đèn, bút — có hiệu ứng
  bay), ẩn dưới 1024px. Giữ quyết định 11/09: **không** "Quên mật khẩu?"
  (không có luồng tự đặt lại), **không** "Ghi nhớ đăng nhập" (refresh token
  7 ngày đã ghi nhớ); font Inter tự phục vụ thay Plus Jakarta Sans của mẫu.

- **Đổi mật khẩu — dựng lại theo mã HTML mẫu thẻ đôi (14/09):**
  `ChangePasswordPage.tsx` + `doi-mat-khau.css` (`dm-*`, không antd Form):
  ba ô có icon + nút hiện/ẩn, lỗi từng ô hiện sau lần bấm đầu, khung "Quy
  tắc bảo mật bắt buộc" 2 cột; cột phải minh hoạ khiên/khoá và **thẻ "Độ
  mạnh mật khẩu" chạy thật** theo ô mật khẩu mới (`danhGiaMatKhau`). Giữ
  quyết định 11/09: chỉ hiện 2 quy tắc backend thật kiểm (mẫu ghi "có chữ
  hoa & số" nhưng backend không ép); pill "Mã hóa 256-bit" → "Mã hóa argon2"
  (nói đúng thứ đang dùng). Lần đầu bắt buộc: tiêu đề "Đặt mật khẩu mới",
  đường lui duy nhất là "Đăng xuất, quay lại trang Đăng nhập"; tự vào từ
  menu tài khoản: "Quay lại, không đổi nữa".

- **Logo Hoàng Minh (14/09):** file gốc `brand/Artboard 1.svg` (biểu tượng
  + chữ HOANG MINH + slogan). Tách **biểu tượng** (vòng tròn + chữ HM) ra
  `web/src/assets/brand/bieu-tuong.svg` — dùng ở sidebar, đăng nhập, đổi mật
  khẩu (thay ô chữ "H" xanh) và `web/public/favicon.svg`; bản đầy đủ ở
  `web/public/brand/hoang-minh.svg` (chưa chỗ nào dùng — chữ nhỏ dưới 120px
  không đọc được). Dòng phụ dưới "HMICO KPI" ở hai màn đăng nhập / đổi mật
  khẩu đổi thành tên công ty đầy đủ.

- **15/09 — tên phần mềm "HMICO APP"** (sidebar, đăng nhập, đổi mật khẩu,
  tiêu đề tab, `creator` file Excel) và **bỏ toàn bộ câu mô tả giải thích
  dưới tiêu đề trang** (prop `moTa` của `TieuDeTrang` ở 9 màn, `pt-mo-ta` /
  `bc-mo-ta` / `cd-mo-ta` ở Phiếu của tôi / Báo cáo kỳ / Chấm điểm; trang
  đăng nhập bỏ câu dẫn và khung chú ý "sai 10 lần"). `TieuDeTrang` vẫn nhận
  `moTa` nhưng không màn nào truyền nữa.

- **15/09 — bỏ màn Kỳ đánh giá (`/kpi/periods`)** vì trùng: kỳ tự sinh, bốn
  mốc đã có ở Cài đặt, khoá sổ đã có ở Báo cáo kỳ. Hai việc chỉ màn đó có
  được chuyển đi: **"Mở lại kỳ đã chốt"** → nút đảo chiều với "Khoá sổ" ở
  Báo cáo kỳ (kỳ đang khoá thì hiện nút mở); **"Tạo kỳ thủ công"** → nút
  cạnh công tắc "Tự sinh kỳ hằng tháng" ở Cài đặt (`components/ModalTaoKy.tsx`).
  Backend không đổi. Tab "Kỳ đánh giá" ở Cài đặt hệ thống chỉ còn Cài đặt ·
  Nhật ký; chip kỳ trên header của vai nhân viên không còn là link.

- **15/09 — Tổng quan quản lý (BGĐ / trưởng phòng / HCNS):** "Phiếu cần
  chấm gấp / chờ tiếp nhận" viết lại thành khối `tq-khoi` **một cột** (mỗi
  phiếu một dòng: avatar · tên + chức danh + ngày nộp · điểm · mũi tên, cả
  dòng là link sang Chấm điểm) và **chuyển sang cột phải** dưới Mốc tiến độ
  — trước nằm cột trái dạng lưới thẻ antd Card, cột phải hụt để trống nửa
  màn. Gỡ CSS `phieu-gap-*`.

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
