import { describe, it, expect } from 'vitest';
import { KpiDirection, Prisma } from '@prisma/client';
import { kiemMucTieu, LoiHuongB, tinhDiemTuSoLieu } from './huong-b.js';

const D = (n: number | string) => new Prisma.Decimal(n);
const so = (d: Prisma.Decimal) => d.toString();

/** Thang mặc định của BSC_WORK. */
const THANG = 10;

const diem = (
  direction: KpiDirection,
  mucTieu: number | null,
  thucTe: number,
  minValue?: number,
) =>
  tinhDiemTuSoLieu({
    direction,
    targetValue: mucTieu === null ? null : D(mucTieu),
    actualValue: D(thucTe),
    minValue: minValue === undefined ? null : D(minValue),
    maxScale: THANG,
  });

describe('hướng B — HIGHER_BETTER', () => {
  it('đạt đúng mục tiêu -> tròn thang', () => {
    expect(so(diem(KpiDirection.HIGHER_BETTER, 95, 95))).toBe('10');
  });

  it('đạt một nửa mục tiêu -> nửa thang', () => {
    expect(so(diem(KpiDirection.HIGHER_BETTER, 100, 50))).toBe('5');
  });

  it('vượt mục tiêu -> điểm vượt thang, chặn trần ở 1,2', () => {
    expect(so(diem(KpiDirection.HIGHER_BETTER, 100, 110))).toBe('11');
    expect(so(diem(KpiDirection.HIGHER_BETTER, 100, 130))).toBe('12');
    expect(so(diem(KpiDirection.HIGHER_BETTER, 100, 1000))).toBe('12');
  });

  it('mục tiêu = 0 -> ném lỗi validate, KHÔNG cho lưu', () => {
    try {
      diem(KpiDirection.HIGHER_BETTER, 0, 5);
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect(e).toBeInstanceOf(LoiHuongB);
      expect((e as LoiHuongB).ma).toBe('MUC_TIEU_KHONG_HOP_LE');
    }
  });
});

describe('hướng B — LOWER_BETTER', () => {
  it('đạt đúng mục tiêu -> tròn thang', () => {
    expect(so(diem(KpiDirection.LOWER_BETTER, 3, 3))).toBe('10');
  });

  it('vượt mục tiêu (thấp hơn) -> điểm vượt thang, chặn trần 1,2', () => {
    expect(so(diem(KpiDirection.LOWER_BETTER, 3, 2.5))).toBe('12');
    expect(so(diem(KpiDirection.LOWER_BETTER, 4, 5))).toBe('8');
  });

  it('mục tiêu 0, thực tế 0 -> điểm tối đa của thang', () => {
    // "0 tai nạn lao động": không xảy ra vụ nào là đạt, không có cách nào
    // tốt hơn 0 nên KHÔNG cộng thêm phần vượt thang.
    expect(so(diem(KpiDirection.LOWER_BETTER, 0, 0))).toBe('10');
  });

  it('mục tiêu 0, thực tế > 0 -> 0 điểm', () => {
    expect(so(diem(KpiDirection.LOWER_BETTER, 0, 1))).toBe('0');
    expect(so(diem(KpiDirection.LOWER_BETTER, 0, 0.5))).toBe('0');
  });

  it('mục tiêu > 0, thực tế 0 -> chặn trần ở 1,2 (không chia cho 0)', () => {
    expect(so(diem(KpiDirection.LOWER_BETTER, 3, 0))).toBe('12');
  });
});

describe('hướng B — ngưỡng sàn minValue', () => {
  it('thực tế dưới sàn -> 0 điểm dù tỷ lệ vẫn đẹp', () => {
    expect(so(diem(KpiDirection.HIGHER_BETTER, 100, 60, 80))).toBe('0');
  });

  it('thực tế đúng bằng sàn -> tính bình thường', () => {
    expect(so(diem(KpiDirection.HIGHER_BETTER, 100, 80, 80))).toBe('8');
  });
});

describe('hướng B — kiemMucTieu', () => {
  it('thiếu hướng -> lỗi THIEU_HUONG', () => {
    expect(() => kiemMucTieu(null, D(10))).toThrowError(/hướng tốt/);
  });

  it('thiếu mục tiêu -> lỗi MUC_TIEU_KHONG_HOP_LE', () => {
    try {
      kiemMucTieu(KpiDirection.HIGHER_BETTER, null);
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect((e as LoiHuongB).ma).toBe('MUC_TIEU_KHONG_HOP_LE');
    }
  });

  it('mục tiêu âm -> lỗi', () => {
    try {
      kiemMucTieu(KpiDirection.LOWER_BETTER, D(-1));
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect((e as LoiHuongB).ma).toBe('MUC_TIEU_KHONG_HOP_LE');
    }
  });

  it('LOWER_BETTER với mục tiêu 0 thì hợp lệ (khác HIGHER_BETTER)', () => {
    expect(() => kiemMucTieu(KpiDirection.LOWER_BETTER, D(0))).not.toThrow();
  });
});

describe('hướng B — chống lỗi số thực', () => {
  it('0,1 + 0,2 kiểu số thực không lọt vào kết quả', () => {
    // 0,3 ÷ 0,1 = 3 chẵn. Với number thì 0.30000000000000004 / 0.1 = 3.0000000000000004
    expect(so(diem(KpiDirection.HIGHER_BETTER, 0.1, 0.3))).toBe('12');
    expect(so(diem(KpiDirection.LOWER_BETTER, 0.1, 0.3))).toBe(
      D(1).div(3).times(10).toString(),
    );
  });
});
