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

## `ScorecardEvent` là nguồn sự thật của luồng trạng thái

Bảng `Scorecard` có bốn cột dấu vết: `proposedAt`, `proposedById`,
`acceptedAt`, `disputedAt`, `disputeReason`.

**Chúng chỉ là bản sao cho nhanh của sự kiện MỚI NHẤT.** Nguồn sự thật là
`ScorecardEvent` — mỗi lần chuyển trạng thái ghi một dòng, không bao giờ
ghi đè.

Lý do rất cụ thể: một phiếu có thể bị phản đối **nhiều lần**. Cột
`disputeReason` chỉ giữ được lý do gần nhất; lý do lần đầu — thứ có thể là
căn cứ khi tranh cãi lương thưởng — sẽ mất nếu không có bảng sự kiện.

**Quy tắc bắt buộc:** cột dấu vết và `ScorecardEvent` phải ghi trong **cùng
một transaction, qua đúng một hàm**. Hai chỗ ghi rời nhau sẽ có lúc lệch,
và khi lệch thì không biết bên nào đúng.

Ba bảng ghi nhận, đừng nhầm vai:

| Bảng | Dùng để | Có khoá ngoại |
|---|---|---|
| `ScorecardEvent` | Lịch sử nghiệp vụ của một phiếu, hiện lên giao diện | có |
| `AuditLog` | Truy vết hệ thống, mọi bảng, tra khi có sự cố | không |
| Cột dấu vết trên `Scorecard` | Đọc nhanh trạng thái hiện tại, không phải lịch sử | — |

## Hồ sơ nhân sự tách khỏi tài khoản (14/09/2026)

`User` là **tài khoản đăng nhập** (email, mật khẩu, vai trò, phòng, chức
danh). `EmployeeProfile` (1–1, `userId` là khoá chính) là **hồ sơ**: điện
thoại, email cá nhân, địa chỉ, ngày sinh, giới tính, liên hệ khẩn cấp
(nhân viên tự sửa); ngày vào làm, ngày nghỉ việc, CCCD (chỉ HCNS/ADMIN).

Tách ra vì giai đoạn 2 chấm công sẽ thêm nhiều trường nữa (hợp đồng, phép,
ngân hàng…) — nhét vào `User` thì mọi truy vấn auth/KPI kéo theo, và
`/auth/me` dễ rò trường nhạy cảm. **Trường nào ai sửa được quyết ở DTO**
(`UpdateMyProfileDto` ⊂ `UpdateEmployeeProfileDto`), không ở schema;
`forbidNonWhitelisted` chặn nhân viên gửi trường HR. CCCD che còn 4 số cuối
khi trưởng phòng xem và trong `AuditLog`.

`EmployeeAssignmentHistory` ghi **tự động** mỗi lần tạo tài khoản hoặc HR
đổi phòng / chức danh / cấp bậc: đóng dòng đang hiệu lực (`validTo` = hôm
nay), mở dòng mới. Chưa có màn hình đọc — tích luỹ để chấm công biết người
chuyển phòng ngày 15 thì nửa đầu tháng thuộc phòng nào. Migration
`20260914100000_ho_so_nhan_su` chèn sẵn một dòng cho mọi người đang có
(từ ngày tạo tài khoản). Cột ngày dùng `@db.Date`, không có giờ.

## Vì sao `AuditLog` không có khoá ngoại

`AuditLog` cố ý không ràng buộc tới bảng nghiệp vụ. Khi một KPI bị xoá,
log vẫn phải còn — đó chính là lúc cần tra cứu nhất.