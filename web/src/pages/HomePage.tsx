import { useAuth } from '../auth/useAuth';
import { coTheXemBaoCao } from '../auth/permissions';
import { TongQuanQuanLy } from './TongQuanQuanLy';
import { TongQuanNhanVien } from './TongQuanNhanVien';

/**
 * Trang chủ = Tổng quan. Vai quản lý (ADMIN / HR / EXECUTIVE / MANAGER) thấy
 * bảng điều hành kỳ; nhân viên thấy phiếu của chính mình. Hai trang cùng bộ
 * kiểu `tong-quan.css` (mẫu 13/09), chỉ khác dữ liệu.
 */
export function HomePage() {
  const { user } = useAuth();
  return coTheXemBaoCao(user?.role) ? <TongQuanQuanLy /> : <TongQuanNhanVien />;
}
