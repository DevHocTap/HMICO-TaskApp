export type KpiSection = 'BSC_WORK' | 'COMPLIANCE';
export type TemplateStatus = 'DRAFT' | 'PUBLISHED';
export type ScoringMode = 'MANUAL' | 'CALCULATED';

/** Thang điểm suy ra từ mục, khớp hằng số ở backend. */
export const MAX_SCALE: Record<KpiSection, number> = {
  BSC_WORK: 10,
  COMPLIANCE: 3,
};

/** Tổng trọng số bắt buộc của tiêu chí cấp 1 trong mỗi mục. */
export const TONG_TRONG_SO: Record<KpiSection, number> = {
  BSC_WORK: 70,
  COMPLIANCE: 30,
};

export const TONG_TRONG_SO_CON = 100;

export const TEN_MUC: Record<KpiSection, string> = {
  BSC_WORK: 'BSC công việc',
  COMPLIANCE: 'Chấp hành nội quy',
};

export interface KpiTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  jobTitleId: string | null;
  jobTitleName: string | null;
  isSystem: boolean;
  status: TemplateStatus;
  version: number;
  isActive: boolean;
  criteriaCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KpiTemplateItem {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  section: KpiSection;
  measurementText: string | null;
  measureMethod: string | null;
  /** Chuỗi để không mất độ chính xác qua JSON. */
  weight: string;
  scoringMode: ScoringMode;
  displayOrder: number;
  maxScale: number;
  children: KpiTemplateItem[];
}

export interface KpiTemplateDetail extends KpiTemplate {
  items: KpiTemplateItem[];
}

/** Một dòng khi soạn. `weight` là chuỗi để người dùng gõ dở không bị nhảy số. */
export interface EditorItem {
  key: string;
  parentKey: string | null;
  name: string;
  description: string;
  section: KpiSection;
  measurementText: string;
  measureMethod: string;
  weight: string;
}

export interface LoiKiemTra {
  ma: string;
  thongDiep: string;
  itemKey?: string;
}
