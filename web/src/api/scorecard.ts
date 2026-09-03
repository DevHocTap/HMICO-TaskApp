import { apiClient } from './client';
import type { SanSangCongTy } from '../types/scorecard';

/**
 * Kiểm tra sẵn sàng giao KPI toàn công ty.
 *
 * Chỉ ADMIN, HR và EXECUTIVE gọi được — đúng bằng quyền vào màn quản trị
 * phòng ban, nên gọi từ đó là an toàn.
 */
export async function laySanSangCongTy(): Promise<SanSangCongTy> {
  const { data } = await apiClient.get<SanSangCongTy>('/scorecards/readiness/company');
  return data;
}
