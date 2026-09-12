import { Alert } from 'antd';
import type { Role } from '../types/auth';

/**
 * Dải thông báo cho người chỉ có quyền xem.
 *
 * EXECUTIVE và MANAGER cùng ở chế độ chỉ xem nhưng phạm vi khác nhau, nên
 * lời giải thích cũng khác.
 */
export function ReadOnlyNotice({
  role,
  aiSua = 'quản trị viên hoặc Hành chính nhân sự',
}: {
  role: Role | undefined;
  /** Ai được ghi ở màn này — mẫu KPI là trưởng bộ phận, không phải HCNS. */
  aiSua?: string;
}) {
  const moTa =
    role === 'EXECUTIVE' || role === 'HR'
      ? `Bạn xem được dữ liệu của toàn công ty. Việc thêm, sửa do ${aiSua} thực hiện.`
      : `Bạn xem được dữ liệu trong phạm vi quản lý của mình. Việc thêm, sửa do ${aiSua} thực hiện.`;

  return (
    <Alert type="info" showIcon message="Chế độ chỉ xem" description={moTa} />
  );
}
