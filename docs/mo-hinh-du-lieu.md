# Mô hình dữ liệu

Schema đầy đủ ở `prisma/schema.prisma`. File này giải thích **vì sao**
thiết kế như vậy — phần schema không nói ra được.

## Tám bảng

| Bảng | Vai trò |
|---|---|
| `Department` | Cây phòng ban, `parentId` tự trỏ |
| `User` | Nhân viên, có `departmentId` và `managerId` |
| `KpiTemplate` | Mẫu KPI theo chức danh — thứ được dùng lại nhiều kỳ |
| `KpiTemplateItem` | Dòng trong mẫu, hai cấp qua `parentId`, **tự chứa nội dung** |
| `Period` | Kỳ đánh giá (tháng/quý/năm), có cờ khoá kỳ |
| `KpiAssignment` | **Bảng trung tâm** — một lần giao KPI cụ thể |
| `KpiResult` | Số liệu thực tế nhập vào theo thời gian |
| `Approval` | Lịch sử nộp/duyệt/trả lại |
| `AuditLog` | Nhật ký mọi thao tác sửa đổi |

## Ba quyết định thiết kế cốt lõi

### 1. Mẫu KPI tách khỏi phiếu KPI

Mẫu *"Kỹ sư triển khai"* dùng lại mãi mãi. *"Phiếu KPI tháng 08/2026 của
anh A"* là một lần giao cụ thể.

Gộp hai thứ này là lỗi phổ biến nhất — gộp rồi thì mỗi kỳ phải khai lại
toàn bộ KPI từ đầu.

**Không còn bảng `KpiDefinition`.** `KpiTemplateItem` tự chứa toàn bộ nội
dung: tên, mô tả, mục tiêu, cách đo, trọng số. Lý do ở
`docs/quyet-dinh-cong-nghe.md`.

`maxScale` **không phải là cột** — suy ra từ `section` bằng hằng số trong
`src/modules/kpi-template/kpi-scale.constants.ts` (`BSC_WORK` → 10,
`COMPLIANCE` → 3). Để thành cột thì database cho phép tồn tại dữ liệu vô
nghĩa và kéo theo ràng buộc "cha con phải cùng thang".

### 2. `KpiAssignment.parentId` tạo phân cấp

KPI công ty đẻ ra KPI phòng, KPI phòng đẻ ra KPI cá nhân.
Dashboard cộng dồn ngược lên theo chuỗi này.

Hiện lấy toàn bộ rồi ghép cây trong code (nhanh nhất với vài chục nút).
Khi cây lớn tới hàng nghìn nút mới cần chuyển sang `WITH RECURSIVE`.

### 3. `Decimal` chứ không phải `Float`

Float lưu số thập phân gần đúng: `0.1 + 0.2 = 0.30000000000004`.
Với tiền và điểm thưởng, đây là lỗi không thể chấp nhận.

Chuẩn: `@db.Decimal(18, 4)` cho giá trị, `@db.Decimal(5, 2)` cho trọng số.

## Ràng buộc nghiệp vụ — phải kiểm ở tầng service

Prisma không ép được, nên service phải tự kiểm:

1. **Tổng `weight` của một người trong một kỳ = 100.**
2. **`ownerType` phải khớp cột được điền**: `DEPARTMENT` thì `departmentId`
   có giá trị và `ownerUserId` rỗng, và ngược lại với `USER`.
3. **Không cho sửa `KpiResult` khi `Period.isLocked = true`.**
4. **KPI con không được thuộc kỳ khác với KPI cha.**

Ràng buộc 1 và 2 nên viết thêm CHECK constraint bằng raw SQL trong
migration để chặn ở tầng database.

## Vì sao `AuditLog` không có khoá ngoại

`AuditLog` cố ý không ràng buộc tới bảng nghiệp vụ. Khi một KPI bị xoá,
log vẫn phải còn — đó chính là lúc cần tra cứu nhất.