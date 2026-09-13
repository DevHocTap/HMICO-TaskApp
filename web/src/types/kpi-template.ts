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
  /** Mẫu nội quy CỦA MỘT PHÒNG: khác null (13/09). Nội quy dùng chung: null. */
  departmentId: string | null;
  departmentName: string | null;
  status: TemplateStatus;
  version: number;
  isActive: boolean;
  criteriaCount: number;
  /** Số KPI con (cấp 2). */
  subCriteriaCount: number;
  /** Tổng trọng số mục mẫu chịu trách nhiệm (BSC 70 / nội quy 30), chuỗi Decimal. */
  weightTotal: string;
  weightRequired: number;
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
