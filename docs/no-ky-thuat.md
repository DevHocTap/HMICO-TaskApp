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
- [ ] `AuditService` đã nối vào module `org` (tạo/sửa/vô hiệu hoá phòng
      ban, chức danh, nhân viên, đổi vai trò, đặt lại mật khẩu). **Chưa
      nối vào `auth`** — đăng nhập, đăng xuất, đổi mật khẩu chưa ghi log.
- [ ] Chưa có giao diện xem `AuditLog`. Hiện chỉ tra được bằng SQL.
- [ ] Module `org` gọi `audit.log()` KHÔNG kèm transaction. Chấp nhận được
      với thao tác nhân sự, nhưng `Scorecard` thì bắt buộc phải kèm — xem
      `docs/kien-truc.md` mục Nhật ký thao tác.
- [ ] **`RateLimitGuard` và `LoginAttemptService` đều đếm trong BỘ NHỚ
      TIẾN TRÌNH.** Chỉ đúng khi chạy MỘT tiến trình, và mất sạch khi khởi
      động lại. Chạy nhiều tiến trình (PM2 cluster, nhiều container) phải
      chuyển sang Redis — nếu không, hạn mức thực tế bị nhân lên theo số
      tiến trình và khoá tạm gần như vô hiệu.
      Tự viết thay vì dùng `@nestjs/throttler` vì bản mới nhất (6.5.0) chỉ
      hỗ trợ NestJS tới 11, chưa có bản nào cho NestJS 12.
- [ ] **Hạn mức đăng nhập theo IP sẽ chặn nhầm cả công ty.** 200 nhân sự
      sau NAT dùng chung MỘT địa chỉ IP công cộng; mặc định 5 lần/phút
      nghĩa là sáng thứ Hai người thứ sáu đăng nhập đã bị chặn.

      Đã cho cấu hình qua `LOGIN_RATE_LIMIT_PER_MINUTE`, nhưng **nâng số
      lên chỉ là vá tạm** — cách đúng là khoá theo `email + IP` thay vì
      chỉ IP. Lớp khoá tạm theo email (`LoginAttemptService`) mới là thứ
      thật sự chặn dò mật khẩu; hạn mức IP chỉ chống một máy hoá điên.

      **Phải chốt con số trước khi mở cho toàn công ty.**

- [ ] Chưa bật `trust proxy`. Khi chạy sau nginx, mọi request sẽ mang cùng
      một IP — làm vấn đề trên tệ thêm, vì đến cả IP nội bộ cũng gộp làm một.
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
- [ ] Chưa cấu hình backup database (`pg_dump` hằng đêm + đẩy ra ngoài)
- [ ] `prisma/seed.ts` để mật khẩu dev mặc định `Hmico@2026` (đổi qua biến
      `SEED_PASSWORD`). Mọi tài khoản có `mustChangePassword = true`, nhưng
      **không được chạy seed trên môi trường thật**.
- [ ] Chức danh các phòng NGOÀI phòng Kỹ thuật trong seed là tạm (Trưởng
      phòng, Tổ trưởng, Giám đốc, Chuyên viên HCNS, Nhân viên Kinh doanh)
      — chưa đối chiếu biểu mẫu thật. Bốn chức danh phòng Kỹ thuật đã đúng
      theo Excel.
- [ ] **Import nhân sự từ Excel chưa làm** — chưa có file mẫu của HR nên
      chưa biết định dạng cột. Làm ở lát cắt riêng, đừng đoán cấu trúc.

## Chờ HCNS xác nhận — dữ liệu gốc trong bốn file Excel

> Đã nhập **nguyên văn**, chưa sửa chỗ nào. Liệt kê ở đây để hỏi lại.

- [ ] **Cả BỐN file đều ghi `Chức danh: Kỹ sư triển khai`** — không riêng
      file Shop Drawing. Nhiều khả năng ba file sau tạo bằng cách copy file
      đầu rồi quên sửa ô chức danh. Seed đã gán đúng chức danh theo tên
      file; cần HCNS xác nhận.

- [ ] **Tên tiêu chí lệch giữa hai sheet** ở hai file *kỹ sư triển khai* và
      *kỹ sư cấu hình*: sheet biểu mẫu ghi `Tiến độ thi công/ triển khai`,
      sheet chi tiết ghi `Tiến độ triển khai`. Seed lấy tên ở **sheet biểu
      mẫu** vì đó là bản in chính thức (BM.01).

- [ ] **Cột "Cách đo" bị chép trùng cho mọi KPI con trong cùng một nhóm**
      — 12 nhóm bị. Nặng nhất là file Shop Drawing: **cả 6/6 nhóm** đều có
      mọi KPI con dùng chung một câu cách đo. Ví dụ nhóm "Tính khả thi thi
      công" có 5 KPI con khác hẳn nhau nhưng cùng một cách đo *"Tỷ lệ bản
      vẽ không phát sinh lỗi thi công..."*.
      **Nếu đúng như vậy thì 5 KPI con đó thực chất là một** — cần HCNS
      xác nhận từng nhóm có cách đo riêng hay không.

- [ ] **44 KPI con không có "Cách đo"**, tập trung ở hai file *kỹ sư triển
      khai* và *kỹ sư cấu hình*: các nhóm "Chất lượng thi công công trình"
      (6/6), "Xử lý hồ sơ dự án" (3/3), "Phối hợp & xử lý vấn đề" (6/6),
      "An toàn, kỷ luật trên công trường" (4/4), "Đánh giá cải tiến" (2/2)
      đều trống hoàn toàn.

- [ ] **Định dạng "Mục tiêu" lẫn lộn bốn kiểu**, chưa chuẩn hoá:
      | Kiểu | Số lần | Ví dụ |
      |---|---|---|
      | Có toán tử | 77 | `≥ 95%`, `≤ 3%`, `≤ 1 lỗi/tháng`, `≥ 2` |
      | Số nguyên trần | 29 | `0`, `1`, `2` |
      | Số thập phân | 4 | `0.95`, `0.03` |
      | Chữ | 4 | `Đạt`, `Không mất/hư hỏng do chủ quan` |
      Đáng chú ý: `0.95` và `≥ 95%` xuất hiện trong cùng một file, nhiều
      khả năng cùng nghĩa. `1` có thể là `100%`.
      Giai đoạn 1 chấm tay nên chỉ hiển thị, chưa ảnh hưởng. **Nhưng phải
      chuẩn hoá trước khi bật `scoringMode = CALCULATED`** — công thức
      hướng B cần số, không đọc được `Đạt`.

- [ ] **4 KPI con không có Mục tiêu**, đều ở nhóm "Đánh giá cải tiến" của
      hai file *kỹ sư triển khai* và *kỹ sư cấu hình*.

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

- [ ] **CORS nới lỏng ở dev:** khi `NODE_ENV !== 'production'`, backend
      chấp nhận mọi cổng của `localhost` và `127.0.0.1`
      (`src/config/cors.ts`). Ở production KHÔNG nới lỏng — chỉ đúng địa
      chỉ khai trong `CORS_ORIGINS`.
      **Khi triển khai thật phải đặt `NODE_ENV=production`**, nếu quên thì
      mọi trang chạy ở localhost của máy nạn nhân đều gọi được API.

- [ ] `web/` chưa có test nào — chưa cài bộ chạy test. Hàm
      `danhGiaMatKhau` và logic hàng đợi refresh trong `api/client.ts` là
      hai chỗ đáng phủ trước nhất.
- [ ] Gói frontend 840 kB (276 kB gzip), gần hết là Ant Design. Chấp nhận
      được với phần mềm nội bộ chạy trong mạng công ty; nếu cần giảm thì
      tách chunk theo route.
- [ ] Chưa có màn hình nào dẫn tới `/change-password` cho người muốn tự
      đổi mật khẩu. Route đã cho vào, chỉ thiếu đường dẫn trên giao diện.
- [ ] Trang chủ vẫn là chỗ giữ chỗ ("Đang xây dựng"). Menu điều hướng đã
      có, nhưng chưa có nội dung dashboard.
- [ ] Màn nhân viên chưa cho sửa `managerId` (người quản lý trực tiếp).
      Backend có sẵn, chỉ thiếu ô chọn trên form.
- [ ] Chưa có import nhân sự từ Excel — chờ file mẫu của HR.

- [ ] Chưa cấu hình Swagger để sinh tài liệu API
- [ ] Độ phủ test: 35 unit + 3 e2e. Chưa có test cho Guard và controller `auth`
- [ ] Chưa có xử lý lỗi tập trung (exception filter)
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
