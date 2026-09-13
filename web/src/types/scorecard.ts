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

/**
 * Nhãn trạng thái giao KPI theo góc nhìn CHỦ PHIẾU — dùng ở "Phiếu KPI của
 * tôi". Người giao KPI xem thì dùng `NHAN_TRANG_THAI_GIAO_NGUOI_GIAO`: cùng
 * một trạng thái, "chờ bạn ký nhận" với nhân viên là "chờ nhân viên ký nhận"
 * với trưởng phòng — đem nhãn này sang màn Giao KPI từng làm trưởng phòng
 * tưởng mình phải ký (12/09/2026).
 */
export const NHAN_TRANG_THAI_GIAO: Record<AssignStatus, string> = {
  DRAFT: 'Đang soạn',
  PROPOSED: 'Chờ bạn ký nhận',
  ACCEPTED: 'Đã ký nhận',
  DISPUTED: 'Bạn đã nêu ý kiến',
};

/** Cùng trạng thái, góc nhìn người GIAO KPI (trưởng phòng, ban giám đốc). */
export const NHAN_TRANG_THAI_GIAO_NGUOI_GIAO: Record<AssignStatus, string> = {
  DRAFT: 'Đang soạn',
  PROPOSED: 'Chờ nhân viên ký nhận',
  ACCEPTED: 'Đã ký nhận',
  DISPUTED: 'Nhân viên nêu ý kiến',
};

/** Màu Tag của Ant Design cho từng trạng thái. */
/**
 * Màu theo NGHĨA, không theo bước: xám = chưa làm gì, vàng = đang chờ một
 * người, xanh lá = xong, đỏ = có vấn đề cần xử lý. Trước đây "chờ" dùng
 * `processing` (= màu chủ đạo) nên cả bảng một màu, không nhìn ra dòng nào
 * đang kẹt (12/09/2026).
 */
export const MAU_TRANG_THAI_GIAO: Record<AssignStatus, string> = {
  DRAFT: 'default',
  PROPOSED: 'gold',
  ACCEPTED: 'success',
  DISPUTED: 'error',
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
  /** Hạn lên KPI (ngày 25 tháng trước) — chỉ endpoint chi tiết trả. */
  assignDeadline: string | null;
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
  /** Backend trả nguyên dòng Scorecard nên có sẵn điểm đã chốt hai cột (13/09). */
  selfScoredAt: string | null;
  managerScoredAt: string | null;
  selfTotalScore: string | null;
  managerTotalScore: string | null;
  grade: XepLoai | null;
}

/** Một dòng của `GET /scorecards` — danh sách phiếu trong phạm vi. */
export interface PhieuTomTat {
  id: string;
  ownerUserId: string | null;
  ownerName: string | null;
  employeeCode: string | null;
  periodId: string;
  periodCode: string;
  departmentId: string;
  departmentName: string;
  jobTitleName: string;
  evaluatorId: string | null;
  evaluatorName: string | null;
  assignStatus: AssignStatus;
  resultStatus: ResultStatus;
  proposedAt: string | null;
  acceptedAt: string | null;
  /** Điểm ĐÃ CHỐT hai cột (chuỗi Decimal); `null` khi chưa nộp / chưa chốt. */
  selfTotalScore: string | null;
  managerTotalScore: string | null;
  grade: XepLoai | null;
  selfScoredAt: string | null;
  managerScoredAt: string | null;
  totalWeight: string;
  itemCount: number;
}

export interface ThamSoDanhSachPhieu {
  periodId?: string;
  departmentId?: string;
  ownerUserId?: string;
  evaluatorId?: string;
  assignStatus?: AssignStatus;
  resultStatus?: ResultStatus;
  grade?: XepLoai;
  page?: number;
  limit?: number;
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

/** Nhãn hiển thị của `SuKienPhieu.action` — thao tác chưa có nhãn thì in mã. */
export const NHAN_HANH_DONG: Record<string, string> = {
  CREATE: 'Lập phiếu',
  UPDATE_ITEMS: 'Sửa nội dung',
  PROPOSE: 'Gửi đi ký nhận',
  RE_PROPOSED_UNCHANGED: 'Gửi lại nguyên trạng',
  ACCEPT: 'Ký nhận',
  DISPUTE: 'Nêu ý kiến',
  SELF_SCORE: 'Tự chấm',
  MANAGER_SCORE: 'Trưởng phòng chấm',
  REJECT: 'Trả lại',
  RECEIVE: 'HCNS tiếp nhận',
  REOPEN: 'Mở lại',
};

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
  /** Bước chấm điểm và điểm đã chốt; `null` khi chưa có phiếu. */
  resultStatus: ResultStatus | null;
  selfTotalScore: string | null;
  managerTotalScore: string | null;
  evaluatorId: string | null;
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

// ------------------------------------------------------- việc của tôi

/**
 * Một việc đang chờ chính người này xử lý.
 *
 * Backend trả câu chữ hiển thị được ngay kèm đường dẫn tới chỗ xử lý — giao
 * diện KHÔNG tự suy diễn từ dữ liệu thô. Đây là thứ thay cho hệ thống thông
 * báo: không bảng thông báo, không chuông đếm, không đánh dấu đã đọc.
 */
export interface ViecCanXuLy {
  type: string;
  message: string;
  count: number;
  link: string;
  /** Số ngày CÒN LÀM ĐƯỢC, tính cả hôm nay. Không bao giờ âm. */
  daysUntilDeadline: number | null;
  isOverdue: boolean;
}

// ------------------------------------------------------------ chấm điểm

export const NHAN_TRANG_THAI_CHAM: Record<ResultStatus, string> = {
  PENDING: 'Chưa chấm',
  SELF_SCORED: 'Đã tự chấm, chờ trưởng bộ phận',
  MANAGER_SCORED: 'Đã chốt điểm, chờ HCNS tiếp nhận',
  REJECTED: 'Bị trả lại, cần chấm lại',
  RECEIVED: 'HCNS đã tiếp nhận',
};

export const MAU_TRANG_THAI_CHAM: Record<ResultStatus, string> = {
  PENDING: 'default',
  SELF_SCORED: 'gold',
  MANAGER_SCORED: 'success',
  REJECTED: 'error',
  RECEIVED: 'green',
};

export type XepLoai = 'NOT_ACHIEVED' | 'NEEDS_IMPROVEMENT' | 'COMPLETED' | 'EXCEEDED';

export const NHAN_XEP_LOAI: Record<XepLoai, string> = {
  NOT_ACHIEVED: 'Chưa đạt',
  NEEDS_IMPROVEMENT: 'Cần cải thiện',
  COMPLETED: 'Hoàn thành',
  EXCEEDED: 'Vượt chỉ tiêu',
};

export const MAU_XEP_LOAI: Record<XepLoai, string> = {
  NOT_ACHIEVED: 'error',
  NEEDS_IMPROVEMENT: 'warning',
  COMPLETED: 'success',
  EXCEEDED: 'purple',
};

/** Điểm và đóng góp TÍNH ĐỘNG từ backend — tiêu chí cha không lưu điểm. */
export interface DiemTinhDong {
  diem: string | null;
  dongGop: string | null;
}

export interface DongChamDiem {
  id: string;
  parentId: string | null;
  section: 'BSC_WORK' | 'COMPLIANCE';
  displayOrder: number;
  name: string;
  description: string | null;
  measurementText: string | null;
  measureMethod: string | null;
  targetValue: string | null;
  maxScale: number;
  weight: string;
  /** Trần điểm được phép nhập, backend tính sẵn theo mục. */
  tranDiem: string;
  selfScore: string | null;
  selfComment: string | null;
  managerScore: string | null;
  managerComment: string | null;
  selfComputed: DiemTinhDong;
  managerComputed: DiemTinhDong;
}

export interface TomTatCham {
  tongDiem: string;
  xepLoai: XepLoai | null;
  daChamDu: boolean;
  thieuDiem: string[];
}

export interface QuyenChamDiem {
  canEditSelfScores: boolean;
  canEditManagerScores: boolean;
  canReject: boolean;
  canReceive: boolean;
}

export interface PhieuChamDiem {
  scorecard: {
    id: string;
    ownerUserId: string | null;
    ownerName: string | null;
    ownerIsActive: boolean;
    departmentName: string;
    jobTitleName: string;
    periodId: string;
    periodName: string;
    periodIsLocked: boolean;
    evaluatorId: string | null;
    assignStatus: AssignStatus;
    resultStatus: ResultStatus;
    selfScoredAt: string | null;
    managerScoredAt: string | null;
    rejectedAt: string | null;
    rejectReason: string | null;
    receivedAt: string | null;
    noSelfScoreReason: string | null;
    /** Điểm ĐÃ CHỐT. Khác điểm tính thử ở `selfPreview` / `managerPreview`. */
    selfTotalScore: string | null;
    managerTotalScore: string | null;
    grade: XepLoai | null;
  };
  items: DongChamDiem[];
  /** Điểm TÍNH THỬ của backend; `null` khi dữ liệu phiếu có chỗ hỏng. */
  selfPreview: TomTatCham | null;
  managerPreview: TomTatCham | null;
  permissions: QuyenChamDiem;
}

/** Một ô điểm gửi lên khi lưu nháp. */
export interface ODiemGuiLen {
  itemId: string;
  /** Bỏ trống trường này = giữ nguyên điểm cũ; `null` = xoá điểm. */
  score?: number | null;
  /** Bỏ trống = giữ nguyên ghi chú cũ; `null` = xoá ghi chú. */
  comment?: string | null;
}
