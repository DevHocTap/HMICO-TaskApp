/**
 * Tính điểm phiếu KPI ở phía giao diện — để cột bên phải cập nhật NGAY khi gõ.
 *
 * ĐÂY KHÔNG PHẢI NGUỒN SỰ THẬT. Số chốt luôn lấy từ backend
 * (`selfTotalScore`, `managerTotalScore`, `grade`); hàm này chỉ để người
 * đang chấm thấy mình đang ở đâu trước khi bấm lưu. Công thức phải khớp
 * `src/modules/scorecard/scoring/scoring-engine.ts`, nếu không màn hình sẽ
 * hiện một số rồi lưu xong lại nhảy sang số khác.
 *
 * Công thức (docs/quy-tac-nghiep-vu.md mục 3):
 *
 *   điểm tiêu chí lá     = điểm nhập trực tiếp
 *   điểm tiêu chí có con = Σ (điểm con × trọng số con ÷ 100)
 *   đóng góp             = (điểm tiêu chí ÷ maxScale) × trọng số tiêu chí
 *   tổng điểm (%)        = Σ đóng góp của tiêu chí cấp 1
 *
 * KHÔNG CỘNG BẰNG SỐ THỰC. Giống `utils/weight.ts`: quy hết về số nguyên
 * rồi mới chia lại ở bước cuối. `28.4 + 35.8 + 35.8` trong JavaScript ra
 * `99.99999999999999`, và một thanh tổng báo 99,99 trong khi backend chốt
 * 100,00 là loại lỗi không ai giải thích nổi cho người dùng.
 */

/** Điểm và trọng số có tối đa 2 chữ số thập phân — quy về số nguyên. */
const DON_VI_2 = 100;

/**
 * Đơn vị nội bộ cho điểm và đóng góp: một phần triệu.
 *
 * Rộng hơn 2 chữ số thập phân rất nhiều, nên phép chia cho `maxScale` (3
 * hoặc 10) không tích luỹ sai số đủ để đổi kết quả ở chữ số thứ hai.
 */
const MICRO = 1_000_000;

export type CotCham = 'self' | 'manager';

export interface DongCham {
  id: string;
  parentId: string | null;
  maxScale: number;
  /** Chuỗi lấy thẳng từ API (Decimal của Prisma đi qua JSON là chuỗi). */
  weight: string;
  selfScore: string | number | null;
  managerScore: string | number | null;
}

export interface KetQuaDong {
  /** Điểm của tiêu chí theo thang của nó; `null` = nhánh chưa chấm xong. */
  diem: number | null;
  /** Đóng góp vào tổng phiếu; chỉ tiêu chí cấp 1 mới có. */
  dongGop: number | null;
}

export interface KetQuaCham {
  theoDong: Map<string, KetQuaDong>;
  /** Tổng điểm phần trăm, đã làm tròn 2 chữ số. */
  tongDiem: number;
  daChamDu: boolean;
  /** Id các tiêu chí LÁ còn thiếu điểm. */
  thieuDiem: string[];
}

/** Chuỗi người dùng gõ -> số nguyên hai chữ số thập phân. Trống thì `null`. */
function sangDonVi(giaTri: string | number | null | undefined): number | null {
  if (giaTri === null || giaTri === undefined || giaTri === '') return null;
  const so = typeof giaTri === 'number' ? giaTri : Number(String(giaTri).replace(',', '.'));
  if (!Number.isFinite(so)) return null;
  return Math.round(so * DON_VI_2);
}

/** Làm tròn nửa lên, 2 chữ số — giống `ROUND_HALF_UP` của backend. */
function tuMicro(micro: number): number {
  return Math.round(micro / (MICRO / DON_VI_2)) / DON_VI_2;
}

const layDiem = (d: DongCham, cot: CotCham) =>
  cot === 'self' ? d.selfScore : d.managerScore;

export function tinhDiemPhieu(dongs: readonly DongCham[], cot: CotCham): KetQuaCham {
  const conCuaCha = new Map<string, DongCham[]>();
  for (const d of dongs) {
    if (!d.parentId) continue;
    const ds = conCuaCha.get(d.parentId);
    if (ds) ds.push(d);
    else conCuaCha.set(d.parentId, [d]);
  }

  const theoDong = new Map<string, KetQuaDong>();
  const thieuDiem: string[] = [];

  /** Điểm của một tiêu chí, tính bằng MICRO. `null` = nhánh chưa chấm xong. */
  function diemMicro(d: DongCham): number | null {
    const con = conCuaCha.get(d.id);
    if (con && con.length > 0) {
      // Σ (điểm con × trọng số con ÷ 100). Cả hai đều là số nguyên 2 chữ số
      // thập phân, nên tích của chúng CHÍNH LÀ micro — không mất gì.
      let tong = 0;
      let du = true;
      for (const c of con) {
        const diemCon = sangDonVi(layDiem(c, cot));
        const trongSoCon = sangDonVi(c.weight) ?? 0;
        if (diemCon === null) {
          thieuDiem.push(c.id);
          du = false;
          continue;
        }
        theoDong.set(c.id, { diem: diemCon / DON_VI_2, dongGop: null });
        tong += diemCon * trongSoCon;
      }
      return du ? tong : null;
    }

    const diem = sangDonVi(layDiem(d, cot));
    if (diem === null) {
      thieuDiem.push(d.id);
      return null;
    }
    return diem * DON_VI_2 * DON_VI_2;
  }

  let tongMicro = 0;
  for (const d of dongs) {
    if (d.parentId) continue;
    const diem = diemMicro(d);
    const trongSo = sangDonVi(d.weight) ?? 0;
    // đóng góp = điểm ÷ maxScale × trọng số. Nhân trước, chia sau.
    const dongGop =
      diem === null || d.maxScale <= 0
        ? null
        : Math.round((diem * trongSo) / (DON_VI_2 * d.maxScale));
    theoDong.set(d.id, {
      diem: diem === null ? null : tuMicro(diem),
      dongGop: dongGop === null ? null : tuMicro(dongGop),
    });
    if (dongGop !== null) tongMicro += dongGop;
  }

  return {
    theoDong,
    tongDiem: tuMicro(tongMicro),
    daChamDu: thieuDiem.length === 0,
    thieuDiem,
  };
}

/** Bỏ số 0 thừa ở đuôi: 15.00 -> "15", 13.50 -> "13,5". Dùng dấu phẩy. */
export function hienDiem(giaTri: number | null): string {
  if (giaTri === null) return '—';
  return String(Math.round(giaTri * DON_VI_2) / DON_VI_2).replace('.', ',');
}
