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

// ------------------------------------------------------------ phiếu KPI

export type AssignStatus = 'DRAFT' | 'PROPOSED' | 'ACCEPTED' | 'DISPUTED';
export type ResultStatus =
  | 'PENDING'
  | 'SELF_SCORED'
  | 'MANAGER_SCORED'
  | 'RECEIVED'
  | 'REJECTED';

export const NHAN_TRANG_THAI_GIAO: Record<AssignStatus, string> = {
  DRAFT: 'Đang soạn',
  PROPOSED: 'Chờ bạn ký nhận',
  ACCEPTED: 'Đã ký nhận',
  DISPUTED: 'Bạn đã nêu ý kiến',
};

/** Màu Tag của Ant Design cho từng trạng thái. */
export const MAU_TRANG_THAI_GIAO: Record<AssignStatus, string> = {
  DRAFT: 'default',
  PROPOSED: 'processing',
  ACCEPTED: 'success',
  DISPUTED: 'warning',
};

export interface KyDanhGiaGon {
  code: string;
  name: string;
  submitDeadline: string | null;
}

export interface PhieuKpi {
  id: string;
  periodId: string;
  period: KyDanhGiaGon;
  departmentName: string;
  jobTitleName: string;
  assignStatus: AssignStatus;
  resultStatus: ResultStatus;
  proposedAt: string | null;
  acceptedAt: string | null;
  disputedAt: string | null;
  disputeReason: string | null;
}

export interface DongPhieuKpi {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  section: 'BSC_WORK' | 'COMPLIANCE';
  displayOrder: number;
  measurementText: string | null;
  measureMethod: string | null;
  weight: string;
  maxScale: number;
}

export interface SuKienPhieu {
  id: string;
  action: string;
  note: string | null;
  createdAt: string;
  actor: { fullName: string } | null;
}

export interface PhieuKpiChiTiet extends PhieuKpi {
  ownerUser: { fullName: string; employeeCode: string } | null;
  evaluator: { fullName: string } | null;
  items: DongPhieuKpi[];
  events: SuKienPhieu[];
}
