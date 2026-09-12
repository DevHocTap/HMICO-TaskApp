import { describe, expect, it } from 'vitest';
import { moTaBanGhi, type BangTra } from './mo-ta-ban-ghi.js';

const tra: BangTra = {
  scorecard: new Map([['sc1', { maNhanVien: 'HM012', tenNhanVien: 'Nguyễn Văn Trung', tenKy: 'Tháng 10/2026' }]]),
  user: new Map([['u1', { maNhanVien: 'HM021', tenNhanVien: 'Vũ Hải Đăng' }]]),
  department: new Map([['d1', 'Phòng Kỹ thuật']]),
  jobTitle: new Map(),
  kpiTemplate: new Map([['t1', { code: 'TPL-KT-TK', name: 'KPI Kỹ sư triển khai' }]]),
  period: new Map([['p1', 'Tháng 08/2026']]),
};
const dong = (entityType: string, action: string, entityId = 'x', after: unknown = null, before: unknown = null) =>
  moTaBanGhi({ entityType, action, entityId, after, before }, tra);

describe('moTaBanGhi', () => {
  it('chốt điểm phiếu: mã nhân viên, kỳ, điểm dấu phẩy, xếp loại', () => {
    expect(dong('Scorecard', 'MANAGER_SCORE', 'sc1', { managerTotalScore: '92.40', grade: 'COMPLETED' })).toBe(
      'Chốt điểm phiếu HM012 — Tháng 10/2026 (92,40 · Hoàn thành)',
    );
  });

  it('trả lại phiếu kèm lý do', () => {
    expect(dong('Scorecard', 'REJECT', 'sc1', { comment: 'trọng số mục 1 chưa đủ' })).toBe(
      'Trả lại phiếu HM012 — Tháng 10/2026 — lý do: trọng số mục 1 chưa đủ',
    );
  });

  it('phiếu không tra được thì vẫn ra câu, không ném lỗi', () => {
    expect(dong('Scorecard', 'SELF_SCORE', 'khong-co')).toBe('Nộp bản tự chấm phiếu KPI');
  });

  it('đổi vai trò tài khoản đọc từ before/after', () => {
    expect(dong('User', 'UPDATE', 'u1', { role: 'MANAGER' }, { role: 'STAFF' })).toBe(
      'Đổi vai trò tài khoản HM021 (Vũ Hải Đăng): Nhân viên → Trưởng bộ phận',
    );
    expect(dong('User', 'UPDATE', 'u1', { fullName: 'A' }, { fullName: 'B' })).toBe(
      'Sửa thông tin tài khoản HM021 (Vũ Hải Đăng)',
    );
    expect(dong('User', 'RESET_PASSWORD', 'u1')).toBe('Đặt lại mật khẩu cho tài khoản HM021 (Vũ Hải Đăng)');
  });

  it('đăng nhập thất bại kèm email và lý do', () => {
    expect(dong('Auth', 'LOGIN_FAILED', 'a@b', { email: 'a@hmico.vn', reason: 'sai mật khẩu' })).toBe(
      'Đăng nhập thất bại — a@hmico.vn (sai mật khẩu)',
    );
    expect(dong('Auth', 'LOGIN', 'u1', { email: 'a@hmico.vn' })).toBe('Đăng nhập');
  });

  it('mẫu KPI, kỳ, báo cáo, cài đặt', () => {
    expect(dong('KpiTemplate', 'PUBLISH', 't1', { version: 11 })).toBe(
      'Xuất bản mẫu TPL-KT-TK (KPI Kỹ sư triển khai) — phiên bản 11',
    );
    expect(dong('Period', 'LOCK', 'p1')).toBe('Khoá sổ kỳ Tháng 08/2026');
    expect(dong('Period', 'AUTO_CREATE', 'p-la', { name: 'Tháng 11/2026' })).toBe('Tự sinh kỳ Tháng 11/2026');
    expect(dong('Report', 'EXPORT', 'p1', { periodCode: '2026-09', soDong: 14 })).toBe(
      'Xuất báo cáo Excel kỳ 2026-09 (14 dòng)',
    );
    expect(dong('Setting', 'UPDATE', 'nguongXepLoai')).toBe('Cập nhật cài đặt: ngưỡng xếp loại');
    expect(dong('Department', 'DEACTIVATE', 'd1')).toBe('Vô hiệu hoá phòng ban "Phòng Kỹ thuật"');
  });

  it('loại và thao tác lạ vẫn in được', () => {
    expect(dong('LaLam', 'XYZ', 'id9')).toBe('XYZ LaLam id9');
    expect(dong('Scorecard', 'HANH_DONG_MOI', 'sc1')).toBe('HANH_DONG_MOI phiếu HM012 — Tháng 10/2026');
  });
});
