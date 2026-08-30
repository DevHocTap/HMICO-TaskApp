# Nợ kỹ thuật

> Mỗi khi tạm bỏ qua điều gì, ghi vào đây ngay. Làm một mình rất dễ quên
> những chỗ để tạm.

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
- [ ] `AuditService` đã có nhưng **CHƯA CÓ NƠI NÀO GỌI**. Nối vào các
      thao tác của module `org` ở giai đoạn 2. Đăng xuất cũng chưa ghi log.
- [ ] Chưa có giao diện xem `AuditLog`. Hiện chỉ tra được bằng SQL.
- [ ] **`RateLimitGuard` và `LoginAttemptService` đều đếm trong BỘ NHỚ
      TIẾN TRÌNH.** Chỉ đúng khi chạy MỘT tiến trình, và mất sạch khi khởi
      động lại. Chạy nhiều tiến trình (PM2 cluster, nhiều container) phải
      chuyển sang Redis — nếu không, hạn mức thực tế bị nhân lên theo số
      tiến trình và khoá tạm gần như vô hiệu.
      Tự viết thay vì dùng `@nestjs/throttler` vì bản mới nhất (6.5.0) chỉ
      hỗ trợ NestJS tới 11, chưa có bản nào cho NestJS 12.
- [ ] Chưa bật `trust proxy`. Khi chạy sau nginx, mọi request sẽ mang cùng
      một IP và cả công ty dùng chung hạn mức tần suất.
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
- [ ] Trang chủ mới là chỗ giữ chỗ ("Đang xây dựng"), chưa có menu điều
      hướng thật.

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
