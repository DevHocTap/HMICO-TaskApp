/** Một dòng nhật ký thao tác. CHỈ ĐỌC — không có đường nào sửa hay xoá. */
export interface DongNhatKy {
  id: string;
  createdAt: string;
  action: string;
  /** Tên bảng: `Scorecard`, `User`, `Department`, `Auth`... */
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  /** Giá trị trước và sau. Trường nhạy cảm đã bị backend che thành "[đã che]". */
  before: unknown;
  after: unknown;
  actor: {
    id: string;
    fullName: string;
    employeeCode: string;
    email: string;
  } | null;
  /** Câu tiếng Việt do backend dựng — ví dụ "Chốt điểm phiếu HM012 — Tháng 10/2026 (92,40)". */
  moTa: string;
  /** Nhãn hiển thị của `entityType`, cũng do backend trả. */
  nhanDoiTuong: string;
}

export interface TrangNhatKy {
  data: DongNhatKy[];
  total: number;
  page: number;
  limit: number;
  /** Loại bản ghi người đang xem được phép thấy — dùng dựng ô lọc. */
  entityTypes: string[] | null;
}

export interface BoLocNhatKy {
  page?: number;
  limit?: number;
  entityType?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
}

/**
 * Nhãn tiếng Việt cho từng loại bản ghi và từng thao tác.
 *
 * Không có trong bảng thì hiện nguyên mã — thà thấy `UPDATE_ITEMS` còn hơn
 * thấy khoảng trắng và không biết chuyện gì đã xảy ra.
 */
export const NHAN_LOAI: Record<string, string> = {
  Auth: 'Đăng nhập / mật khẩu',
  Scorecard: 'Phiếu KPI',
  User: 'Nhân viên',
  Department: 'Phòng ban',
  JobTitle: 'Chức danh',
  KpiTemplate: 'Mẫu KPI',
  Period: 'Kỳ đánh giá',
  Report: 'Báo cáo',
  Setting: 'Cài đặt',
};

export const NHAN_THAO_TAC: Record<string, string> = {
  LOGIN: 'Đăng nhập',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  LOGOUT_ALL: 'Đăng xuất mọi thiết bị',
  CHANGE_PASSWORD: 'Đổi mật khẩu',
  RESET_PASSWORD: 'Đặt lại mật khẩu',
  CREATE: 'Tạo mới',
  UPDATE: 'Sửa',
  DEACTIVATE: 'Vô hiệu hoá',
  ACTIVATE: 'Bật lại',
  UPDATE_ITEMS: 'Sửa nội dung KPI',
  PROPOSE: 'Gửi ký nhận',
  RE_PROPOSED_UNCHANGED: 'Gửi lại nguyên trạng',
  ACCEPT: 'Ký nhận',
  DISPUTE: 'Nêu ý kiến',
  SELF_SCORE: 'Nhân viên tự chấm',
  MANAGER_SCORE: 'Trưởng bộ phận chốt điểm',
  REJECT: 'Trả lại phiếu',
  RECEIVE: 'HCNS tiếp nhận',
  LOCK: 'Chốt sổ kỳ',
  UNLOCK: 'Mở lại kỳ',
  REOPEN: 'Mở lại phiếu',
};
