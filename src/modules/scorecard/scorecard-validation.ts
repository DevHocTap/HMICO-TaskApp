import { KpiSection, Prisma } from '@prisma/client';
import type { TrongSoHaiMuc } from '../settings/cai-dat-mac-dinh.js';
import {
  TONG_TRONG_SO,
  TONG_TRONG_SO_CON,
} from '../kpi-template/kpi-scale.constants.js';

/** Một dòng phiếu, đủ để kiểm trọng số. */
export interface DongDeKiem {
  id: string;
  parentId: string | null;
  name: string;
  section: KpiSection;
  weight: Prisma.Decimal;
}

export interface LoiTrongSo {
  ma: string;
  thongDiep: string;
  itemId?: string;
}

const D = (n: number | string) => new Prisma.Decimal(n);

/** Cộng bằng Decimal. KHÔNG đổi sang number: 0.1 + 0.2 !== 0.3. */
function tong(ds: Prisma.Decimal[]): Prisma.Decimal {
  return ds.reduce((a, b) => a.plus(b), D(0));
}

/** Bỏ số 0 thừa ở đuôi cho thông báo dễ đọc: 70.00 -> "70". */
function soDep(d: Prisma.Decimal): string {
  return d.toDecimalPlaces(2).toString();
}

const TEN_MUC: Record<KpiSection, string> = {
  [KpiSection.BSC_WORK]: 'BSC công việc',
  [KpiSection.COMPLIANCE]: 'Chấp hành nội quy',
};

/**
 * Kiểm trọng số của MỘT PHIẾU đã ghép đủ hai mục.
 *
 * ĐÂY LÀ CHỖ RÀNG BUỘC "TỔNG PHIẾU = 100" THUỘC VỀ.
 *
 * Ở lát cắt mẫu KPI, mỗi mẫu được kiểm riêng: mẫu chức danh = 70, mẫu hệ
 * thống = 30. Không mẫu nào tự nó bằng 100, và ép từng mẫu phải bằng 100 sẽ
 * khiến không mẫu nào xuất bản được. Phiếu mới là nơi hai mẫu gặp nhau.
 *
 * Trả về danh sách lỗi, rỗng nghĩa là hợp lệ. Không ném exception: giao
 * diện cần hiện HẾT các lỗi cùng lúc.
 */
export function kiemTraTrongSoPhieu(
  items: readonly DongDeKiem[],
  // Tỉ lệ hai mục từ Cài đặt hệ thống; mặc định 70/30
  trongSo: TrongSoHaiMuc = {
    bscWork: TONG_TRONG_SO[KpiSection.BSC_WORK],
    compliance: TONG_TRONG_SO[KpiSection.COMPLIANCE],
  },
): LoiTrongSo[] {
  const loi: LoiTrongSo[] = [];

  if (items.length === 0) {
    return [{ ma: 'PHIEU_RONG', thongDiep: 'Phiếu chưa có tiêu chí nào.' }];
  }

  const cap1 = items.filter((i) => i.parentId === null);
  const conCua = new Map<string, DongDeKiem[]>();
  for (const i of items) {
    if (!i.parentId) continue;
    conCua.set(i.parentId, [...(conCua.get(i.parentId) ?? []), i]);
  }

  // --- Từng mục phải đúng tổng của nó ---
  for (const section of [KpiSection.BSC_WORK, KpiSection.COMPLIANCE]) {
    const cuaMuc = cap1.filter((i) => i.section === section);
    const canCo = D(section === KpiSection.BSC_WORK ? trongSo.bscWork : trongSo.compliance);
    const thucTe = tong(cuaMuc.map((i) => i.weight));

    if (cuaMuc.length === 0) {
      loi.push({
        ma: 'THIEU_MUC',
        thongDiep:
          `Phiếu thiếu hẳn mục "${TEN_MUC[section]}" (cần tổng ${soDep(canCo)}). ` +
          (section === KpiSection.COMPLIANCE
            ? 'Mục này lấy từ mẫu hệ thống, kiểm lại xem mẫu hệ thống đã được ghép vào chưa.'
            : 'Kiểm lại mẫu KPI của chức danh này.'),
      });
      continue;
    }

    if (!thucTe.equals(canCo)) {
      const lech = thucTe.minus(canCo);
      loi.push({
        ma: 'TONG_MUC_SAI',
        thongDiep:
          `Tổng trọng số mục "${TEN_MUC[section]}" đang là ${soDep(thucTe)}, ` +
          `cần ${soDep(canCo)} (${lech.isNegative() ? 'thiếu' : 'thừa'} ${soDep(lech.abs())}).`,
      });
    }
  }

  // --- Tổng cả phiếu ---
  const tongPhieu = tong(cap1.map((i) => i.weight));
  if (!tongPhieu.equals(D(100))) {
    loi.push({
      ma: 'TONG_PHIEU_SAI',
      thongDiep: `Tổng trọng số cả phiếu đang là ${soDep(tongPhieu)}, cần 100.`,
    });
  }

  // --- Từng tiêu chí có con phải đủ 100 ---
  for (const cha of cap1) {
    const con = conCua.get(cha.id) ?? [];
    if (con.length === 0) continue; // tiêu chí lá, chấm trực tiếp

    const t = tong(con.map((c) => c.weight));
    if (!t.equals(D(TONG_TRONG_SO_CON))) {
      loi.push({
        ma: 'TONG_CON_SAI',
        itemId: cha.id,
        thongDiep:
          `Tiêu chí "${cha.name}" có tổng trọng số KPI con là ${soDep(t)}, ` +
          `cần ${TONG_TRONG_SO_CON}.`,
      });
    }
  }

  return loi;
}

/**
 * Tổng trọng số tiêu chí cấp 1, dùng cho danh sách phiếu.
 *
 * Nhận sẵn kết quả groupBy nên không phải nạp cả cây item của từng phiếu.
 */
export function tongTrongSoCap1(
  weights: readonly Prisma.Decimal[],
): Prisma.Decimal {
  return tong([...weights]);
}
