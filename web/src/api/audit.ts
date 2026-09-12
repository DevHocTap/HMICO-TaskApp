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

/** Xuất nhật ký theo bộ lọc đang xem ra .xlsx và lưu xuống máy; trả tên file. */
export async function taiExcelNhatKy(loc: BoLocNhatKy): Promise<string> {
  const res = await apiClient.get('/audit-logs/export', {
    params: Object.fromEntries(
      Object.entries(loc).filter(
        ([k, v]) => k !== 'page' && k !== 'limit' && v !== undefined && v !== '' && v !== null,
      ),
    ),
    responseType: 'blob',
  });
  const ten =
    /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ??
    'nhat-ky-thao-tac.xlsx';
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ten;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return ten;
}
