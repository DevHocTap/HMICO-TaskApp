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

/**
 * Kỳ kèm trạng thái khoá — CHỈ `GET /scorecards/:id` trả thêm `isLocked`.
 *
 * `GET /scorecards/my` không trả trường này. Gộp hai hình dạng làm một kiểu
 * là mời giao diện đọc `isLocked` ở chỗ nó luôn `undefined`, rồi lặng lẽ
 * coi kỳ đã khoá là chưa khoá.
 */
export interface KyDanhGiaTrenPhieu extends KyDanhGiaGon {
  isLocked: boolean;
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
  /**
   * Ghi chú kèm thao tác. Cột ở database tên `comment`, KHÔNG phải `note` —
   * `note` là tên trường trong body của `POST /:id/propose`. Đọc nhầm tên
   * thì ghi chú bắt buộc lúc gửi lại phiếu bị nêu ý kiến sẽ không bao giờ
   * hiện ra, mà đó chính là thứ cả quy tắc đó sinh ra để giữ lại.
   */
  comment: string | null;
  createdAt: string;
  actor: { fullName: string } | null;
}

export interface PhieuKpiChiTiet extends PhieuKpi {
  period: KyDanhGiaTrenPhieu;
  ownerUser: { fullName: string; employeeCode: string } | null;
  evaluator: { fullName: string } | null;
  items: DongPhieuKpi[];
  events: SuKienPhieu[];
}

// ------------------------------------------------------- bảng giao KPI

export interface DongBangGiaoKpi {
  userId: string;
  employeeCode: string;
  ownerName: string;
  jobTitleName: string | null;
  departmentName: string;
  /** Trưởng bộ phận — ban giám đốc giao KPI cho nhóm này. */
  isDepartmentManager: boolean;

  /** Bốn trường dưới đây `null` khi người này CHƯA có phiếu trong kỳ. */
  scorecardId: string | null;
  assignStatus: AssignStatus | null;
  totalWeight: string | null;
  acceptedAt: string | null;
  evaluatorName: string | null;
}

export interface NguoiBiBoQua {
  userId: string;
  employeeCode: string;
  fullName: string;
  reason: string;
}

export interface KetQuaHangLoat {
  created: number;
  skipped: number;
  skippedDetails: NguoiBiBoQua[];
  warnings: NguoiBiBoQua[];
}

export interface KyDanhGia {
  id: string;
  code: string;
  name: string;
  type: 'MONTH' | 'QUARTER' | 'YEAR';
  startDate: string;
  endDate: string;
  assignDeadline: string | null;
  selfScoreDeadline: string | null;
  managerScoreDeadline: string | null;
  submitDeadline: string | null;
  isLocked: boolean;
  createdById: string | null;
  createdByName: string | null;
  scorecardCount: number;
}
