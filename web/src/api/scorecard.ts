import { apiClient } from './client';
import type {
  DongBangGiaoKpi,
  KetQuaHangLoat,
  KyDanhGia,
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

// ------------------------------------------------------- bảng giao KPI

export async function layKyDanhGia(type?: 'MONTH'): Promise<KyDanhGia[]> {
  const { data } = await apiClient.get<KyDanhGia[]>('/periods', {
    params: type ? { type } : undefined,
  });
  return data;
}

export interface ThamSoBangGiaoKpi {
  periodId: string;
  departmentId?: string;
  scope?: 'all' | 'managers';
}

export async function layBangGiaoKpi(
  params: ThamSoBangGiaoKpi,
): Promise<DongBangGiaoKpi[]> {
  const { data } = await apiClient.get<DongBangGiaoKpi[]>(
    '/scorecards/assignment-board',
    { params },
  );
  return data;
}

/** Sinh một phiếu. `emptyTemplate` = phiếu rỗng để tự soạn KPI. */
export async function sinhMotPhieu(input: {
  userId: string;
  periodId: string;
  emptyTemplate?: boolean;
}): Promise<PhieuKpi> {
  const { data } = await apiClient.post<PhieuKpi>('/scorecards', input);
  return data;
}

export async function sinhPhieuHangLoat(input: {
  departmentId: string;
  periodId: string;
  userIds?: string[];
}): Promise<KetQuaHangLoat> {
  const { data } = await apiClient.post<KetQuaHangLoat>('/scorecards/batch', input);
  return data;
}

export async function chepTuKyTruoc(input: {
  departmentId: string;
  sourcePeriodId: string;
  targetPeriodId: string;
}): Promise<KetQuaHangLoat> {
  const { data } = await apiClient.post<KetQuaHangLoat>(
    '/scorecards/copy-from-period',
    input,
  );
  return data;
}

export async function guiKyHangLoat(input: {
  departmentId: string;
  periodId: string;
}): Promise<KetQuaHangLoat> {
  const { data } = await apiClient.post<KetQuaHangLoat>(
    '/scorecards/batch-propose',
    input,
  );
  return data;
}

/** Một dòng khi lưu cây item. `key` là khoá tạm do giao diện sinh. */
export interface DongLuuPhieu {
  key: string;
  parentKey: string | null;
  name: string;
  description?: string | null;
  section: 'BSC_WORK' | 'COMPLIANCE';
  measurementText?: string | null;
  measureMethod?: string | null;
  weight: number;
  displayOrder: number;
}

/** Thay CẢ CÂY một lần — gửi thiếu Mục 2 là mất Mục 2. */
export async function luuItemPhieu(
  id: string,
  items: DongLuuPhieu[],
): Promise<PhieuKpiChiTiet> {
  const { data } = await apiClient.put<PhieuKpiChiTiet>(`/scorecards/${id}/items`, {
    items,
  });
  return data;
}

/** Gửi phiếu đi ký. `note` BẮT BUỘC khi gửi lại phiếu đang có ý kiến. */
export async function guiPhieuDiKy(id: string, note?: string): Promise<PhieuKpi> {
  const { data } = await apiClient.post<PhieuKpi>(`/scorecards/${id}/propose`, {
    ...(note ? { note } : {}),
  });
  return data;
}
