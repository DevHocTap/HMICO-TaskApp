import { Role } from '@prisma/client';

/**
 * Ma trận phân quyền — KHAI BÁO, không phải mô tả.
 *
 * Mỗi endpoint có đúng một dòng ở đây. Test sinh tự động từ bảng này, và
 * **endpoint nào không có dòng thì test đỏ** — thêm endpoint mà quên khai
 * quyền sẽ bị bắt ngay, không lọt ra production như lỗi createBatch thiếu
 * kiểm phạm vi.
 */
export interface DongPhanQuyen {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Đường dẫn như khai trong controller, ví dụ 'scorecards/:id/propose'. */
  path: string;
  /** Vai trò được gọi. Rỗng nghĩa là mọi vai trò đã đăng nhập. */
  allowedRoles: Role[];
  /**
   * Có bị giới hạn theo phạm vi phòng ban không.
   * 'scope'  — phải đi qua getAccessibleDepartmentIds
   * 'owner'  — chỉ chủ sở hữu bản ghi
   * 'none'   — không giới hạn theo dữ liệu
   */
  dataScope: 'scope' | 'owner' | 'none';
  /** Ghi chú khi quy tắc không hiển nhiên. */
  note?: string;
}

const AI_CUNG_DUOC: Role[] = [];
const QUAN_TRI = [Role.ADMIN, Role.HR];
const GIAO_KPI = [Role.ADMIN, Role.HR, Role.MANAGER];
const DOC_TO_CHUC = [Role.ADMIN, Role.HR, Role.EXECUTIVE];
const DOC_NHAN_SU = [Role.ADMIN, Role.HR, Role.EXECUTIVE, Role.MANAGER];
/** Ban giám đốc giao và duyệt KPI của trưởng bộ phận. */
const GIAO_KPI_VA_BGD = [...GIAO_KPI, Role.EXECUTIVE];

export const MA_TRAN_PHAN_QUYEN: DongPhanQuyen[] = [
  // ------------------------------------------------------------- auth
  { method: 'POST', path: 'auth/login', allowedRoles: AI_CUNG_DUOC, dataScope: 'none', note: 'công khai' },
  { method: 'POST', path: 'auth/refresh', allowedRoles: AI_CUNG_DUOC, dataScope: 'none', note: 'công khai' },
  { method: 'POST', path: 'auth/logout', allowedRoles: AI_CUNG_DUOC, dataScope: 'none', note: 'công khai, luôn 204' },
  { method: 'POST', path: 'auth/logout-all', allowedRoles: AI_CUNG_DUOC, dataScope: 'owner' },
  { method: 'POST', path: 'auth/change-password', allowedRoles: AI_CUNG_DUOC, dataScope: 'owner' },
  { method: 'GET', path: 'auth/me', allowedRoles: AI_CUNG_DUOC, dataScope: 'owner' },

  // -------------------------------------------------------------- org
  { method: 'GET', path: 'departments/tree', allowedRoles: AI_CUNG_DUOC, dataScope: 'scope', note: 'STAFF nhận cây rỗng' },
  { method: 'GET', path: 'departments/:id', allowedRoles: AI_CUNG_DUOC, dataScope: 'scope' },
  { method: 'POST', path: 'departments', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'PATCH', path: 'departments/:id', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'DELETE', path: 'departments/:id', allowedRoles: QUAN_TRI, dataScope: 'none' },

  { method: 'GET', path: 'job-titles', allowedRoles: AI_CUNG_DUOC, dataScope: 'scope' },
  { method: 'POST', path: 'job-titles', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'PATCH', path: 'job-titles/:id', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'DELETE', path: 'job-titles/:id', allowedRoles: QUAN_TRI, dataScope: 'none' },

  { method: 'GET', path: 'users', allowedRoles: AI_CUNG_DUOC, dataScope: 'scope', note: 'STAFF chỉ thấy chính mình' },
  { method: 'GET', path: 'users/:id', allowedRoles: AI_CUNG_DUOC, dataScope: 'scope' },
  { method: 'POST', path: 'users', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'PATCH', path: 'users/:id', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'PATCH', path: 'users/:id/reset-password', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'PATCH', path: 'users/:id/deactivate', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'PATCH', path: 'users/:id/activate', allowedRoles: QUAN_TRI, dataScope: 'none' },

  // ----------------------------------------------------- kpi-template
  { method: 'GET', path: 'kpi-templates', allowedRoles: DOC_NHAN_SU, dataScope: 'scope', note: 'STAFF không truy cập' },
  { method: 'GET', path: 'kpi-templates/:id', allowedRoles: DOC_NHAN_SU, dataScope: 'scope' },
  { method: 'POST', path: 'kpi-templates/:id/validate', allowedRoles: DOC_NHAN_SU, dataScope: 'scope' },
  { method: 'POST', path: 'kpi-templates', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'POST', path: 'kpi-templates/:id/duplicate', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'PATCH', path: 'kpi-templates/:id', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'PUT', path: 'kpi-templates/:id/items', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'POST', path: 'kpi-templates/:id/publish', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'DELETE', path: 'kpi-templates/:id', allowedRoles: QUAN_TRI, dataScope: 'none' },
  { method: 'PUT', path: 'kpi-templates/:id/system-items', allowedRoles: [Role.ADMIN], dataScope: 'none', note: 'mẫu hệ thống, chỉ ADMIN' },

  // -------------------------------------------------------- scorecard
  { method: 'GET', path: 'scorecards/my', allowedRoles: AI_CUNG_DUOC, dataScope: 'owner' },
  { method: 'GET', path: 'scorecards/pending-my-action', allowedRoles: AI_CUNG_DUOC, dataScope: 'owner' },
  { method: 'GET', path: 'scorecards/readiness', allowedRoles: [...GIAO_KPI, Role.EXECUTIVE], dataScope: 'scope' },
  { method: 'GET', path: 'scorecards/readiness/company', allowedRoles: DOC_TO_CHUC, dataScope: 'scope', note: 'danh sách gửi HCNS' },
  { method: 'GET', path: 'scorecards', allowedRoles: AI_CUNG_DUOC, dataScope: 'scope', note: 'STAFF chỉ thấy phiếu mình' },
  { method: 'GET', path: 'scorecards/:id', allowedRoles: AI_CUNG_DUOC, dataScope: 'scope' },
  { method: 'POST', path: 'scorecards', allowedRoles: GIAO_KPI_VA_BGD, dataScope: 'scope', note: 'BGĐ sinh phiếu rỗng cho trưởng bộ phận' },
  { method: 'POST', path: 'scorecards/batch', allowedRoles: GIAO_KPI, dataScope: 'scope' },
  { method: 'POST', path: 'scorecards/copy-from-period', allowedRoles: GIAO_KPI, dataScope: 'scope' },
  { method: 'POST', path: 'scorecards/:id/propose', allowedRoles: GIAO_KPI_VA_BGD, dataScope: 'scope', note: 'BGĐ chỉ trên phiếu trưởng bộ phận' },
  { method: 'POST', path: 'scorecards/batch-propose', allowedRoles: GIAO_KPI, dataScope: 'scope' },
  { method: 'POST', path: 'scorecards/:id/accept', allowedRoles: AI_CUNG_DUOC, dataScope: 'owner', note: 'chỉ chính chủ, không ai ký thay' },
  { method: 'POST', path: 'scorecards/:id/dispute', allowedRoles: AI_CUNG_DUOC, dataScope: 'owner', note: 'chỉ chính chủ' },
  { method: 'PUT', path: 'scorecards/:id/items', allowedRoles: GIAO_KPI_VA_BGD, dataScope: 'scope', note: 'BGĐ chỉ trên phiếu trưởng bộ phận' },

  // -------------------------------------------------------------- khác
  { method: 'GET', path: '', allowedRoles: AI_CUNG_DUOC, dataScope: 'none', note: 'health check, công khai' },
];

/** Tra một dòng theo phương thức và đường dẫn. */
export function timDong(
  method: string,
  path: string,
): DongPhanQuyen | undefined {
  return MA_TRAN_PHAN_QUYEN.find(
    (d) => d.method === method && d.path === path,
  );
}

