import type { EditorItem, KpiTemplateItem } from '../types/kpi-template';

/** Đổi cây từ API sang danh sách phẳng — dùng cho màn soạn và xem trước. */
export function sangDanhSachPhang(items: KpiTemplateItem[]): EditorItem[] {
  const ra: EditorItem[] = [];
  for (const cha of items) {
    ra.push({
      key: cha.id,
      parentKey: null,
      name: cha.name,
      description: cha.description ?? '',
      section: cha.section,
      measurementText: cha.measurementText ?? '',
      measureMethod: cha.measureMethod ?? '',
      weight: cha.weight,
    });
    for (const con of cha.children) {
      ra.push({
        key: con.id,
        parentKey: cha.id,
        name: con.name,
        description: con.description ?? '',
        section: con.section,
        measurementText: con.measurementText ?? '',
        measureMethod: con.measureMethod ?? '',
        weight: con.weight,
      });
    }
  }
  return ra;
}
