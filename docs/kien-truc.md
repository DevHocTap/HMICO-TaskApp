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
    ├── kpi-template/ # ĐÃ XONG — mẫu KPI theo chức danh, kiểm trọng số
    ├── scorecard/    # (tuần 7–8) giao KPI tháng, ký nhận
    ├── scoring/      # (tuần 9–10) hai cột chấm, tính điểm, xếp loại
    ├── dashboard/    # (tuần 12) tổng hợp, theo dõi tiến độ nộp
    └── audit/        # CHƯA CÓ — nhật ký thao tác
prisma/
├── schema.prisma
├── migrations/
├── seed.ts       # CHỈ dùng cho máy dev
└── bootstrap.ts  # khởi tạo hệ thống THẬT
scripts/
└── verify-auth.sh    # kiểm chứng xác thực bằng curl trên hệ thống chạy thật
```

### Hai script khởi tạo dữ liệu — đừng nhầm

| | `prisma/seed.ts` | `prisma/bootstrap.ts` |
|---|---|---|
| Dùng ở đâu | **Chỉ máy dev** | **Chỉ hệ thống thật, chạy MỘT lần** |
| Chạy bằng | `npx prisma db seed` | `npm run bootstrap` |
| Tạo ra | 16 phòng ban, 9 chức danh, 14 người dùng giả | Đúng 1 tài khoản ADMIN |
| Mật khẩu | `Hmico@2026` cố định, ai cũng biết | Lấy từ `BOOTSTRAP_ADMIN_PASSWORD` |
| Chạy lại | Xoá sạch rồi tạo lại | **Từ chối** nếu đã có ADMIN |

**Không bao giờ chạy `seed.ts` trên hệ thống thật.** Nó xoá sạch dữ liệu
rồi tạo 14 tài khoản có mật khẩu ai cũng đoán được.

`bootstrap.ts` cố ý KHÔNG tạo phòng ban hay chức danh: cơ cấu tổ chức thật
do quản trị viên tự dựng qua giao diện, không sinh ra từ mã nguồn.

### Ràng buộc trưởng bộ phận

`Department.managerId` là thứ quyết định ai duyệt KPI của phòng đó. Phòng
thiếu trưởng bộ phận thì **KPI không ai duyệt được, và lỗi chỉ lộ ra vào
cuối tháng** khi nhân viên đã nộp kết quả.

Nên hệ thống chặn ở ba chỗ:

1. **Backend** — không cho vô hiệu hoá, cũng không cho chuyển phòng, một
   người đang là `Department.managerId` của phòng nào đó. Lỗi nêu rõ tên
   phòng và yêu cầu chỉ định người thay trước.
2. **Form nhân viên** — chọn vai trò MANAGER cho người thuộc phòng chưa có
   trưởng bộ phận thì hiện gợi ý đặt luôn.
3. **Cây phòng ban** — phòng chưa có trưởng bộ phận mang dấu cảnh báo màu
   vàng, nhìn một lượt là thấy chỗ nào còn thiếu.

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

### Nhật ký thao tác

Mọi thao tác sửa `Scorecard` hoặc `ScorecardItem` phải ghi `AuditLog` trong
cùng service đó.

**Nguyên tắc: log và thao tác phải nằm CÙNG MỘT TRANSACTION.** Truyền client
của transaction vào `AuditService.log(entry, tx)` — khi đó thao tác bị
rollback thì log cũng biến mất, và log ghi hỏng thì thao tác cũng không
thành.

Với `Scorecard` đây là **bắt buộc**, không phải khuyến nghị: nhật ký chấm
điểm là bằng chứng khi có tranh cãi về lương thưởng. Một bản ghi log mô tả
việc chưa từng xảy ra, hoặc một thao tác đã xảy ra mà không có log, đều làm
hỏng giá trị bằng chứng của cả bảng.

Với các thao tác nhẹ hơn (`org`), gọi `log(entry)` không kèm transaction là
chấp nhận được: mất một dòng log không đáng để huỷ thao tác đã thành công.

### Trọng số: cộng bằng số nguyên, không dùng số thực

Backend cộng bằng `Prisma.Decimal`. Frontend **phải ra cùng kết quả**, nếu
không thanh tổng trọng số báo xanh mà API vẫn từ chối xuất bản.

`web/src/utils/weight.ts` quy trọng số về số nguyên phần-trăm-của-trăm rồi
cộng, thay vì dùng `+` của JavaScript. Lý do rất cụ thể:

```
28.4 + 35.8 + 35.8  ->  99.99999999999999
28.6 + 35.7 + 35.7  -> 100.00000000000001
```

Cả hai mẫu này hợp lệ, nhưng cộng bằng số thực thì màn hình báo đỏ và
người dùng không hiểu vì sao. Có 12 test phủ phần này.

Nút "Chia đều trọng số" cũng dồn phần dư vào các phần đầu: chia 100 cho 3
ra `33.34 / 33.33 / 33.33`, không phải `33.33` ba lần rồi lệch mất 0.01.

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
    ├── routes/            # ProtectedRoute, PublicOnlyRoute, RoleRoute
    ├── components/        # AdminLayout, TemporaryPasswordModal
    └── pages/
        ├── LoginPage, ChangePasswordPage, HomePage
        └── admin/         # DepartmentsPage, JobTitlesPage, UsersPage,
                           # KpiTemplatesPage, KpiTemplateEditorPage
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

### Menu và route theo vai trò

| Vai trò | Thấy menu | Ghi được |
|---|---|---|
| `ADMIN`, `HR` | Phòng ban · Chức danh · Nhân viên · Mẫu KPI | có |
| `EXECUTIVE` | cả bốn mục, toàn công ty | không |
| `MANAGER` | Nhân viên · Mẫu KPI, trong phạm vi phòng mình | không |
| `STAFF` | không có menu quản trị | không |

**Ẩn menu và chặn route ở giao diện KHÔNG PHẢI BẢO MẬT.** Chúng chỉ để
người dùng không bấm vào thứ sẽ báo lỗi. Backend chặn độc lập bằng
`RolesGuard` và `getAccessibleDepartmentIds` — gõ thẳng URL hay gọi API
trực tiếp đều bị chặn ở đó. Logic hiển thị nằm ở `src/auth/permissions.ts`,
cố ý tách riêng để không ai nhầm nó với lớp phân quyền thật.
