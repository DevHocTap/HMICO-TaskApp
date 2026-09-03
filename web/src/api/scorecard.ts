import { apiClient } from './client';
import type {
  PhieuKpi,
  PhieuKpiChiTiet,
  SanSangCongTy,
} from '../types/scorecard';

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

// ------------------------------------------------------------ phiếu KPI

export async function layPhieuCuaToi(periodId?: string): Promise<PhieuKpi[]> {
  const { data } = await apiClient.get<PhieuKpi[]>('/scorecards/my', {
    params: periodId ? { periodId } : undefined,
  });
  return data;
}

export async function layChiTietPhieu(id: string): Promise<PhieuKpiChiTiet> {
  const { data } = await apiClient.get<PhieuKpiChiTiet>(`/scorecards/${id}`);
  return data;
}

/** Ký nhận — CHỈ chính chủ làm được, không ai ký thay. */
export async function kyNhanPhieu(id: string): Promise<PhieuKpi> {
  const { data } = await apiClient.post<PhieuKpi>(`/scorecards/${id}/accept`);
  return data;
}

/** Nêu ý kiến, bắt buộc kèm lý do — trưởng phòng cần biết sửa chỗ nào. */
export async function neuYKienPhieu(id: string, reason: string): Promise<PhieuKpi> {
  const { data } = await apiClient.post<PhieuKpi>(`/scorecards/${id}/dispute`, {
    reason,
  });
  return data;
}
