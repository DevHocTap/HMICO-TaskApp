import { Spin } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

/**
 * Chặn mọi route cần đăng nhập.
 *
 * Kèm luôn ràng buộc đổi mật khẩu lần đầu: người có cờ mustChangePassword
 * bị đẩy về /change-password từ mọi nơi khác. Gộp vào một chỗ để không thể
 * quên khi thêm route mới.
 */
export function ProtectedRoute() {
  const { user, dangKhoiPhuc } = useAuth();
  const location = useLocation();

  if (dangKhoiPhuc) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Spin size="large" tip="Đang tải..." fullscreen />
      </div>
    );
  }

  if (!user) {
    // Nhớ nơi định vào để đăng nhập xong quay lại đúng chỗ
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const dangODoiMatKhau = location.pathname === '/change-password';
  if (user.mustChangePassword && !dangODoiMatKhau) {
    return <Navigate to="/change-password" replace />;
  }
  if (!user.mustChangePassword && dangODoiMatKhau) {
    // Đã đổi rồi thì không cần ở lại màn hình bắt buộc nữa
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
