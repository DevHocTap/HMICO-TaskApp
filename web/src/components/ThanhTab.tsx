import { Tabs } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  coTheXemBaoCao,
  coTheXemCaiDat,
  coTheXemNhanVien,
  coTheXemNhatKy,
  coTheXemToChuc,
} from '../auth/permissions';
import type { Role } from '../types/auth';

type NhomTab = 'nhan-su' | 'bao-cao' | 'he-thong';

interface MucTab {
  to: string;
  label: string;
  duocPhep: (role: Role | undefined) => boolean;
}

/**
 * Các màn phụ gom vào tab của màn cha (12/09/2026) để menu trái chỉ còn
 * bảy mục như bộ mẫu. Route và trang giữ nguyên — tab chỉ là link.
 */
export const NHOM_TAB: Record<NhomTab, MucTab[]> = {
  'nhan-su': [
    { to: '/admin/users', label: 'Nhân viên', duocPhep: coTheXemNhanVien },
    { to: '/admin/departments', label: 'Phòng ban', duocPhep: coTheXemToChuc },
    { to: '/admin/job-titles', label: 'Chức danh', duocPhep: coTheXemToChuc },
  ],
  'bao-cao': [
    { to: '/kpi/dashboard', label: 'Tổng quan', duocPhep: coTheXemBaoCao },
    { to: '/kpi/progress', label: 'Tiến độ nộp', duocPhep: coTheXemBaoCao },
  ],
  'he-thong': [
    { to: '/admin/settings', label: 'Cài đặt', duocPhep: coTheXemCaiDat },
    { to: '/admin/audit-logs', label: 'Nhật ký thao tác', duocPhep: coTheXemNhatKy },
  ],
};

/** Đường dẫn đầu tiên của nhóm mà vai này vào được — dùng cho mục menu. */
export function loiVaoNhom(nhom: NhomTab, role: Role | undefined): string | null {
  return NHOM_TAB[nhom].find((t) => t.duocPhep(role))?.to ?? null;
}

export function ThanhTab({ nhom }: { nhom: NhomTab }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const muc = NHOM_TAB[nhom].filter((t) => t.duocPhep(user?.role));
  if (muc.length <= 1) return null;
  const dangChon = muc.find((t) => pathname.startsWith(t.to))?.to;
  return (
    <Tabs
      className="thanh-tab"
      activeKey={dangChon}
      onChange={(k) => navigate(k)}
      items={muc.map((t) => ({ key: t.to, label: t.label }))}
    />
  );
}
