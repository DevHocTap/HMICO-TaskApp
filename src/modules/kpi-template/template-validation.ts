import { Prisma, KpiSection } from '@prisma/client';
import { TONG_TRONG_SO, TONG_TRONG_SO_CON } from './kpi-scale.constants.js';

/** Một dòng trong mẫu, đủ để kiểm tra. Không cần cả bản ghi Prisma. */
export interface ItemDeKiem {
  /** Khoá tạm khi lưu từ giao diện, hoặc id thật khi đọc từ database. */
  key: string;
  parentKey: string | null;
  name: string;
  section: KpiSection;
  weight: Prisma.Decimal;
  /** Chỉ dùng để kiểm quy tắc "cấm trộn". */
  scoringMode?: string;
}

export interface LoiKiemTra {
  /** Mã lỗi, để giao diện tô đúng dòng. */
  ma: string;
  /** Câu tiếng Việt hiện cho người dùng — nêu rõ sai ở đâu, sai bao nhiêu. */
  thongDiep: string;
  /** Dòng gây lỗi, nếu xác định được. */
  itemKey?: string;
}

const D = (n: number | string) => new Prisma.Decimal(n);

/** Cộng Decimal. KHÔNG đổi sang number: 0.1 + 0.2 !== 0.3. */
function tong(ds: Prisma.Decimal[]): Prisma.Decimal {
  return ds.reduce((a, b) => a.plus(b), D(0));
}

/** Bỏ số 0 thừa ở đuôi để thông báo đọc dễ: 70.00 -> 70, 12.50 -> 12.5 */
function soDep(d: Prisma.Decimal): string {
  return d.toDecimalPlaces(2).toString();
}

/**
 * Kiểm tra một mẫu KPI trước khi xuất bản.
 *
 * KIỂM THEO LOẠI MẪU, không áp chung mọi mẫu (docs/quy-tac-nghiep-vu.md
 * mục 2):
 *   - mẫu chức danh (isSystem = false) chỉ chứa BSC_WORK, tổng 70
 *   - mẫu hệ thống  (isSystem = true)  chỉ chứa COMPLIANCE, tổng 30
 *
 * Ràng buộc "tổng phiếu = 100" thuộc về lúc GHÉP hai mẫu thành phiếu, không
 * phải lúc xuất bản từng mẫu. Áp nhầm cấp thì không mẫu nào xuất bản được.
 *
 * Trả về danh sách lỗi, rỗng nghĩa là hợp lệ. Không ném exception: giao
 * diện cần hiện HẾT các lỗi cùng lúc, không phải sửa từng cái một.
 */
export function kiemTraMau(
  items: readonly ItemDeKiem[],
  isSystem: boolean,
): LoiKiemTra[] {
  const loi: LoiKiemTra[] = [];

  const sectionChinh = isSystem ? KpiSection.COMPLIANCE : KpiSection.BSC_WORK;
  const tenMuc = isSystem ? 'Chấp hành nội quy' : 'BSC công việc';

  const theoKey = new Map(items.map((i) => [i.key, i]));
  const cap1 = items.filter((i) => i.parentKey === null);
  const conCua = new Map<string, ItemDeKiem[]>();
  for (const i of items) {
    if (!i.parentKey) continue;
    conCua.set(i.parentKey, [...(conCua.get(i.parentKey) ?? []), i]);
  }

  // --- 7. Phải có ít nhất một tiêu chí ---
  if (cap1.length === 0) {
    loi.push({
      ma: 'MAU_RONG',
      thongDiep: `Mẫu chưa có tiêu chí nào ở mục "${tenMuc}".`,
    });
    return loi; // Các kiểm tra sau không còn ý nghĩa
  }

  // --- 6. Chỉ chứa đúng section của loại mẫu ---
  for (const i of items) {
    if (i.section !== sectionChinh) {
      loi.push({
        ma: 'SAI_MUC',
        itemKey: i.key,
        thongDiep: isSystem
          ? `Mẫu hệ thống chỉ được chứa tiêu chí thuộc mục "Chấp hành nội quy". Dòng "${i.name}" đang thuộc mục khác.`
          : `Mẫu theo chức danh chỉ được chứa tiêu chí thuộc mục "BSC công việc". Dòng "${i.name}" đang thuộc mục khác. Mục "Chấp hành nội quy" nằm ở mẫu hệ thống dùng chung.`,
      });
    }
  }

  // --- 1 & 2. Tổng trọng số tiêu chí cấp 1 ---
  const canCo = D(TONG_TRONG_SO[sectionChinh]);
  const thucTe = tong(cap1.map((i) => i.weight));
  if (!thucTe.equals(canCo)) {
    const lech = thucTe.minus(canCo);
    loi.push({
      ma: 'TONG_CAP1_SAI',
      thongDiep:
        `Tổng trọng số các tiêu chí mục "${tenMuc}" đang là ${soDep(thucTe)}, cần ${soDep(canCo)} ` +
        `(${lech.isNegative() ? 'thiếu' : 'thừa'} ${soDep(lech.abs())}).`,
    });
  }

  // --- 4. Chỉ hai cấp ---
  for (const i of items) {
    if (!i.parentKey) continue;
    const cha = theoKey.get(i.parentKey);
    if (!cha) {
      loi.push({
        ma: 'CHA_KHONG_TON_TAI',
        itemKey: i.key,
        thongDiep: `Dòng "${i.name}" trỏ tới một tiêu chí cha không tồn tại.`,
      });
    } else if (cha.parentKey !== null) {
      loi.push({
        ma: 'QUA_HAI_CAP',
        itemKey: i.key,
        thongDiep:
          `Mẫu KPI chỉ có hai cấp. Dòng "${i.name}" đang nằm dưới "${cha.name}", ` +
          `mà "${cha.name}" đã là KPI con của một tiêu chí khác.`,
      });
    }
  }

  // --- 3. Tổng trọng số KPI con trong TỪNG tiêu chí ---
  for (const cha of cap1) {
    const con = conCua.get(cha.key) ?? [];
    if (con.length === 0) continue; // tiêu chí lá, không áp ràng buộc này

    const t = tong(con.map((c) => c.weight));
    if (!t.equals(D(TONG_TRONG_SO_CON))) {
      loi.push({
        ma: 'TONG_CON_SAI',
        itemKey: cha.key,
        thongDiep:
          `Tiêu chí "${cha.name}" có tổng trọng số KPI con là ${soDep(t)}, cần ${TONG_TRONG_SO_CON}.`,
      });
    }

    // --- 5. Cấm trộn: tiêu chí có con thì không chấm trực tiếp ---
    if (cha.scoringMode === 'CALCULATED') {
      loi.push({
        ma: 'CAM_TRON',
        itemKey: cha.key,
        thongDiep:
          `Tiêu chí "${cha.name}" vừa có KPI con vừa được đặt chấm trực tiếp. ` +
          `Tiêu chí có KPI con thì điểm tính từ các con, không nhập điểm riêng.`,
      });
    }

    // --- 6. section của con phải trùng cha ---
    for (const c of con) {
      if (c.section !== cha.section) {
        loi.push({
          ma: 'CON_KHAC_MUC_CHA',
          itemKey: c.key,
          thongDiep:
            `KPI con "${c.name}" thuộc mục khác với tiêu chí cha "${cha.name}". ` +
            `KPI con phải cùng mục với tiêu chí cha.`,
        });
      }
    }
  }

  return loi;
}
