import { apiClient } from './client';
import { luuBlobXuongMay } from './report';
import type {
  DongBangGiaoKpi,
  KetQuaHangLoat,
  KyDanhGia,
  ODiemGuiLen,
  PhieuChamDiem,
  PhieuKpi,
  PhieuKpiChiTiet,
  PhieuTomTat,
  SanSangCongTy,
  ThamSoDanhSachPhieu,
  ViecCanXuLy,
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

/** Danh sách phiếu trong phạm vi — dùng cho thẻ "phiếu cần xử lý gấp". */
export async function layDanhSachPhieu(
  params: ThamSoDanhSachPhieu,
): Promise<{ data: PhieuTomTat[]; total: number }> {
  const { data } = await apiClient.get<{ data: PhieuTomTat[]; total: number }>('/scorecards', {
    params,
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

/** Việc đang chờ chính người đăng nhập xử lý — mọi vai trò đều gọi được. */
export async function layViecCuaToi(): Promise<ViecCanXuLy[]> {
  const { data } = await apiClient.get<ViecCanXuLy[]>('/scorecards/pending-my-action');
  return data;
}

// ------------------------------------------------------- kỳ đánh giá

export interface KyMoiInput {
  code: string;
  name: string;
  type: 'MONTH' | 'QUARTER' | 'YEAR';
  startDate: string;
  endDate: string;
  /** Bốn mốc dưới đây CHỈ kỳ MONTH được có. Dạng YYYY-MM-DD, không kèm giờ. */
  assignDeadline?: string;
  selfScoreDeadline?: string;
  managerScoreDeadline?: string;
  submitDeadline?: string;
}

export async function taoKyDanhGia(input: KyMoiInput): Promise<KyDanhGia> {
  const { data } = await apiClient.post<KyDanhGia>('/periods', input);
  return data;
}

/** Chốt sổ kỳ — HCNS và ban giám đốc. CHỈ kỳ MONTH khoá được. */
export async function khoaKy(id: string): Promise<KyDanhGia> {
  const { data } = await apiClient.post<KyDanhGia>(`/periods/${id}/lock`);
  return data;
}

export async function moKy(id: string): Promise<KyDanhGia> {
  const { data } = await apiClient.post<KyDanhGia>(`/periods/${id}/unlock`);
  return data;
}

// -------------------------------------------------------------- chấm điểm

export async function layPhieuChamDiem(id: string): Promise<PhieuChamDiem> {
  const { data } = await apiClient.get<PhieuChamDiem>(`/scorecards/${id}/scoring`);
  return data;
}

/**
 * Lưu nháp — CẬP NHẬT MỘT PHẦN.
 *
 * Chỉ gửi những ô vừa sửa. Ô không gửi lên giữ nguyên điểm cũ ở database,
 * nên không cần (và không nên) gửi cả phiếu mỗi lần lưu.
 */
export async function luuDiemTuCham(
  id: string,
  scores: ODiemGuiLen[],
): Promise<PhieuChamDiem> {
  const { data } = await apiClient.put<PhieuChamDiem>(
    `/scorecards/${id}/self-scores`,
    { scores },
  );
  return data;
}

export async function nopDiemTuCham(id: string): Promise<PhieuChamDiem> {
  const { data } = await apiClient.post<PhieuChamDiem>(`/scorecards/${id}/self-submit`);
  return data;
}

export async function luuDiemQuanLy(
  id: string,
  scores: ODiemGuiLen[],
): Promise<PhieuChamDiem> {
  const { data } = await apiClient.put<PhieuChamDiem>(
    `/scorecards/${id}/manager-scores`,
    { scores },
  );
  return data;
}

/** Chốt điểm. `noSelfScoreReason` CHỈ dùng cho phiếu của người đã nghỉ việc. */
export async function chotDiemQuanLy(
  id: string,
  noSelfScoreReason?: string,
): Promise<PhieuChamDiem> {
  const { data } = await apiClient.post<PhieuChamDiem>(
    `/scorecards/${id}/manager-submit`,
    noSelfScoreReason ? { noSelfScoreReason } : {},
  );
  return data;
}

/** Trả phiếu về cho nhân viên tự chấm lại. Bắt buộc kèm lý do. */
export async function traLaiPhieu(id: string, reason: string): Promise<PhieuChamDiem> {
  const { data } = await apiClient.post<PhieuChamDiem>(`/scorecards/${id}/reject`, {
    reason,
  });
  return data;
}

export async function tiepNhanPhieu(id: string): Promise<PhieuChamDiem> {
  const { data } = await apiClient.post<PhieuChamDiem>(`/scorecards/${id}/receive`);
  return data;
}

/**
 * Tải MỘT phiếu KPI ra Excel theo biểu mẫu BM.01 và lưu xuống máy.
 * Backend đặt tên `KPI_<mã NV>_<YYYY-MM>.xlsx`; quyền xem như màn Chấm điểm.
 * Lỗi trả về là Blob — đọc bằng `docLoiBlob()` của `api/report`.
 */
export async function taiPhieuExcel(id: string): Promise<string> {
  const res = await apiClient.get(`/scorecards/${id}/export`, { responseType: 'blob' });
  return luuBlobXuongMay(res, 'KPI.xlsx');
}
