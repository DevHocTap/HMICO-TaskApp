import { apiClient } from './client';
import type { CaiDatHeThong, CaiDatKemThoiDiem } from '../types/settings';

export async function layCaiDat(): Promise<CaiDatKemThoiDiem> {
  const { data } = await apiClient.get<CaiDatKemThoiDiem>('/settings');
  return data;
}

/** Cập nhật MỘT PHẦN: chỉ gửi nhóm đã đổi. */
export async function luuCaiDat(phan: Partial<CaiDatHeThong>): Promise<CaiDatHeThong> {
  const { data } = await apiClient.put<CaiDatHeThong>('/settings', phan);
  return data;
}
