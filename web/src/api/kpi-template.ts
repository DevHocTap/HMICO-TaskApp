import { apiClient } from './client';
import type {
  EditorItem,
  KpiTemplate,
  KpiTemplateDetail,
  LoiKiemTra,
  TemplateStatus,
} from '../types/kpi-template';

interface ItemPayload {
  key: string;
  parentKey: string | null;
  name: string;
  description: string | null;
  section: string;
  measurementText: string | null;
  measureMethod: string | null;
  weight: number;
  displayOrder: number;
}

/** Đổi cây soạn thảo sang định dạng API. Ô trống gửi null chứ không gửi ''. */
function sangPayload(items: EditorItem[]): ItemPayload[] {
  return items.map((it, i) => ({
    key: it.key,
    parentKey: it.parentKey,
    name: it.name.trim(),
    description: it.description.trim() || null,
    section: it.section,
    measurementText: it.measurementText.trim() || null,
    measureMethod: it.measureMethod.trim() || null,
    weight: Number(it.weight.replace(',', '.')) || 0,
    displayOrder: i + 1,
  }));
}

export async function layDanhSachMau(params?: {
  jobTitleId?: string;
  status?: TemplateStatus;
  /** Kèm mẫu đã ngừng sử dụng — để kích hoạt lại. */
  includeInactive?: boolean;
}): Promise<KpiTemplate[]> {
  const { data } = await apiClient.get<KpiTemplate[]>('/kpi-templates', { params });
  return data;
}

export async function layMau(id: string): Promise<KpiTemplateDetail> {
  const { data } = await apiClient.get<KpiTemplateDetail>(`/kpi-templates/${id}`);
  return data;
}

export interface TemplateInput {
  code: string;
  name: string;
  description?: string | null;
  jobTitleId?: string | null;
}

export async function taoMau(input: TemplateInput): Promise<KpiTemplate> {
  const { data } = await apiClient.post<KpiTemplate>('/kpi-templates', input);
  return data;
}

export async function suaMau(
  id: string,
  input: Partial<TemplateInput>,
): Promise<KpiTemplate> {
  const { data } = await apiClient.patch<KpiTemplate>(`/kpi-templates/${id}`, input);
  return data;
}

export async function saoChepMau(
  id: string,
  input: { code: string; name: string; jobTitleId?: string | null },
): Promise<KpiTemplate> {
  const { data } = await apiClient.post<KpiTemplate>(
    `/kpi-templates/${id}/duplicate`,
    input,
  );
  return data;
}

export async function luuCayItem(
  id: string,
  items: EditorItem[],
): Promise<KpiTemplateDetail> {
  const { data } = await apiClient.put<KpiTemplateDetail>(
    `/kpi-templates/${id}/items`,
    { items: sangPayload(items) },
  );
  return data;
}

/** Kiểm thử mà không lưu — dùng để hiện lỗi trước khi bấm Xuất bản. */
export async function kiemThuCayItem(
  id: string,
  items: EditorItem[],
): Promise<LoiKiemTra[]> {
  const { data } = await apiClient.post<LoiKiemTra[]>(`/kpi-templates/${id}/validate`, {
    items: sangPayload(items),
  });
  return data;
}

export async function xuatBanMau(id: string): Promise<KpiTemplate> {
  const { data } = await apiClient.post<KpiTemplate>(`/kpi-templates/${id}/publish`);
  return data;
}

export async function voHieuHoaMau(id: string): Promise<void> {
  await apiClient.delete(`/kpi-templates/${id}`);
}

/** Kích hoạt lại mẫu đã ngừng; mẫu về DRAFT để kiểm lại trước khi xuất bản. */
export async function kichHoatLaiMau(id: string): Promise<KpiTemplate> {
  const { data } = await apiClient.post<KpiTemplate>(`/kpi-templates/${id}/activate`);
  return data;
}
