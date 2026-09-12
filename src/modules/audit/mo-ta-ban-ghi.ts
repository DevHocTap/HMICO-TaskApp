/**
 * Dựng câu tiếng Việt cho một dòng nhật ký. FILE THUẦN.
 *
 * `AuditLog` chỉ có `action` / `entityType` / `entityId` / `before` / `after`;
 * tên người, mã nhân viên, tên kỳ phải tra thêm — caller tra một lần cho cả
 * trang rồi đưa vào `tra`. Thiếu gì thì câu vẫn đứng được, chỉ bớt chi tiết.
 * Không bao giờ ném lỗi: nhật ký là chỗ tra cứu lúc có chuyện, một dòng lạ
 * không được làm hỏng cả trang.
 */

export interface BanGhiDeMoTa {
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
}

/** Tên hiển thị của đối tượng, tra theo `entityType` rồi `entityId`. */
export interface BangTra {
  scorecard: Map<string, { maNhanVien: string; tenNhanVien: string; tenKy: string }>;
  user: Map<string, { maNhanVien: string; tenNhanVien: string }>;
  department: Map<string, string>;
  jobTitle: Map<string, string>;
  kpiTemplate: Map<string, { code: string; name: string }>;
  period: Map<string, string>;
}

export const NHAN_DOI_TUONG: Record<string, string> = {
  Scorecard: 'Phiếu KPI',
  User: 'Tài khoản',
  Auth: 'Đăng nhập',
  Department: 'Phòng ban',
  JobTitle: 'Chức danh',
  KpiTemplate: 'Mẫu KPI',
  Period: 'Kỳ đánh giá',
  Report: 'Báo cáo',
  Setting: 'Cài đặt',
};

const NHAN_NHOM_CAI_DAT: Record<string, string> = {
  lichKy: 'lịch kỳ đánh giá',
  nguongXepLoai: 'ngưỡng xếp loại',
  baoMat: 'bảo mật & tài khoản',
  kyDanhGia: 'tự sinh kỳ đánh giá',
  chamDiem: 'trả lại phiếu đã chốt',
};

const NHAN_XEP_LOAI: Record<string, string> = {
  NOT_ACHIEVED: 'Chưa đạt',
  NEEDS_IMPROVEMENT: 'Cần cải thiện',
  COMPLETED: 'Hoàn thành',
  EXCEEDED: 'Vượt chỉ tiêu',
};

const NHAN_VAI_TRO: Record<string, string> = {
  ADMIN: 'Quản trị hệ thống',
  EXECUTIVE: 'Ban giám đốc',
  HR: 'Hành chính nhân sự',
  MANAGER: 'Trưởng bộ phận',
  STAFF: 'Nhân viên',
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const chuoi = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const diemVN = (v: unknown): string | null =>
  typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? v.replace('.', ',') : null;

export function moTaBanGhi(r: BanGhiDeMoTa, tra: BangTra): string {
  const sau = obj(r.after);
  const truoc = obj(r.before);

  switch (r.entityType) {
    case 'Scorecard': {
      const p = tra.scorecard.get(r.entityId);
      const phieu = p ? `phiếu ${p.maNhanVien} — ${p.tenKy}` : 'phiếu KPI';
      const lyDo = chuoi(sau.comment);
      switch (r.action) {
        case 'CREATE':
          return `Lập ${phieu}`;
        case 'UPDATE_ITEMS':
          return `Sửa nội dung ${phieu}`;
        case 'PROPOSE':
          return `Gửi ${phieu} đi ký nhận${lyDo ? ` — ${lyDo}` : ''}`;
        case 'RE_PROPOSED_UNCHANGED':
          return `Gửi lại nguyên trạng ${phieu}${lyDo ? ` — ${lyDo}` : ''}`;
        case 'ACCEPT':
          return `Ký nhận ${phieu}`;
        case 'DISPUTE':
          return `Nêu ý kiến về ${phieu}${lyDo ? ` — ${lyDo}` : ''}`;
        case 'SELF_SCORE': {
          const d = diemVN(sau.selfTotalScore);
          return `Nộp bản tự chấm ${phieu}${d ? ` (${d})` : ''}`;
        }
        case 'MANAGER_SCORE': {
          const d = diemVN(sau.managerTotalScore);
          const xl = chuoi(sau.grade);
          return `Chốt điểm ${phieu}${d ? ` (${d}${xl && NHAN_XEP_LOAI[xl] ? ` · ${NHAN_XEP_LOAI[xl]}` : ''})` : ''}`;
        }
        case 'REJECT':
          return `Trả lại ${phieu}${lyDo ? ` — lý do: ${lyDo}` : ''}`;
        case 'RECEIVE':
          return `Tiếp nhận ${phieu}`;
        case 'REOPEN':
          return `Mở lại ${phieu}`;
        default:
          return `${r.action} ${phieu}`;
      }
    }

    case 'User': {
      const u = tra.user.get(r.entityId);
      const tk = u ? `tài khoản ${u.maNhanVien} (${u.tenNhanVien})` : 'tài khoản';
      switch (r.action) {
        case 'CREATE':
          return `Tạo ${tk}`;
        case 'UPDATE': {
          const vaiCu = chuoi(truoc.role);
          const vaiMoi = chuoi(sau.role);
          if (vaiCu && vaiMoi && vaiCu !== vaiMoi) {
            return `Đổi vai trò ${tk}: ${NHAN_VAI_TRO[vaiCu] ?? vaiCu} → ${NHAN_VAI_TRO[vaiMoi] ?? vaiMoi}`;
          }
          return `Sửa thông tin ${tk}`;
        }
        case 'RESET_PASSWORD':
          return `Đặt lại mật khẩu cho ${tk}`;
        case 'DEACTIVATE':
          return `Vô hiệu hoá ${tk}`;
        case 'ACTIVATE':
          return `Kích hoạt lại ${tk}`;
        default:
          return `${r.action} ${tk}`;
      }
    }

    case 'Auth': {
      const email = chuoi(sau.email);
      switch (r.action) {
        case 'LOGIN':
          return 'Đăng nhập';
        case 'LOGIN_FAILED': {
          const lyDo = chuoi(sau.reason) ?? chuoi(sau.lyDo);
          return `Đăng nhập thất bại${email ? ` — ${email}` : ''}${lyDo ? ` (${lyDo})` : ''}`;
        }
        case 'LOGOUT_ALL':
          return 'Đăng xuất khỏi mọi thiết bị';
        case 'CHANGE_PASSWORD':
          return 'Đổi mật khẩu';
        default:
          return r.action;
      }
    }

    case 'Department': {
      const ten = tra.department.get(r.entityId) ?? chuoi(sau.name) ?? chuoi(truoc.name);
      const pb = ten ? `phòng ban "${ten}"` : 'phòng ban';
      return dongDonGian(r.action, pb);
    }

    case 'JobTitle': {
      const ten = tra.jobTitle.get(r.entityId) ?? chuoi(sau.name) ?? chuoi(truoc.name);
      return dongDonGian(r.action, ten ? `chức danh "${ten}"` : 'chức danh');
    }

    case 'KpiTemplate': {
      const m = tra.kpiTemplate.get(r.entityId);
      const mau = m ? `mẫu ${m.code} (${m.name})` : `mẫu ${chuoi(sau.code) ?? 'KPI'}`;
      switch (r.action) {
        case 'CREATE':
          return `Tạo ${mau}`;
        case 'SAVE_ITEMS':
          return `Lưu nội dung ${mau}`;
        case 'PUBLISH': {
          const pb = sau.version;
          return `Xuất bản ${mau}${typeof pb === 'number' ? ` — phiên bản ${pb}` : ''}`;
        }
        case 'DUPLICATE':
          return `Sao chép ${mau}`;
        default:
          return dongDonGian(r.action, mau);
      }
    }

    case 'Period': {
      const ten = tra.period.get(r.entityId) ?? chuoi(sau.name) ?? chuoi(sau.code);
      const ky = ten ? `kỳ ${ten}` : 'kỳ đánh giá';
      switch (r.action) {
        case 'AUTO_CREATE':
          return `Tự sinh ${ky}`;
        case 'LOCK':
          return `Khoá sổ ${ky}`;
        case 'UNLOCK':
          return `Mở lại ${ky}`;
        default:
          return dongDonGian(r.action, ky);
      }
    }

    case 'Report': {
      const ky = chuoi(sau.periodCode);
      const so = sau.soDong;
      if (r.action === 'EXPORT') {
        return `Xuất báo cáo Excel${ky ? ` kỳ ${ky}` : ''}${typeof so === 'number' ? ` (${so} dòng)` : ''}`;
      }
      if (r.action === 'EXPORT_AUDIT') {
        return `Xuất nhật ký thao tác ra Excel${typeof so === 'number' ? ` (${so} dòng)` : ''}`;
      }
      return `${r.action} báo cáo`;
    }

    case 'Setting':
      return `Cập nhật cài đặt: ${NHAN_NHOM_CAI_DAT[r.entityId] ?? r.entityId}`;

    default:
      return `${r.action} ${r.entityType} ${r.entityId}`;
  }
}

function dongDonGian(action: string, doiTuong: string): string {
  switch (action) {
    case 'CREATE':
      return `Tạo ${doiTuong}`;
    case 'UPDATE':
      return `Sửa ${doiTuong}`;
    case 'DEACTIVATE':
      return `Vô hiệu hoá ${doiTuong}`;
    case 'ACTIVATE':
      return `Kích hoạt lại ${doiTuong}`;
    default:
      return `${action} ${doiTuong}`;
  }
}
