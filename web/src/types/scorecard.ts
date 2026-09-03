/**
 * Kết quả kiểm tra sẵn sàng giao KPI toàn công ty.
 *
 * Điểm quan trọng của kiểu này là nó TÁCH HAI LOẠI:
 *
 * - `departmentsWithoutManager` — phòng đang CÓ nhân sự mà thiếu trưởng bộ
 *   phận. **Chặn thật**: những người đó không sinh được phiếu KPI.
 * - `emptyOrgUnits` — đơn vị tổ chức chưa có ai. **Bình thường**, chưa có
 *   người thì chưa cần trưởng.
 *
 * Trộn hai loại lại là tạo báo động giả. Backend đã tách sẵn, giao diện chỉ
 * việc dùng đúng — đừng tự đếm `!managerId` trên cây phòng ban.
 */
export interface NhanSuBiChan {
  employeeCode: string;
  fullName: string;
  role: string;
}

export interface PhongThieuTruong {
  code: string;
  name: string;
  headcount: number;
  blockedEmployees: NhanSuBiChan[];
}

export interface DonViRong {
  code: string;
  name: string;
}

export interface SanSangCongTy {
  totalDepartments: number;
  totalEmployees: number;
  missingSystemTemplate: boolean;
  departmentsWithoutManager: PhongThieuTruong[];
  emptyOrgUnits: DonViRong[];
  employeesWithoutJobTitle: Array<{
    employeeCode: string;
    fullName: string;
    department: string;
  }>;
}
