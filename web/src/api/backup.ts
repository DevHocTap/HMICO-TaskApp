import { apiClient } from './client';
import { luuBlobXuongMay } from './report';
import type { BanSaoLuu, KetQuaSaoLuu } from '../types/backup';

/** Chỉ ADMIN — backend từ chối 403 với vai khác. */
export async function laySaoLuu(): Promise<KetQuaSaoLuu> {
  const { data } = await apiClient.get<KetQuaSaoLuu>('/backups');
  return data;
}

export async function saoLuuNgay(): Promise<BanSaoLuu> {
  const { data } = await apiClient.post<BanSaoLuu>('/backups');
  return data;
}

export async function taiBanSaoLuu(tenFile: string): Promise<string> {
  const res = await apiClient.get(`/backups/${encodeURIComponent(tenFile)}/download`, { responseType: 'blob' });
  return luuBlobXuongMay(res, tenFile);
}

/** Khôi phục ĐÈ database từ một bản — `xacNhan` phải gõ đúng tên file. */
export async function khoiPhucSaoLuu(tenFile: string): Promise<{ tenFile: string; banTruocKhoiPhuc: string; giayChay: number }> {
  const { data } = await apiClient.post<{ tenFile: string; banTruocKhoiPhuc: string; giayChay: number }>(
    `/backups/${encodeURIComponent(tenFile)}/restore`,
    { xacNhan: tenFile },
  );
  return data;
}
