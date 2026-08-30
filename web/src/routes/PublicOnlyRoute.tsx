import { Spin } from 'antd';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

/** Màn hình chỉ dành cho người CHƯA đăng nhập, ví dụ /login. */
export function PublicOnlyRoute() {
  const { user, dangKhoiPhuc } = useAuth();

  if (dangKhoiPhuc) return <Spin size="large" fullscreen />;
  if (user) return <Navigate to="/" replace />;

  return <Outlet />;
}
