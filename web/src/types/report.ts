/** Một dòng tiến độ nộp. Số liệu ĐÃ được backend cộng dồn từ cây con. */
export interface DongTienDo {
  departmentId: string;
  departmentName: string;
  parentId: string | null;
  tongNhanSu: number;
  chuaCoPhieu: number;
  chuaKyNhan: number;
  choTuCham: number;
  choTruongCham: number;
  choTiepNhan: number;
  daNop: number;
}

export interface BaoCaoTienDo {
  period: { id: string; code: string; name: string };
  /** Chờ HCNS chốt mốc hạn nộp — hiện luôn null / false. */
  daysUntilDeadline: number | null;
  isOverdue: boolean;
  departments: DongTienDo[];
}

/** Dòng cho Table dạng cây của Ant Design. */
export interface DongTienDoCay extends DongTienDo {
  children?: DongTienDoCay[];
}

/**
 * Dựng cây từ danh sách phẳng.
 *
 * Backend đã cắt `parentId` trỏ ra ngoài phạm vi thành `null`, nên phòng
 * nào không tìm thấy cha ở đây là gốc thật. Vẫn phòng thân: dòng mồ côi
 * được đẩy lên mức gốc thay vì biến mất khỏi bảng.
 */
export function dungCayPhong(dongs: DongTienDo[]): DongTienDoCay[] {
  const nut = new Map<string, DongTienDoCay>();
  for (const d of dongs) nut.set(d.departmentId, { ...d });

  const goc: DongTienDoCay[] = [];
  for (const d of dongs) {
    const hienTai = nut.get(d.departmentId)!;
    const cha = d.parentId ? nut.get(d.parentId) : undefined;
    if (!cha) {
      goc.push(hienTai);
      continue;
    }
    (cha.children ??= []).push(hienTai);
  }
  return goc;
}

/** Mọi id trong cây — để mở hết mọi nhánh mặc định. */
export function moiIdPhong(dongs: DongTienDo[]): string[] {
  return dongs.map((d) => d.departmentId);
}
