# Kiến trúc dự án

## Cấu trúc thư mục

```
src/
├── prisma/           # PrismaService (@Global) — mọi module dùng được
├── modules/
│   ├── org/          # LÕI: phòng ban + nhân viên
│   ├── auth/         # đăng nhập, JWT, phân quyền
│   ├── kpi/          # định nghĩa KPI, kỳ, giao KPI phân cấp
│   ├── result/       # nhập kết quả, luồng duyệt
│   ├── dashboard/    # truy vấn tổng hợp
│   └── audit/        # nhật ký thao tác
└── common/           # guard, filter, decorator, pipe dùng chung
prisma/
├── schema.prisma
├── migrations/
└── seed.ts
```

## Nguyên tắc phân chia

Mỗi module có ba lớp, không được nhảy cóc:

- `controller` — nhận request, không chứa nghiệp vụ, không gọi database
- `service` — toàn bộ nghiệp vụ và truy vấn database
- `dto` — khai báo dữ liệu vào/ra, kèm validate

## Vì sao tách `org/` khỏi `kpi/`

`org/` là lõi tổ chức: phòng ban, nhân viên, quan hệ quản lý. Giai đoạn 2
sẽ thêm module `attendance/` (chấm công ca) dùng chung lõi này.

Nếu logic KPI rò rỉ vào `org/`, sau này thêm chấm công sẽ phải gỡ rối
rất tốn công. Đây là ràng buộc kiến trúc quan trọng nhất của dự án.

## Luồng một request điển hình

```
Trình duyệt
  → Guard (kiểm tra JWT + vai trò)
  → ValidationPipe (kiểm tra dữ liệu vào theo DTO)
  → Controller
  → Service (nghiệp vụ + ràng buộc)
  → PrismaService
  → PostgreSQL
```

Mọi thao tác sửa `KpiAssignment` hoặc `KpiResult` phải ghi `AuditLog`
trong cùng service đó.