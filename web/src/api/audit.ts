import { apiClient } from './client';
import type { BoLocNhatKy, TrangNhatKy } from '../types/audit';

/**
 * Đọc nhật ký thao tác. Chỉ ADMIN và ban giám đốc gọi được (backend chặn).
 *
 * Không có hàm sửa hay xoá, và sẽ không bao giờ có — nhật ký sửa được thì
 * không còn là bằng chứng.
 */
export async function layNhatKy(loc: BoLocNhatKy): Promise<TrangNhatKy> {
  const { data } = await apiClient.get<TrangNhatKy>('/audit-logs', {
    // Bỏ trường rỗng: gửi `entityType=""` lên thì backend hiểu là lọc theo
    // chuỗi rỗng và trả về danh sách trống.
    params: Object.fromEntries(
      Object.entries(loc).filter(([, v]) => v !== undefined && v !== '' && v !== null),
    ),
  });
  return data;
}
