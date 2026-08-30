# Kiến trúc dự án

Một repo chứa cả backend và frontend. **Không tách thành `apps/api` +
`apps/web`** — tốn công sửa đường dẫn và tài liệu mà không được lợi ích
tương xứng ở giai đoạn này.

## Backend — `src/`

```
src/
├── config/           # kiểm tra biến môi trường lúc khởi động
├── prisma/           # PrismaService (@Global) — mọi module dùng được
├── common/           # guard, decorator, kiểu dùng chung
│   ├── decorators/   # @Public, @Roles, @CurrentUser, @RateLimit
│   ├── guards/       # JwtAuthGuard, RolesGuard, RateLimitGuard
│   └── types/        # AuthenticatedUser
└── modules/
    ├── auth/         # ĐÃ XONG — đăng nhập, JWT, refresh token, đổi mật khẩu
    ├── org/          # LÕI: phòng ban, chức danh, nhân viên
    ├── kpi-template/ # (tuần 5–6) mẫu KPI theo chức danh
    ├── scorecard/    # (tuần 7–8) giao KPI tháng, ký nhận
    ├── scoring/      # (tuần 9–10) hai cột chấm, tính điểm, xếp loại
    ├── dashboard/    # (tuần 12) tổng hợp, theo dõi tiến độ nộp
    └── audit/        # CHƯA CÓ — nhật ký thao tác
prisma/
├── schema.prisma
├── migrations/
└── seed.ts
scripts/
└── verify-auth.sh    # kiểm chứng xác thực bằng curl trên hệ thống chạy thật
```

### Ba lớp bắt buộc, không được nhảy cóc

- `controller` — nhận request, không chứa nghiệp vụ, không gọi database
- `service` — toàn bộ nghiệp vụ và truy vấn database
- `dto` — khai báo dữ liệu vào/ra, kèm validate bằng `class-validator`

### Guard đăng ký toàn cục

`JwtAuthGuard` và `RolesGuard` đăng ký qua `APP_GUARD` trong `AuthModule`,
nên **mặc định mọi endpoint đều cần đăng nhập**. Muốn mở phải khai rõ
`@Public()`.

Quên gắn Guard ở controller mới sẽ khiến endpoint không truy cập được, chứ
không mở toang. Sai theo hướng an toàn.

### Phạm vi dữ liệu — chỉ một hàm duy nhất

`DepartmentScopeService.getAccessibleDepartmentIds()` trong `org/` là nơi
DUY NHẤT quyết định người dùng xem được phòng ban nào. Mọi endpoint cần
lọc dữ liệu đều gọi vào đây.

Không để mỗi module tự kiểm một kiểu — đây là chỗ dễ sinh lỗ hổng nhất.

### Vì sao tách `org/` khỏi các module KPI

`org/` là lõi tổ chức: phòng ban, chức danh, nhân viên. Giai đoạn 2 sẽ
thêm `attendance/` (chấm công ca) dùng chung lõi này.

Nếu logic KPI rò rỉ vào `org/`, sau này thêm chấm công sẽ phải gỡ rối rất
tốn công. Đây là ràng buộc kiến trúc quan trọng nhất của dự án.

### Luồng một request điển hình

```
Trình duyệt
  → JwtAuthGuard   (xác thực, gán request.user)
  → RolesGuard     (lọc thô theo vai trò)
  → ValidationPipe (kiểm dữ liệu vào theo DTO)
  → Controller
  → Service        (nghiệp vụ + lọc theo getAccessibleDepartmentIds)
  → PrismaService
  → PostgreSQL
```

Mọi thao tác sửa `Scorecard` hoặc `ScorecardItem` phải ghi `AuditLog` trong
cùng service đó.

## Frontend — `web/`

```
web/
├── index.html
├── vite.config.ts
├── tsconfig.json          # kiểu solution, trỏ tới hai file dưới
│   ├── tsconfig.app.json  # cho src/
│   └── tsconfig.node.json # cho vite.config.ts
├── .env.example           # VITE_API_URL
└── src/
    ├── main.tsx           # ConfigProvider(viVN) · antd App · QueryClient · Router · AuthProvider
    ├── App.tsx            # định tuyến
    ├── config/env.ts      # đọc VITE_API_URL, thiếu là ném lỗi ngay
    ├── types/             # kiểu dùng chung, nhãn tiếng Việt cho vai trò
    ├── auth/              # giữ token, context, khôi phục phiên
    ├── api/               # axios client + interceptor, hàm gọi API
    ├── routes/            # ProtectedRoute, PublicOnlyRoute
    └── pages/             # từng màn hình
```

### Bộ công cụ đã chốt

| Thành phần | Chọn |
|---|---|
| Dựng dự án | Vite + React + TypeScript |
| Thư viện giao diện | **Ant Design** |
| Gọi API | TanStack Query |
| Định tuyến | React Router |
| Biểu mẫu | Form của Ant Design |
| HTTP client | axios |

**Không dùng Tailwind CSS, không dùng shadcn/ui.** Chọn Ant Design vì hệ
thống này cần bảng dữ liệu dày đặc có sắp xếp/lọc, `TreeSelect` cho cây
phòng ban bốn tầng, `DatePicker` theo kỳ tháng có locale tiếng Việt, và
biểu mẫu chấm điểm dạng lưới nhiều dòng. Ant Design có sẵn tất cả; ghép lại
bằng shadcn tốn nhiều tuần mà dự án không có.

Đây là phần mềm nội bộ — chạy đúng và nhanh quan trọng hơn đẹp.

### Giữ token

- **Access token: trong bộ nhớ** (`token-store.ts`). Không đưa vào
  `localStorage` vì mã lạ đọc được. Mất khi F5 cũng không sao.
- **Refresh token: `localStorage`.** Nợ kỹ thuật có chủ ý — xem
  `docs/no-ky-thuat.md`.

Để ở tầng module chứ không phải React state, vì interceptor của axios cần
đọc token đồng bộ, ngoài vòng đời render.

### Tự làm mới token — single-flight

Interceptor gặp 401 thì gọi `/auth/refresh` rồi thử lại request gốc.

Nhiều request cùng gặp 401 **chỉ gọi refresh MỘT lần**, các request còn lại
chờ chung một promise. Backend xoay vòng refresh token: gọi song song thì
request đầu thu hồi token, những cái sau dùng token đã chết và đá người
dùng ra màn hình đăng nhập.

`/auth/refresh` dùng instance axios **riêng** — dùng chung sẽ gây đệ quy vô
hạn khi chính lời gọi refresh trả 401.

### Luồng đăng nhập

```
/login  ──đăng nhập──> mustChangePassword?
                        ├─ có  ──> /change-password ──đổi xong──> /login
                        └─ không ──> /
```

`ProtectedRoute` gộp cả hai ràng buộc — chưa đăng nhập thì về `/login`, có
cờ `mustChangePassword` thì về `/change-password` — để không thể quên khi
thêm route mới.
