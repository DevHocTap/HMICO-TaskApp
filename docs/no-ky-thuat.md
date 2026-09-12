# Nợ kỹ thuật

> Mỗi khi tạm bỏ qua điều gì, ghi vào đây ngay. Làm một mình rất dễ quên
> những chỗ để tạm.

## Quy tắc rút ra — đọc trước khi làm

- **Đổi tên cột hoặc bảng: BẮT BUỘC đọc file SQL Prisma sinh ra trước khi
  chạy.**

  Prisma không biết đó là đổi tên. Nó sinh `DROP COLUMN` + `ADD COLUMN`,
  nghĩa là **xoá sạch dữ liệu của cột đó**. Trên máy dev nó còn dừng lại
  cảnh báo vì bảng có dữ liệu; chạy `migrate deploy` trên máy chủ thật thì
  không hỏi gì cả.

  Quy trình đúng:
  1. `npx prisma migrate dev --create-only --name <ten>`
  2. **Mở `migration.sql` ra đọc.** Thấy `DROP COLUMN` mà mình chỉ định đổi
     tên thì sửa tay thành `ALTER TABLE ... RENAME COLUMN ... TO ...`
  3. Chạy `npx prisma migrate deploy` rồi kiểm dữ liệu còn nguyên

  (`--create-only` cần TTY; trong môi trường không có TTY thì tự tạo thư
  mục migration và viết `migration.sql` bằng tay, xem
  `20260830154536_kpi_template` làm mẫu.)

  Lần này chỉ suýt mất 3 dòng seed. Với dữ liệu KPI thật của 200 người thì
  không có cách nào cứu — điểm đã chấm là căn cứ tính lương.

## Ưu tiên cao — phải xử lý trước khi lên chạy thật

- [ ] **Refresh token nằm ở `localStorage` — nợ kỹ thuật CÓ CHỦ Ý.**

      **Rủi ro:** XSS ở *bất kỳ màn hình nào* cũng đọc được refresh token,
      và kẻ tấn công giữ được phiên **7 ngày** — kể cả sau khi người dùng
      đóng trình duyệt hay đổi máy. Access token giữ trong bộ nhớ nên an
      toàn hơn, nhưng refresh token mới là thứ đáng giá.

      **Phương án đúng:** backend đặt refresh token vào cookie `httpOnly`
      `Secure` `SameSite=Strict`, kèm chống CSRF (token đồng bộ hoặc kiểm
      header `Origin`). Khi đó JavaScript không đọc được token nữa.

      **Điều kiện xử lý: TRƯỚC KHI MỞ CHO TOÀN CÔNG TY.** Chạy thử một
      phòng Kỹ thuật tháng 11 thì chấp nhận được; 200 người thì không.

      **Kỷ luật XSS — áp dụng ngay từ bây giờ, mọi màn hình:**
      - **Không dùng `dangerouslySetInnerHTML`.** Không có ngoại lệ.
      - **Không chèn HTML thô từ dữ liệu người dùng** vào DOM. Tên nhân
        viên, tên KPI, ghi chú chấm điểm, lý do trả lại — tất cả đều là
        dữ liệu người dùng nhập, luôn để React tự escape.
      - Không dùng `eval`, `new Function`, hay `href` nhận chuỗi từ dữ
        liệu (`javascript:` là một URL hợp lệ).
      - Thư viện nào cần render HTML (trình soạn thảo, xem trước Excel)
        phải bàn lại trước khi đưa vào.

      Chừng nào token còn ở `localStorage` thì một lỗ XSS duy nhất là mất
      toàn bộ phiên đăng nhập của người dùng đó.

- [ ] **Đổi mật khẩu KHÔNG vô hiệu hoá access token đang cầm.** Chỉ refresh
      token bị thu hồi; JWT vẫn sống tới hết 15 phút. Ai đổi mật khẩu vì
      nghi bị chiếm tài khoản thì kẻ tấn công vẫn thao tác được trong
      khoảng đó. Cách xử lý: `JwtAuthGuard` đối chiếu `iat` của token với
      `User.passwordChangedAt` — đổi lấy một truy vấn database mỗi request.
- [x] ~~`AuditService` chưa nối vào `auth`~~ — **đã nối 10/09.** Ghi
      `LOGIN`, `LOGIN_FAILED` (kèm lý do: email không tồn tại / sai mật khẩu
      / tài khoản đã vô hiệu hoá), `LOGOUT_ALL`, `CHANGE_PASSWORD` với
      `entityType = 'Auth'`. Tách khỏi `'User'` có chủ ý: đây là sự kiện
      phiên đăng nhập, trộn chung thì nhật ký của một nhân viên ngập bản ghi
      đăng nhập và không còn nhìn ra lần đổi vai trò nào.
- [x] ~~Chưa có giao diện xem `AuditLog`~~ — **`/admin/audit-logs`** (10/09).
      Lọc theo đối tượng, mã thao tác, khoảng ngày; `before`/`after` mở ra
      khi bấm vào dòng. ADMIN xem mọi loại; **ban giám đốc chỉ xem
      `Scorecard`** (ai sửa điểm, nộp, duyệt) — chốt 10/09. HR và MANAGER
      KHÔNG vào được: nhật ký ghi lại chính thao tác của họ.

- [ ] **`AuditLog` chưa có chính sách dọn.** Mỗi lần đăng nhập là một dòng;
      200 người × ~250 ngày làm việc ≈ 50.000 dòng/năm chỉ riêng `LOGIN`,
      chưa kể thao tác nghiệp vụ. Chưa gây vấn đề gì ở quy mô hiện tại và
      **không được xoá bừa** — nhật ký chấm điểm là bằng chứng khi tranh cãi
      lương. Hướng xử lý khi cần: giữ `Auth` 12 tháng, giữ `Scorecard` vĩnh
      viễn, tách bảng lưu trữ thay vì xoá.
- [ ] Module `org` gọi `audit.log()` KHÔNG kèm transaction. Chấp nhận được
      với thao tác nhân sự, nhưng `Scorecard` thì bắt buộc phải kèm — xem
      `docs/kien-truc.md` mục Nhật ký thao tác.
- [ ] **`RateLimitGuard` và `LoginAttemptService` đều đếm trong BỘ NHỚ
      TIẾN TRÌNH.** Chỉ đúng khi chạy MỘT tiến trình, và mất sạch khi khởi
      động lại.

      **Chốt 10/09: dự án chạy MỘT tiến trình Node, không PM2 cluster.**
      Với 200 người thì một tiến trình thừa sức, và rẻ hơn dựng Redis rất
      nhiều. Ai đổi sang cluster hay nhiều container thì PHẢI chuyển bộ đếm
      sang Redis trước — nếu không hạn mức thực tế bị nhân lên theo số tiến
      trình và khoá tạm gần như vô hiệu.

      Tự viết thay vì dùng `@nestjs/throttler` vì bản mới nhất (6.5.0) chỉ
      hỗ trợ NestJS tới 11, chưa có bản nào cho NestJS 12.
- [x] ~~Hạn mức đăng nhập theo IP sẽ chặn nhầm cả công ty~~ — **đã xử lý
      10/09.** Đổi KHOÁ chứ không nâng số, ba lớp:

      | Lớp | Khoá theo | Số | Chặn |
      |---|---|---|---|
      | 1 | `ip+email` | 5/phút (`LOGIN_RATE_LIMIT_PER_MINUTE`) | dò mật khẩu một tài khoản từ một máy |
      | 2 | `ip` | 120/phút (`LOGIN_RATE_LIMIT_IP_PER_MINUTE`) | một máy hoá điên, script quét |
      | 3 | email | sai >10 lần/15 phút (`LoginAttemptService`) | dò một tài khoản từ nhiều máy |

      Lớp 2 rộng có chủ ý: nó KHÔNG phải lớp chống dò mật khẩu. 200 người
      đăng nhập rải 5–10 phút đầu ca là 20–40 lần/phút, đỉnh gấp đôi; 120
      dư gấp ba mà vẫn chặn được script.

- [x] ~~Chưa bật `trust proxy`~~ — **đã thêm biến `TRUST_PROXY`** (10/09),
      mặc định 0. **Đặt `TRUST_PROXY=1` khi triển khai sau nginx**, nếu
      quên thì mọi request mang IP của nginx: lớp 2 vô nghĩa, lớp 1 mất
      phần IP, và `AuditLog.ipAddress` ghi sai cho mọi thao tác.

      Đặt SỐ LỚP chứ không phải `true`: `true` là tin toàn bộ chuỗi
      `X-Forwarded-For` do client gửi lên, ai cũng giả được IP để né hạn mức.
- [ ] `GET /departments/tree` trả cây RỖNG cho STAFF. Đúng theo quy ước
      của `getAccessibleDepartmentIds` — **đừng nới lỏng hàm phân quyền**
      chỉ vì giao diện cần hiển thị tên phòng ban.

      **Thông tin phòng ban và chức danh của CHÍNH người dùng — hiện trên
      thanh điều hướng, trang cá nhân — phải lấy từ `GET /auth/me`.**
      Không lấy từ cây phòng ban (STAFF nhận cây rỗng), cũng không lấy từ
      snapshot trên phiếu KPI (lúc đăng nhập lần đầu chưa có phiếu nào).
      `/auth/me` và `/auth/login` đã trả `departmentName`, `jobTitleName`,
      `level` sẵn cho việc này.
- [ ] Khoá tạm theo email không kiểm được bằng curl từ một máy: hạn mức
      5 lần/phút theo IP chặn trước khi đủ 11 lần. Phủ bằng test unit
      (`login-attempt.service.spec.ts`).
- [ ] **Sao lưu chỉ nằm TRÊN CHÍNH MÁY CHỦ ĐÓ — nợ CÓ CHỦ Ý (chốt 10/09).**

      Kế hoạch: `pg_dump` hằng đêm bằng systemd timer, nén, giữ 14 bản ở
      `/var/backups/kpi` trên chính máy chủ tại công ty. **Chưa đẩy ra
      ngoài** — sẽ làm sau.

      **Rủi ro phải nói thẳng:** bản sao nằm cùng ổ, cùng máy, cùng phòng
      với database. Cháy, mất trộm, hỏng ổ, hay ransomware là mất CẢ dữ liệu
      lẫn bản sao. Sao lưu cùng máy chỉ cứu được ba tình huống: xoá nhầm,
      migration hỏng, và lỗi ứng dụng làm sai dữ liệu.

      **Điều kiện xử lý: trước khi mở cho toàn công ty.** Chạy thử một phòng
      tháng 11 thì chấp nhận được; 200 người với dữ liệu tính lương thì
      không. Đích đẩy ra ngoài (NAS, ổ ngoài, cloud storage) chưa chọn.

- [ ] **Chưa cấu hình gì cho việc triển khai.** Repo mới chỉ có
      `docker-compose.yml` cho PostgreSQL ở máy dev: chưa có nginx, chưa có
      systemd/PM2, chưa có CI, chưa có `.env.production.example`.

      Hướng đã trình bày 10/09, **chưa duyệt nên chưa viết**: Docker Compose
      chạy `postgres` + `api`; nginx trên host làm reverse proxy kèm TLS
      Let's Encrypt; frontend build tĩnh cho nginx phục vụ thẳng; backup
      bằng systemd timer.

- [ ] **Mở cổng 80/443 từ internet vào máy chủ công ty — CHƯA XÁC NHẬN.**
      Đây là việc của bộ phận IT/mạng, không phải của code, và là điều kiện
      bắt buộc để tên miền dùng được. Hỏi trước khi tới ngày triển khai.
- [ ] `prisma/seed.ts` để mật khẩu dev mặc định `Hmico@2026` (đổi qua biến
      `SEED_PASSWORD`). Mọi tài khoản có `mustChangePassword = true`, nhưng
      **không được chạy seed trên môi trường thật**.
- [ ] Chức danh các phòng NGOÀI phòng Kỹ thuật trong seed là tạm (Trưởng
      phòng, Giám đốc, Trưởng phòng HCNS, Chuyên viên HCNS, Nhân viên Kinh
      doanh) — chưa đối chiếu biểu mẫu thật. HCNS chốt 03/09/2026: **cứ chạy
      mẫu, tên thật sẽ nhập vào sau khi chạy** (câu D3).
- [x] ~~Import nhân sự từ Excel~~ — **HCNS chốt 03/09/2026 (câu D1): KHÔNG
      cần.** Nhân sự thêm tay khi chạy. Bỏ khỏi phạm vi, không phải hoãn.

## Câu hỏi chờ HCNS trả lời về mẫu KPI

> Mang mục này đi họp. Sáu câu, kèm số liệu đếm được từ chính bốn file
> Excel trong `docs/mau-kpi/`.
>
> **Dữ liệu đã nhập NGUYÊN VĂN vào hệ thống, chưa sửa chỗ nào.** Sửa trước
> khi HCNS xác nhận là làm hỏng mốc đối chiếu tuần 11 — mốc đó yêu cầu điểm
> hệ thống tính ra khớp tuyệt đối với file Excel đang dùng.

### Câu 0c — ĐÃ TRẢ LỜI (03/09/2026)

**Việc giao KPI đầu kỳ CÓ hạn: ngày 25 tháng trước.** Trưởng phòng lên KPI
cho tháng sau vào ngày 25 tháng này.

Toàn bộ lịch trong tháng — bốn mốc 25 / 25 / 27–29 / 30 — xem
`docs/quy-tac-nghiep-vu.md` mục 5.5. Lịch cũ ("hết ngày 02 tháng kế tiếp")
đã bỏ hẳn: nó sai một tháng.

**Đã nối xong 04/09:** `pending-my-action` lấy hạn từ
`Period.assignDeadline` của kỳ chứa hôm nay. Trang chủ "Việc của tôi" hiện
thẻ "Quá hạn" hoặc "Còn N ngày" theo đó.

**MỘT CHỖ CÒN SUY DIỄN — cần hỏi lại HCNS.** Việc `CHO_KY_NHAN` (nhân viên
ký nhận phiếu) cũng đang lấy `assignDeadline`. HCNS chỉ nói **ngày 25 là hạn
TRƯỞNG PHÒNG lên KPI**, không nói hạn nhân viên phải ký xong. Coi chữ ký là
phần cuối của việc "lên KPI" là cách đọc hợp lý nhất — phiếu chưa ai ký thì
chưa chốt được — nhưng vẫn là suy diễn.

**Câu hỏi: nhân viên phải ký nhận phiếu trước ngày mấy?**

Chỗ sửa nếu HCNS trả lời khác: hằng `hanGiaoKpi` trong `pendingMyAction()`
(`src/modules/scorecard/scorecard-query.service.ts`) — tách riêng hạn cho
`CHO_KY_NHAN` thay vì dùng chung một biến.

**Cập nhật 10/09 — đã sửa một nửa.** Mọi việc CÓ PHIẾU giờ đo hạn theo kỳ
CỦA CHÍNH PHIẾU, không theo kỳ chứa hôm nay: `CHO_KY_NHAN`, `CHUA_GUI_KY`,
`CO_Y_KIEN` (hạn `assignDeadline`), `CHO_TU_CHAM` (25), `CHO_TOI_CHAM` (29),
`CHO_TIEP_NHAN` (30). Nhiều phiếu ở nhiều kỳ thì lấy hạn sớm nhất
(`hanSomNhat()`). Phiếu tháng 10 chờ ký vì vậy nhắc theo hạn 25/09, không
còn bị kỳ tháng 9 đo hộ.

**NỬA CÒN LẠI CHƯA SỬA:** việc `CHUA_GIAO_KPI` ("N nhân viên chưa được giao
KPI kỳ X") vẫn chỉ nhìn kỳ CHỨA HÔM NAY, vì nó đếm người CHƯA có phiếu nên
không có phiếu nào để tra ngược kỳ. Ngày 25/09 việc thật là **lên KPI tháng
10**, màn hình vẫn nhắc tháng 9. Hai việc của ban giám đốc
(`BGD_CHUA_GUI_KY`, `BGD_CHUA_GIAO_KPI`) cũng vậy. Sửa khi làm phần theo dõi
tiến độ nộp — lúc đó phải chọn: nhắc kỳ SAU khi đã qua ngày 25, hay nhắc cả
hai kỳ cùng lúc.

### Câu 0b — ĐÃ TRẢ LỜI (03/09/2026)

**Công ty KHÔNG có cấp tổ trưởng. Chỉ có Trưởng phòng và Phó phòng.**

- **Phó phòng chỉ là CHỨC DANH**, quyền như nhân viên thường, KHÔNG chấm điểm.
- **Shop Drawing và Bảo hành bảo trì là chức danh nhân viên**, không phải
  đơn vị tổ chức. Cả bốn nhóm của phòng Kỹ thuật (Kỹ sư triển khai, Kỹ sư
  cấu hình, Nhân viên Shop Drawing, Nhân viên Bảo hành bảo trì) nằm thẳng
  dưới Phòng Kỹ thuật.
- **Ban giám đốc chấm điểm cho Trưởng phòng.**
- **Giám đốc không bị chấm điểm** — không ai chấm ngược lại ban giám đốc.

Đã áp vào seed: bỏ hai đơn vị `KT-SD`, `KT-BT`; HM006 và HM007 từ `MANAGER`
thành `STAFF`; bỏ chức danh `TT` (Tổ trưởng); thêm `KT-PP` (Phó phòng).

Hệ quả: **chỉ còn MỘT cấp quản lý**, nên `nguoiChamDuKien()` không phải
phân biệt cấp phòng với cấp tổ. **Không còn phòng nào bị chặn** (trước là 3).

### Câu 0 — ĐÃ TRẢ LỜI (31/08)

**(a) Chức danh trưởng bộ phận không có mẫu KPI riêng.** Ban giám đốc nhập
KPI trực tiếp vào phiếu qua đường sinh phiếu rỗng.

**(b) Ban giám đốc chấm và duyệt KPI của trưởng bộ phận.** Bỏ hẳn hướng suy
người chấm theo `Department.parentId`.

Xem `docs/quy-tac-nghiep-vu.md` mục 5.0. **Câu trả lời này chỉ phủ TRƯỞNG
BỘ PHẬN, chưa phủ tổ trưởng** — xem Câu 0b.

**Ba ca chặn cũ đã đóng hết (10/09):**

| Phòng | Người | Cách xử lý |
|---|---|---|
| Ban giám đốc | HM002 Giám đốc điều hành | **KHÔNG AI chấm giám đốc.** Giám đốc không có phiếu KPI, chỉ xem và chỉnh sửa. Đã hiện thực: `VAI_TRO_KHONG_AP_KPI = [ADMIN, EXECUTIVE]` (`scorecard-query.service.ts`) |
| Công ty HMICO | HM001 Quản trị hệ thống | tài khoản kỹ thuật, không có phiếu KPI — cùng hằng số trên |
| Phòng Hành chính nhân sự | HM003 Chuyên viên HCNS | **không phải lỗi.** Trên máy dev thì tự bổ nhiệm trưởng phòng để thử; lúc triển khai thật thì ADMIN tạo tài khoản và bổ nhiệm (chốt 10/09) |

`GET /scorecards/readiness/company` vẫn là chỗ lấy danh sách phòng còn trống
trưởng bộ phận — dùng lúc vận hành, không phải nợ kỹ thuật nữa.

### Câu 1 — ĐÃ TRẢ LỜI (10/09/2026)

Ô "Chức danh" ở cả bốn file đều ghi `Kỹ sư triển khai`, kể cả file Shop
Drawing và file bảo hành — **chỉ là chưa sửa trong file gốc, không phải ý
đồ.** Chức danh đúng là bộ đã chốt với hệ thống (Kỹ sư triển khai, Kỹ sư
cấu hình, Nhân viên Shop Drawing, Nhân viên Bảo hành bảo trì).

Hệ thống gán theo tên file, **cách gán này đúng**. Không phải sửa gì.

### Câu 2 — Tên tiêu chí lệch giữa hai sheet

Ở hai file *kỹ sư triển khai* và *kỹ sư cấu hình*, cùng một tiêu chí nhưng
hai sheet ghi khác nhau:

| Sheet | Tên ghi |
|---|---|
| Biểu mẫu (BM.01) | `Tiến độ thi công/ triển khai` |
| Chi tiết | `Tiến độ triển khai` |

Hệ thống lấy tên ở **sheet biểu mẫu** vì đó là bản in chính thức. Xin xác
nhận.

### Câu 3 — ĐÃ TRẢ LỜI (03/09/2026)

**Bốn file Excel chỉ là mẫu thử nghiệm.** Cách làm thật: một tiêu chí lớn
chiếm trọng số bao nhiêu, trong đó có các tiêu chí con được thêm và phân bổ,
**do trưởng phòng đưa ra cho từng nhân viên**.

Nghĩa là mẫu KPI chỉ là điểm khởi đầu, không phải khuôn cứng. Hệ thống phải
cho tự thêm và chỉnh sửa ngay trên phiếu — đã làm: `MANAGER` sinh được phiếu
rỗng và tự soạn cây qua `PUT /scorecards/:id/items`.

Câu hỏi "5 dòng là 5 tiêu chí hay 1" vì vậy **không cần trả lời nữa**:
trưởng phòng tự quyết mỗi tháng.

### Câu 4 — 42 KPI con không có "Cách đo"

Hai file *kỹ sư triển khai* và *kỹ sư cấu hình* mỗi file có **5 nhóm trống
hoàn toàn**, tổng **21 KPI con mỗi file**:

- Chất lượng thi công công trình (6 con)
- Xử lý hồ sơ dự án (3 con)
- Phối hợp & xử lý vấn đề (6 con)
- An toàn, kỷ luật trên công trường (4 con)
- Đánh giá cải tiến (2 con)

Thêm 4 con lẻ ở file bảo hành. **Không có cách đo thì người chấm dựa vào
đâu để cho điểm?**

### Câu 5 — Định dạng "Mục tiêu" lẫn bốn kiểu

| Kiểu | Số lần | Ví dụ |
|---|---|---|
| Có toán tử | 77 | `≥ 95%`, `≤ 3%`, `≤ 1 lỗi/tháng`, `≥ 2` |
| Số nguyên trần | 29 | `0`, `1`, `2` |
| Số thập phân | 4 | `0.95`, `0.03` |
| Chữ | 4 | `Đạt`, `Không mất/hư hỏng do chủ quan` |

**`0.95` và `≥ 95%` xuất hiện trong CÙNG MỘT FILE và gần như chắc chắn
cùng nghĩa** — chỉ khác cách gõ. Tương tự, `1` nhiều khả năng là `100%`.

**Chuẩn hoá việc này KHÔNG phải làm cho đẹp — nó là điều kiện bắt buộc
trước khi bật `scoringMode = CALCULATED`.** Công thức hướng B cần một con
số để chia; nó không đọc được `Đạt`, và không phân biệt được `1` nghĩa là
"1 lần" hay "100%". Chừng nào còn chấm tay (giai đoạn 1) thì chỉ là hiển
thị, nên chưa gây lỗi — đó cũng là lý do dễ quên cho tới lúc bật tính điểm
tự động rồi mới vỡ.

### Câu 6 — 4 KPI con không có Mục tiêu

Đều ở nhóm *"Đánh giá cải tiến"* của hai file *kỹ sư triển khai* và
*kỹ sư cấu hình*:

- Có báo cáo/đề xuất điều chỉnh giải pháp thiết kế
- Đề xuất sản phẩm mới/ hãng mới cho các giải pháp cụ thể

## Lát cắt 5 — chấm điểm

### Chưa rõ, cần hỏi

- [x] ~~Hạn để nhân viên tự chấm và trưởng phòng chấm — chờ chốt~~ —
      **KHÔNG CÓ GÌ PHẢI CHỜ, đã nối 10/09.**

      Tôi đọc sai tình hình: prompt lát cắt 5 ghi lịch cũ ("ngày 02 tháng kế
      tiếp", "nhắc từ 28/30"), và từ chỗ prompt sai tôi kết luận nhầm là mốc
      chưa được chốt. Thật ra mục 5.5 đã chốt đủ bốn mốc từ 03/09/2026, ba
      cột đã có trong database và `kyThang()` đã sinh sẵn.

      Ánh xạ đang dùng ở `pendingMyAction()`:

      | Việc | Cột | Ngày |
      |---|---|---|
      | Nhân viên tự chấm | `selfScoreDeadline` | 25 |
      | Trưởng bộ phận chấm và chốt | `managerScoreDeadline` | 29 |
      | HCNS tiếp nhận | `submitDeadline` | 30 |

      **Hạn lấy từ kỳ CỦA PHIẾU, không phải kỳ chứa hôm nay** — phiếu tháng 8
      chưa chấm mà sang tháng 9 mới mở trang chủ thì phải báo quá hạn, không
      phải "còn 15 ngày". Nhiều phiếu ở nhiều kỳ thì lấy hạn sớm nhất.

      `period-calendar.ts` không phải sửa gì, `tinhTinhTrangHanNop()` dùng
      nguyên.

- [ ] **`LOWER_BETTER`, mục tiêu = 0, thực tế = 0 → cho mấy điểm?**

      Docs mục 3 ghi "điểm tối đa". Hai cách đọc: **đúng thang** (10/10) hay
      **trần vượt thang** (12/10). Đang hiện thực theo cách đọc thứ nhất:
      không có cách nào tốt hơn 0 tai nạn, nên đạt 0 là tròn thang chứ không
      phải vượt chỉ tiêu. Ca "mục tiêu > 0, thực tế = 0" mới là ca chặn trần
      1,2 — tài liệu liệt kê hai ca này riêng nên chúng phải ra hai kết quả
      khác nhau.

      Chỗ sửa nếu HCNS đọc khác: `tinhTyLe()` trong
      `src/modules/scorecard/scoring/huong-b.ts`, nhánh `mucTieu.isZero()`.
      Chưa bật nên chưa ảnh hưởng số thật.

### Nợ đã nhận, không phải quên

- [ ] **`evaluatorId` chốt từ đầu kỳ — người chấm chuyển phòng giữa kỳ thì
      phiếu KẸT, không ai chấm được.**

      `assertLaNguoiCham()` kiểm hai lớp: đúng `evaluatorId` VÀ phòng ban của
      phiếu nằm trong `getAccessibleDepartmentIds` của người đó. Trưởng phòng
      Kỹ thuật được điều sang phòng khác giữa tháng thì vẫn còn là
      `evaluatorId` trên mọi phiếu cũ, nhưng phạm vi mới không còn chứa phòng
      Kỹ thuật — lớp thứ hai chặn lại, và phiếu không ai chấm được nữa.

      **Hướng xử lý dự kiến:** cho `ADMIN` đổi `evaluatorId` của phiếu, ghi
      `AuditLog` và `ScorecardEvent`. KHÔNG nới lỏng lớp phạm vi để "chữa"
      việc này — nới ra là mở đường cho người ngoài phòng chấm điểm.

      **Chưa làm ở lát cắt 5.** Chưa gặp ca thật; điều động giữa tháng ở công
      ty 200 người là hiếm, và khi xảy ra thì `ADMIN` sửa thẳng database vẫn
      là đường thoát tạm chấp nhận được.

- [x] ~~`ADMIN` không tiếp nhận được phiếu~~ — **đã mở** (09/09):
      `@Roles(Role.HR, Role.ADMIN)` trên `receive()`. Tiếp nhận không tạo ra
      con số nào, và `ScorecardEvent` vẫn ghi rõ ai bấm.
- [x] ~~`.claude/rules/prisma.md` ghi `Decimal(18,4)` cho điểm~~ — **đã sửa**
      (09/09): điểm `(6,2)`, trọng số `(5,2)`, `(18,4)` dành cho số liệu thô
      hướng B và số tiền.
- [x] ~~Kỳ khoá trả 409 ở luồng chấm nhưng 400 ở luồng giao KPI~~ —
      **đã thống nhất về 409** (09/09) ở cả `ScorecardService` lẫn
      `ScorecardAssignService`.

- [ ] **Script kiểm chứng tạm đặt `isActive=false`** cho
      `sd.nhanvien2@hmico.vn` để thử ca người đã nghỉ việc, rồi khôi phục
      trong `trap EXIT`. Đây là tài khoản seed, không phải dữ liệu script tự
      tạo nên không gắn được tiền tố `ZTEST-`. Script chết bằng `kill -9`
      thì tài khoản sẽ kẹt ở trạng thái vô hiệu hoá — mở lại bằng
      `UPDATE "User" SET "isActive"=true WHERE email='sd.nhanvien2@hmico.vn';`


- [ ] **Tên hàm trong `scoring/` viết bằng tiếng Việt** (`tinhDiem`,
      `chotDiem`, `xepLoaiTuTongDiem`), trong khi
      `.claude/rules/nestjs-module.md` yêu cầu đặt tên bằng tiếng Anh.

      Làm vậy để đồng bộ với ba file thuần đã có cùng loại:
      `scorecard-validation.ts`, `template-validation.ts`,
      `period-calendar.ts` — cả ba đều đặt tên tiếng Việt. Đổi riêng thư mục
      `scoring/` sẽ làm codebase lệch nhau giữa các file cùng vai trò.
      **Cần chốt một lần cho toàn dự án**, rồi đổi đồng loạt chứ không đổi
      lẻ từng file.

- [ ] **`Scorecard.rejectedAt` / `rejectReason` chỉ là BẢN SAO CHO NHANH**
      của lần trả lại gần nhất. Phiếu bị trả hai lần thì lý do lần đầu chỉ
      còn trong `ScorecardEvent`. Cố ý, giống cặp `disputedAt`/`disputeReason`
      của luồng giao KPI. Màn hình xem lịch sử phải đọc `ScorecardEvent`,
      đừng đọc hai cột này.

- [ ] **Đã XOÁ cột `ScorecardItem.overScaleNote`** (migration
      `20260909073000_lat_cat_5_cham_diem`). Ghi chú khi chấm vượt thang nay
      nằm ở `selfComment` / `managerComment` — mỗi cột điểm một ghi chú, vì
      một cột dùng chung thì không biết ai viết. Kiểm trước khi xoá: 0 dòng
      có giá trị, không có dòng code nào ghi vào.

- [ ] **`.claude/rules/security.md` đã lạc hậu — chờ chốt.**

      File ghi "Bốn vai trò" nhưng dự án có **năm** (thiếu `HR`), và ghi
      `EXECUTIVE` là "xem toàn công ty, **không sửa**" trong khi thực tế ban
      giám đốc **chấm điểm** trưởng bộ phận, **khoá/mở kỳ**, và từ 10/09
      **đọc nhật ký** phiếu KPI.

      Chưa tự sửa vì đây là file quy tắc bảo mật — sai một chữ ở đây là sai
      cả hướng làm về sau. Cần chốt câu chữ rồi mới cập nhật, giống cách đã
      làm với `nestjs-module.md` và `prisma.md`.

## Lát cắt 6 — báo cáo

- [ ] **Bản in TỪNG PHIẾU theo biểu mẫu công ty (BM.01-KPI.KYTHUAT) CHƯA LÀM.**

      Lát cắt 6 chỉ làm bản TỔNG HỢP: một kỳ, mỗi người một dòng, để HCNS
      lọc và cộng. Thứ còn thiếu là bản in một phiếu ra đúng bố cục tờ giấy
      đang dùng — có ô ký tên bốn bên (người lao động, trưởng bộ phận, HCNS,
      ban giám đốc), có cây tiêu chí hai cấp, có hai cột điểm.

      **Vì sao cần:** quy trình thật vẫn ký giấy. Không có bản in thì HCNS
      phải tự gõ lại vào file Excel cũ để in, và hệ thống chỉ thay được một
      nửa việc.

      Chưa chốt in bằng gì: `exceljs` theo bố cục biểu mẫu, hay xuất PDF.
      Bàn khi có phản hồi từ đợt chạy thật tháng 11.

- [ ] **Mốc hạn cho bảng theo dõi tiến độ vẫn để `null`** — chờ HCNS chốt,
      cùng chỗ với mốc hạn chấm điểm ở mục "Lát cắt 5". `submissionProgress()`
      trong `reports.service.ts` gọi `tinhTinhTrangHanNop(null)`; chốt xong
      thì đổi thành cột thật, không phải sửa gì thêm.

      Lưu ý khi chốt: ngày 30 (`submitDeadline`) là hạn TRƯỞNG BỘ PHẬN gửi
      kết quả, còn bảng này theo dõi cả bốn bước — có thể cần mốc riêng.

- [ ] **`AuditLog` của việc xuất Excel chỉ ADMIN xem được.** `entityType`
      là `Report`, mà ban giám đốc chỉ được xem `Scorecard` (chốt 10/09).
      Đúng theo phân quyền đã chốt, nhưng nếu sau này BGĐ cần biết ai tải
      file điểm về thì phải mở thêm loại này cho họ.

## Cài đặt hệ thống (11/09)

- [ ] **Cache cài đặt nằm trong bộ nhớ tiến trình** — cùng giới hạn với
      `RateLimitGuard`: đúng khi chạy MỘT tiến trình (đã chốt), nhiều tiến
      trình thì tiến trình kia thấy giá trị cũ tới khi khởi động lại.
- [ ] **Hạn mức đăng nhập theo IP (5/phút, 120/phút) KHÔNG nằm trong Cài
      đặt** — vẫn là biến môi trường. Chỉ khoá tạm theo email là cấu hình được.
- [ ] Đổi `lichKy` không sửa kỳ đã sinh; đổi `nguongXepLoai` không tính lại
      xếp loại đã chốt — cả hai CỐ Ý, ghi ở quy-tac-nghiep-vu.md mục 4 và 5.5.
      Màn Cài đặt có ghi chú, nhưng người sửa vẫn có thể tưởng nó áp ngay.
- [ ] `PUT /settings` kiểm quan hệ trong `kiemTraCaiDat()`; DTO chỉ kiểm từng
      ô. Thêm nhóm mới thì phải thêm cả hai chỗ.

## Giao diện theo bộ mẫu (11/09)

- [ ] **"Việc của tôi" chưa có dòng phụ** dưới mỗi việc ("Cấp ngày 08/10",
      "Hai chi nhánh · kỳ tháng 10/2026") như mẫu. Backend `pending-my-action`
      chỉ trả `message`; muốn có thì thêm `detail` ở `pendingMyAction()`,
      giao diện đã chừa chỗ.
- [ ] **Font có chân (Lora) áp cho CẢ bảng số liệu** vì bộ mẫu dùng serif
      mọi chỗ. Chưa có phản hồi người dùng thật; nếu bảng dày (Nhân viên,
      Nhật ký) khó đọc thì đặt lại `fontFamily` cho `components.Table` trong
      `theme.ts` — một chỗ.
- [ ] Thẻ "Phòng đã nộp đủ" của HR định nghĩa "đủ" = mọi nhân sự diện KPI
      đều có phiếu **đã chốt điểm** (`MANAGER_SCORED`/`RECEIVED`), không đợi
      HCNS tiếp nhận. Tự quyết, chưa hỏi HCNS.
- [ ] STAFF thẻ "Trung bình N tháng" tính trên **tối đa 3 kỳ gần nhất có
      phiếu đã chốt**; kỳ chưa chốt bị bỏ qua chứ không tính 0. Nhãn thẻ ghi
      đúng số kỳ thật sự được tính.

## Chờ HR xác nhận

- [ ] **Quyền NGHIỆP VỤ của `EXECUTIVE` gồm những gì — chốt khi làm module
      `kpi`.**

      Quyền *quản trị* đã rõ: xem toàn công ty ở mọi màn hình, không ghi
      được gì ở module `org` (xem `docs/quy-tac-nghiep-vu.md` mục 7).
      Quyền *nghiệp vụ* thì chưa.

      **Gần như chắc chắn có:**
      - Ký duyệt KPI cấp phòng ban đầu kỳ (`DRAFT → PROPOSED → ACCEPTED`
        ở cấp BGĐ ↔ trưởng phòng). Giai đoạn 1 đã cắt luồng này vì BSCkpi
        đang làm, nhưng khi mở rộng thì EXECUTIVE là người ký.
      - Soát xét phiếu ngoại lệ (mục 5.2 ghi "Ban giám đốc chỉ ký khi có
        soát xét").
      - Xem dashboard tổng hợp toàn công ty.

      **Cần cân nhắc — khoá/mở kỳ đánh giá.** Tài liệu hiện ghi *chỉ
      `ADMIN`* (mục 5.6). Nhưng khoá kỳ là quyết định **nghiệp vụ** — chốt
      sổ tháng này, không cho sửa điểm nữa — chứ không phải thao tác kỹ
      thuật. Người quyết định thời điểm chốt sổ hợp lý hơn là ban giám đốc
      hoặc HCNS, không phải người quản trị hệ thống.

      Nếu chuyển, cân nhắc tách hai quyền: `EXECUTIVE` khoá kỳ (chốt sổ),
      `ADMIN` mở lại kỳ đã khoá (sửa sai sót, luôn ghi `AuditLog`).

- [ ] **Hai chi nhánh Hà Nội và HCM đang CÁCH LY hoàn toàn.** Trưởng phòng
      Kỹ thuật HCM không thấy bất kỳ dữ liệu nào của Hà Nội, và ngược lại.

      Đây là mặc định theo `docs/quy-tac-nghiep-vu.md` mục 7, **nhưng chưa
      được HR xác nhận**. Thực tế có thể cần: giám đốc chi nhánh xem được
      cả hai, hoặc một số phòng dùng chung.

      **Nếu phải sửa, chỉ là thêm một điều kiện trong
      `getAccessibleDepartmentIds()`** (`src/modules/org/department-scope.service.ts`)
      — không đụng tới schema, không đụng tới bất kỳ endpoint nào, vì mọi
      nơi lọc dữ liệu đều đi qua đúng hàm đó. Đây chính là lợi ích của việc
      chỉ có MỘT hàm phân quyền.

## Ưu tiên trung bình

- [ ] `PUT /scorecards/:id/items` xoá sạch rồi tạo lại cả cây. An toàn vì
      chỉ cho sửa khi `resultStatus = PENDING` (chưa có điểm nào). **Nếu
      sau này cho sửa phiếu đã chấm thì PHẢI đổi sang đối chiếu từng dòng**,
      nếu không điểm đã chấm sẽ mất sạch.

- [ ] `PUT /kpi-templates/:id/items` xoá sạch rồi tạo lại cả cây thay vì
      đối chiếu từng dòng. Đúng với vài chục dòng như hiện nay, nhưng mọi
      `id` của item đều đổi sau mỗi lần lưu. Lát cắt sau `ScorecardItem`
      chụp lại nội dung nên không phụ thuộc `id` — **đừng để lát cắt nào
      lưu tham chiếu tới `KpiTemplateItem.id`**.
- [ ] Chưa có endpoint xem lịch sử phiên bản mẫu. `version` chỉ là số đếm;
      nội dung của phiên bản cũ không lưu lại. Chấp nhận được vì phiếu KPI
      chụp lại nội dung, nhưng không tra ngược được "tháng 8 mẫu ghi gì".

- [ ] **CORS nới lỏng ở dev:** khi `NODE_ENV !== 'production'`, backend
      chấp nhận mọi cổng của `localhost` và `127.0.0.1`
      (`src/config/cors.ts`). Ở production KHÔNG nới lỏng — chỉ đúng địa
      chỉ khai trong `CORS_ORIGINS`.
      **Khi triển khai thật phải đặt `NODE_ENV=production`**, nếu quên thì
      mọi trang chạy ở localhost của máy nạn nhân đều gọi được API.

- [ ] `web/` đã có Vitest, mới phủ `utils/weight.ts` (12 test). Còn thiếu
      test cho `danhGiaMatKhau` và logic hàng đợi refresh trong
      `api/client.ts`.
- [ ] Màn soạn mẫu chưa cảnh báo khi rời trang lúc còn thay đổi chưa lưu.
- [ ] Màn soạn mẫu sắp xếp bằng nút lên/xuống, cố ý không làm kéo thả —
      người dùng là trưởng phòng không rành máy tính. Xem lại sau khi có
      phản hồi thật.
- [ ] Gói frontend 840 kB (276 kB gzip), gần hết là Ant Design. Chấp nhận
      được với phần mềm nội bộ chạy trong mạng công ty; nếu cần giảm thì
      tách chunk theo route.
- [ ] Chưa có màn hình nào dẫn tới `/change-password` cho người muốn tự
      đổi mật khẩu. Route đã cho vào, chỉ thiếu đường dẫn trên giao diện.
- [x] ~~Trang chủ là chỗ giữ chỗ~~ — đã dựng "Việc của tôi" (04/09), đọc từ
      `GET /scorecards/pending-my-action`. Chưa có dashboard tổng hợp cho BGĐ.
- [ ] Màn nhân viên chưa cho sửa `managerId` (người quản lý trực tiếp).
      Backend có sẵn, chỉ thiếu ô chọn trên form.
- [ ] Chưa có import nhân sự từ Excel — chờ file mẫu của HR.

- [ ] **Hai endpoint chưa màn hình nào gọi**, giữ lại có chủ ý:
      - `GET /scorecards` — danh sách phiếu. Màn giao KPI dùng
        `assignment-board` (một dòng mỗi NGƯỜI) nên không cần. Sẽ dùng ở
        lát cắt 5 cho bảng theo dõi tiến độ chấm.
      - `GET /scorecards/readiness` — sẵn sàng MỘT phòng. Màn Phòng ban
        dùng bản `/company`. Màn giao KPI hiện báo lý do SAU khi bấm sinh
        hàng loạt; nối endpoint này vào để cảnh báo TRƯỚC thì tốt hơn.

      **Bài học:** endpoint không ai gọi thì không có gì chứng minh nó còn
      chạy đúng. Cách bắt: đối chiếu danh sách route với danh sách hàm API
      của frontend — chính phép đối chiếu đó vừa lộ ra `POST /scorecards`
      bị bỏ quên, và kéo theo hai quy tắc nghiệp vụ không dùng được.

- [ ] Chưa cấu hình Swagger để sinh tài liệu API
- [ ] Độ phủ test: 35 unit + 3 e2e. Chưa có test cho Guard và controller `auth`
- [x] ~~Chưa có xử lý lỗi tập trung~~ — **`AllExceptionsFilter`** (10/09).
      Dịch `P2002` → 409, `P2025` → 404, `P2003` → 400; lỗi 5xx ghi stack
      vào log máy chủ và chỉ trả ra ngoài một câu chung. **Không đổi hình
      dạng body của `HttpException` đã có** — giao diện đang đọc `message`,
      `code`, `itemIds`, `errors`; bọc lại theo khuôn mới là vỡ ngay màn
      chấm điểm.
- [ ] `package.json` còn gói thừa từ schematic: `@nestjs/mau`,
      `@nestjs/observe`, `ts-loader`, `source-map-support`

## Đã đóng

- ~~CHECK constraint cho tổng `weight` = 100~~ — **bỏ hẳn, không phải hoãn.**
  CHECK của PostgreSQL chỉ xét trong phạm vi một dòng, không kiểm được tổng
  qua nhiều dòng; muốn ép ở tầng database phải dùng trigger. Có `scorecardId`
  thì kiểm ở service là một lần tra theo index, đủ rẻ.
  Xem `docs/quy-tac-nghiep-vu.md` mục 2.
- ~~Ràng buộc `ownerType`~~ — giai đoạn 1 chỉ có `ownerType = USER`,
  `Scorecard.userId` là cột bắt buộc nên không còn chỗ sai.
- ~~Seed để `passwordHash: 'TAM_THOI_CHUA_HASH'`~~ — đã thay bằng argon2 (30/08).
- ~~TS5011 khi chạy Jest~~ — hết cùng lúc bỏ Jest.
- ~~Chưa bật `ValidationPipe` toàn cục~~ — bật 30/08 kèm `whitelist` và
  `forbidNonWhitelisted`: field lạ bị từ chối chứ không lặng lẽ nhận vào.
- ~~Chưa bật `enableCors()`~~ — bật 30/08.
- ~~Chưa có `.env.example`~~ — thêm 30/08, kèm kiểm tra biến môi trường lúc
  khởi động (`src/config/env.validation.ts`): thiếu `JWT_SECRET` thì app
  chết ngay thay vì chạy với chuỗi rỗng.
- ~~NestJS 12 là ESM thuần, dự án lại chốt CommonJS~~ — **đã xử lý 30/08.**
  Chuyển dự án sang ESM + Vitest. Xem `docs/quyet-dinh-cong-nghe.md`.
  Test chạy lại được: 7 unit + 1 e2e.

## Ghi chú

- 18 cảnh báo `npm audit` từ gói phụ thuộc sâu — bỏ qua ở giai đoạn dev.
  **Không chạy `npm audit fix --force`**, lệnh này hay nâng gói lên bản
  không tương thích.
