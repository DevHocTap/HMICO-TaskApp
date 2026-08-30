import { Alert } from 'antd';
import type { Role } from '../types/auth';

/**
 * Dải thông báo cho người chỉ có quyền xem.
 *
 * EXECUTIVE và MANAGER cùng ở chế độ chỉ xem nhưng phạm vi khác nhau, nên
 * lời giải thích cũng khác.
 */
export function ReadOnlyNotice({ role }: { role: Role | undefined }) {
  const moTa =
    role === 'EXECUTIVE'
      ? 'Bạn xem được dữ liệu của toàn công ty. Việc thêm, sửa do quản trị viên hoặc Hành chính nhân sự thực hiện.'
      : 'Bạn xem được dữ liệu trong phạm vi quản lý của mình. Việc thêm, sửa do quản trị viên hoặc Hành chính nhân sự thực hiện.';

  return (
    <Alert type="info" showIcon message="Chế độ chỉ xem" description={moTa} />
  );
}
