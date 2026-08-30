import { Result } from 'antd';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import type { Role } from '../types/auth';

interface Props {
  /** Vai trò được vào. */
  duocPhep: (role: Role | undefined) => boolean;
}

/**
 * Chặn route theo vai trò ở phía giao diện.
 *
 * KHÔNG PHẢI BẢO MẬT — chỉ để người dùng gõ nhầm URL thấy thông báo tử tế
 * thay vì một trang lỗi rỗng. Backend chặn độc lập bằng RolesGuard và
 * getAccessibleDepartmentIds.
 */
export function RoleRoute({ duocPhep }: Props) {
  const { user } = useAuth();

  if (!duocPhep(user?.role)) {
    return (
      <Result
        status="403"
        title="Không có quyền truy cập"
        subTitle="Bạn không được phép xem trang này. Liên hệ quản trị viên nếu cần."
      />
    );
  }
  return <Outlet />;
}
