import { KpiDirection, Prisma } from '@prisma/client';
import { HE_SO_VUOT_THANG } from '../../kpi-template/kpi-scale.constants.js';

/**
 * Hướng B — suy điểm từ SỐ LIỆU THÔ (`scoringMode = CALCULATED`).
 *
 * ⚠️ CHƯA BẬT. Không hàm nào ngoài test gọi file này, và bảng `KpiResult`
 * chưa dựng. Viết sẵn theo docs/quy-tac-nghiep-vu.md mục 3 vì đây là chỗ dễ
 * sai nhất khi cần đến: bốn ca biên có mục tiêu bằng 0 đều xuất hiện trong
 * biểu mẫu thật ("0 tai nạn lao động", "0 lỗi nghiêm trọng").
 *
 * CÒN THIẾU TRƯỚC KHI BẬT ĐƯỢC: đơn vị đo của ô "Mục tiêu" chưa chuẩn hoá —
 * bốn file Excel đang lẫn `≥ 95%`, `0.95`, `1`, `Đạt`. Công thức dưới đây
 * cần một con số để chia; nó không đọc được chữ "Đạt", và không phân biệt
 * được `1` nghĩa là "1 lần" hay "100%". Xem docs/no-ky-thuat.md câu 5.
 *
 * Công thức:
 *   HIGHER_BETTER:  tỷ lệ = thực tế ÷ mục tiêu
 *   LOWER_BETTER:   tỷ lệ = mục tiêu ÷ thực tế
 *   điểm = min(tỷ lệ, 1,2) × maxScale
 */

const D = (n: number | string | Prisma.Decimal) => new Prisma.Decimal(n);

/** Trần tỷ lệ đạt — 1,2 lần mục tiêu, giống trần chấm tay của BSC_WORK. */
const TRAN_TY_LE = D(HE_SO_VUOT_THANG);

export type MaLoiHuongB = 'MUC_TIEU_KHONG_HOP_LE' | 'THIEU_HUONG';

export class LoiHuongB extends Error {
  constructor(
    readonly ma: MaLoiHuongB,
    thongDiep: string,
  ) {
    super(thongDiep);
    this.name = 'LoiHuongB';
  }
}

export interface DauVaoHuongB {
  direction: KpiDirection | null;
  /** Mục tiêu đặt ra đầu kỳ. */
  targetValue: Prisma.Decimal | null;
  /** Số liệu thực tế cuối kỳ. */
  actualValue: Prisma.Decimal;
  /** Ngưỡng sàn: dưới ngưỡng này thì 0 điểm, bất kể tỷ lệ. */
  minValue?: Prisma.Decimal | null;
  /** Thang điểm của tiêu chí, chụp lại trên phiếu. */
  maxScale: number;
}

/**
 * Kiểm mục tiêu có dùng được cho hướng B không.
 *
 * Tách riêng khỏi `tinhDiemTuSoLieu` để gọi được lúc LƯU mẫu KPI: mục tiêu
 * vô nghĩa phải bị chặn từ lúc nhập, không đợi tới cuối kỳ mới vỡ ra là
 * không chấm được.
 */
export function kiemMucTieu(direction: KpiDirection | null, targetValue: Prisma.Decimal | null): void {
  // Enum chỉ có HIGHER_BETTER và LOWER_BETTER: `RANGE` cố ý KHÔNG đưa vào
  // schema ở giai đoạn 1 (docs mục 3), nên ở đây không có nhánh cho nó.
  if (direction === null) {
    throw new LoiHuongB('THIEU_HUONG', 'Tiêu chí tính tự động phải khai hướng tốt (cao hơn hay thấp hơn là tốt).');
  }
  if (targetValue === null) {
    throw new LoiHuongB('MUC_TIEU_KHONG_HOP_LE', 'Tiêu chí tính tự động phải có mục tiêu.');
  }
  if (targetValue.isNegative()) {
    throw new LoiHuongB('MUC_TIEU_KHONG_HOP_LE', 'Mục tiêu không được âm.');
  }
  // "Càng cao càng tốt" với mục tiêu 0 là vô nghĩa: mọi kết quả đều đạt vô
  // hạn lần mục tiêu. Chặn lúc validate, không cho lưu.
  if (direction === KpiDirection.HIGHER_BETTER && targetValue.isZero()) {
    throw new LoiHuongB(
      'MUC_TIEU_KHONG_HOP_LE',
      'Mục tiêu 0 không dùng được với hướng "càng cao càng tốt": chia cho 0 không có nghĩa.',
    );
  }
}

/**
 * Điểm suy từ số liệu thô. Kết quả nằm trong khoảng `0 .. maxScale × 1,2`.
 *
 * Ba ca mục tiêu bằng 0 — docs mục 3:
 *
 * | Ca                                    | Kết quả          |
 * |---------------------------------------|------------------|
 * | LOWER_BETTER, mục tiêu 0, thực tế 0   | đúng thang       |
 * | LOWER_BETTER, mục tiêu 0, thực tế > 0 | 0 điểm           |
 * | LOWER_BETTER, mục tiêu > 0, thực tế 0 | chặn trần ở 1,2  |
 * | HIGHER_BETTER, mục tiêu 0             | ném lỗi validate |
 */
export function tinhDiemTuSoLieu(dv: DauVaoHuongB): Prisma.Decimal {
  kiemMucTieu(dv.direction, dv.targetValue);
  const mucTieu = dv.targetValue!;
  const thucTe = dv.actualValue;
  const thang = D(dv.maxScale);

  // Ngưỡng sàn xét TRƯỚC mọi phép chia: dưới sàn là 0 điểm, kể cả khi tỷ lệ
  // tính ra vẫn đẹp.
  if (dv.minValue != null && thucTe.lessThan(dv.minValue)) return D(0);

  const tyLe = tinhTyLe(dv.direction!, mucTieu, thucTe);
  const tyLeChan = Prisma.Decimal.min(tyLe, TRAN_TY_LE);
  return tyLeChan.times(thang);
}

function tinhTyLe(
  direction: KpiDirection,
  mucTieu: Prisma.Decimal,
  thucTe: Prisma.Decimal,
): Prisma.Decimal {
  if (direction === KpiDirection.HIGHER_BETTER) {
    // `kiemMucTieu` đã loại mục tiêu = 0, nên phép chia này an toàn.
    return thucTe.div(mucTieu);
  }

  // LOWER_BETTER
  if (mucTieu.isZero()) {
    // "Không được có lỗi nào": đạt đúng 0 là tròn thang, không phải vượt
    // chỉ tiêu — không có cách nào tốt hơn 0. Có lỗi thì mất trắng điểm
    // tiêu chí đó, dù chỉ 1 lỗi.
    return thucTe.isZero() ? D(1) : D(0);
  }
  if (thucTe.isZero()) {
    // Mục tiêu > 0 mà thực tế 0 thì tỷ lệ là vô hạn. Trả thẳng trần thay vì
    // chia cho 0 (Decimal.div(0) ném lỗi, và Infinity thì không so được).
    return TRAN_TY_LE;
  }
  return mucTieu.div(thucTe);
}
