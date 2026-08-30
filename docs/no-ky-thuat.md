# Nợ kỹ thuật

> Mỗi khi tạm bỏ qua điều gì, ghi vào đây ngay. Làm một mình rất dễ quên
> những chỗ để tạm.

## Ưu tiên cao — phải xử lý trước khi lên chạy thật

- [ ] Chưa có `AuditLog` cho bất kỳ thao tác nào — **kể cả đăng xuất**.
      Yêu cầu ghi log đăng xuất phải hoãn tới khi có module `audit`.
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
- [ ] Tên bốn chức danh phòng Kỹ thuật trong seed đang là tạm — sửa lại khi
      có `BM.01-KPI.KYTHUAT` thật

## Ưu tiên trung bình

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
