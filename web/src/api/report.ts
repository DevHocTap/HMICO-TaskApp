import { apiClient } from './client';
import type { BaoCaoTienDo, DiemXuHuong, SoLieuDashboard, TomTatTrangChu } from '../types/report';

export async function layTienDoNop(periodId: string): Promise<BaoCaoTienDo> {
  const { data } = await apiClient.get<BaoCaoTienDo>('/reports/submission-progress', {
    params: { periodId },
  });
  return data;
}

/**
 * Tải file Excel tổng hợp và lưu xuống máy.
 *
 * Trả về tên file đã lưu để màn hình báo lại cho người dùng.
 *
 * Lấy tên file từ header `Content-Disposition` chứ không tự ghép ở đây:
 * backend đã đặt tên kèm mốc thời gian, ghép lại lần nữa là hai chỗ cùng
 * quyết định một thứ và sẽ có lúc lệch.
 */
export async function taiExcelTongHop(periodId: string): Promise<string> {
  const res = await apiClient.get('/reports/export', {
    params: { periodId },
    responseType: 'blob',
  });

  const ten =
    /filename="([^"]+)"/.exec(String(res.headers['content-disposition'] ?? ''))?.[1] ??
    'KPI.xlsx';

  // Tạo link tạm rồi bấm hộ. Thu hồi URL ngay sau đó, nếu không blob nằm lại
  // trong bộ nhớ tab cho tới lúc đóng trang.
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

/**
 * Lỗi khi tải file: thân phản hồi là `Blob` chứ không phải JSON, nên
 * `layThongBaoLoi()` thông thường chỉ đọc ra "[object Blob]".
 */
export async function docLoiBlob(e: unknown): Promise<string | null> {
  const than = (e as { response?: { data?: unknown } })?.response?.data;
  if (!(than instanceof Blob)) return null;
  try {
    const doc = JSON.parse(await than.text()) as { message?: string };
    return doc.message ?? null;
  } catch {
    return null;
  }
}

export async function laySoLieuDashboard(periodId: string): Promise<SoLieuDashboard> {
  const { data } = await apiClient.get<SoLieuDashboard>('/reports/dashboard', {
    params: { periodId },
  });
  return data;
}

/** Bộ số cho các thẻ trên trang chủ — backend chọn theo vai của người gọi. */
export async function layTomTatTrangChu(): Promise<TomTatTrangChu> {
  const { data } = await apiClient.get<TomTatTrangChu>('/reports/home-summary');
  return data;
}

/** Xu hướng `months` kỳ tháng gần nhất, tính lùi từ `periodId` (cũ → mới). */
export async function layXuHuong(periodId: string, months = 6): Promise<DiemXuHuong[]> {
  const { data } = await apiClient.get<DiemXuHuong[]>('/reports/trend', {
    params: { periodId, months },
  });
  return data;
}
