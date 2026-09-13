import { describe, it, expect } from 'vitest';
import { KpiSection, Prisma } from '@prisma/client';
import { kiemTraMau, type ItemDeKiem } from './template-validation.js';

const D = (n: number | string) => new Prisma.Decimal(n);

function cha(key: string, weight: number, name = key, extra: Partial<ItemDeKiem> = {}) {
  return {
    key,
    parentKey: null,
    name,
    section: KpiSection.BSC_WORK,
    weight: D(weight),
    ...extra,
  } satisfies ItemDeKiem;
}
function con(key: string, parentKey: string, weight: number, extra: Partial<ItemDeKiem> = {}) {
  return {
    key,
    parentKey,
    name: key,
    section: KpiSection.BSC_WORK,
    weight: D(weight),
    ...extra,
  } satisfies ItemDeKiem;
}

const ma = (loi: ReturnType<typeof kiemTraMau>) => loi.map((l) => l.ma);

describe('kiemTraMau', () => {
  describe('mẫu chức danh (isSystem = false)', () => {
    it('mẫu đúng 70 và mỗi nhóm con đúng 100 thì hợp lệ', () => {
      const items = [
        cha('A', 40),
        con('a1', 'A', 60),
        con('a2', 'A', 40),
        cha('B', 30),
      ];
      expect(kiemTraMau(items, false)).toEqual([]);
    });

    it('tổng 60 thì báo lỗi nêu rõ con số và phần thiếu', () => {
      const loi = kiemTraMau([cha('A', 60)], false);
      expect(ma(loi)).toContain('TONG_CAP1_SAI');
      expect(loi[0].thongDiep).toContain('60');
      expect(loi[0].thongDiep).toContain('70');
      expect(loi[0].thongDiep).toContain('thiếu 10');
    });

    it('tổng 80 thì báo thừa', () => {
      const loi = kiemTraMau([cha('A', 80)], false);
      expect(loi[0].thongDiep).toContain('thừa 10');
    });

    it('nhóm con tổng 90 thì nêu ĐÚNG TÊN tiêu chí sai', () => {
      const items = [
        cha('A', 40, 'Tiến độ hoàn thành Shop Drawing'),
        con('a1', 'A', 50),
        con('a2', 'A', 40),
        cha('B', 30, 'Độ chính xác của bản vẽ'),
        con('b1', 'B', 100),
      ];
      const loi = kiemTraMau(items, false);
      expect(ma(loi)).toEqual(['TONG_CON_SAI']);
      expect(loi[0].thongDiep).toContain('Tiến độ hoàn thành Shop Drawing');
      expect(loi[0].thongDiep).toContain('90');
      expect(loi[0].thongDiep).toContain('100');
      // Không được đổ lỗi nhầm sang tiêu chí đúng
      expect(loi[0].thongDiep).not.toContain('Độ chính xác');
    });

    it('tiêu chí lá (không có con) KHÔNG bị áp ràng buộc tổng con', () => {
      expect(kiemTraMau([cha('A', 70)], false)).toEqual([]);
    });

    it('chứa item COMPLIANCE thì báo sai mục, kèm gợi ý mẫu hệ thống', () => {
      const items = [cha('A', 70), cha('B', 0, 'B', { section: KpiSection.COMPLIANCE })];
      const loi = kiemTraMau(items, false);
      expect(ma(loi)).toContain('SAI_MUC');
      expect(loi.find((l) => l.ma === 'SAI_MUC')!.thongDiep).toContain('mẫu hệ thống');
    });
  });

  describe('mẫu hệ thống (isSystem = true)', () => {
    it('ba tiêu chí COMPLIANCE tổng 30 thì hợp lệ', () => {
      const items = [10, 10, 10].map((w, i) =>
        cha(`C${i}`, w, `C${i}`, { section: KpiSection.COMPLIANCE }),
      );
      expect(kiemTraMau(items, true)).toEqual([]);
    });

    it('KHÔNG bị đòi tổng 70 — đó là ràng buộc của mẫu chức danh', () => {
      const items = [10, 10, 10].map((w, i) =>
        cha(`C${i}`, w, `C${i}`, { section: KpiSection.COMPLIANCE }),
      );
      // Cùng bộ item này nếu coi là mẫu chức danh thì sai cả hai đường
      expect(kiemTraMau(items, false).length).toBeGreaterThan(0);
      expect(kiemTraMau(items, true)).toEqual([]);
    });

    it('chứa item BSC_WORK thì báo sai mục', () => {
      const items = [
        cha('C1', 30, 'C1', { section: KpiSection.COMPLIANCE }),
        cha('X', 0, 'X'),
      ];
      expect(ma(kiemTraMau(items, true))).toContain('SAI_MUC');
    });
  });

  describe('cấu trúc', () => {
    it('cấp 3 (con của con) thì báo lỗi', () => {
      const items = [
        cha('A', 70),
        con('a1', 'A', 100),
        con('a1x', 'a1', 100), // cháu
      ];
      const loi = kiemTraMau(items, false);
      expect(ma(loi)).toContain('QUA_HAI_CAP');
      expect(loi.find((l) => l.ma === 'QUA_HAI_CAP')!.thongDiep).toContain('hai cấp');
    });

    it('trỏ tới cha không tồn tại thì báo lỗi', () => {
      const items = [cha('A', 70), con('x', 'KHONG_CO', 100)];
      expect(ma(kiemTraMau(items, false))).toContain('CHA_KHONG_TON_TAI');
    });

    it('tiêu chí vừa có con vừa chấm trực tiếp thì báo cấm trộn', () => {
      const items = [
        cha('A', 70, 'A', { scoringMode: 'CALCULATED' }),
        con('a1', 'A', 100),
      ];
      const loi = kiemTraMau(items, false);
      expect(ma(loi)).toContain('CAM_TRON');
      expect(loi.find((l) => l.ma === 'CAM_TRON')!.thongDiep).toContain(
        'điểm tính từ các con',
      );
    });

    it('KPI con khác mục với cha thì báo lỗi', () => {
      const items = [
        cha('A', 70),
        con('a1', 'A', 100, { section: KpiSection.COMPLIANCE }),
      ];
      expect(ma(kiemTraMau(items, false))).toContain('CON_KHAC_MUC_CHA');
    });

    it('mẫu rỗng thì báo ngay, không đổ thêm lỗi phụ', () => {
      const loi = kiemTraMau([], false);
      expect(ma(loi)).toEqual(['MAU_RONG']);
    });
  });

  describe('cộng bằng Decimal, không phải số thực', () => {
    it('trọng số con 28.4 + 35.8 + 35.8 = 100, dù số thực cộng ra 99.99999999999999', () => {
      // Đây là ca thật, không phải giả định: JavaScript cộng ba số này ra
      // 99.99999999999999. Nếu kiểm bằng number thì mẫu hợp lệ sẽ bị từ
      // chối xuất bản, và người dùng không hiểu vì sao.
      expect(28.4 + 35.8 + 35.8).not.toBe(100);

      const items = [
        cha('A', 70, 'Tiến độ'),
        con('a1', 'A', 28.4),
        con('a2', 'A', 35.8),
        con('a3', 'A', 35.8),
      ];
      expect(kiemTraMau(items, false)).toEqual([]);
    });

    it('28.6 + 35.7 + 35.7 = 100, dù số thực cộng ra 100.00000000000001', () => {
      expect(28.6 + 35.7 + 35.7).not.toBe(100);

      const items = [
        cha('A', 70, 'Tiến độ'),
        con('a1', 'A', 28.6),
        con('a2', 'A', 35.7),
        con('a3', 'A', 35.7),
      ];
      expect(kiemTraMau(items, false)).toEqual([]);
    });

    it('trọng số con 33.33 × 3 = 99.99 thì báo sai, không làm tròn cho qua', () => {
      const items = [
        cha('A', 70, 'Tiến độ'),
        con('a1', 'A', 33.33),
        con('a2', 'A', 33.33),
        con('a3', 'A', 33.33),
      ];
      const loi = kiemTraMau(items, false);
      expect(ma(loi)).toEqual(['TONG_CON_SAI']);
      expect(loi[0].thongDiep).toContain('99.99');
    });

    it('thông báo bỏ số 0 thừa: 70.00 hiện là 70', () => {
      const loi = kiemTraMau([cha('A', 60.5)], false);
      expect(loi[0].thongDiep).toContain('60.5');
      expect(loi[0].thongDiep).toContain('cần 70');
      expect(loi[0].thongDiep).not.toContain('70.00');
    });
  });

  it('trả về HẾT các lỗi cùng lúc, không dừng ở lỗi đầu', () => {
    const items = [
      cha('A', 50, 'A'),
      con('a1', 'A', 90),
      cha('B', 10, 'B'),
      con('b1', 'B', 80),
    ];
    const loi = kiemTraMau(items, false);
    expect(loi.length).toBe(3); // tổng cấp 1 sai + 2 nhóm con sai
  });

  it('tỉ lệ hai mục lấy từ Cài đặt: mẫu chức danh tổng 60 đúng khi cài 60/40', () => {
    const sauMuoi = { bscWork: 60, compliance: 40 };
    const mau60 = [cha('a', 30), cha('b', 30)];
    expect(kiemTraMau(mau60, false)).not.toEqual([]); // mặc định 70 -> sai
    expect(kiemTraMau(mau60, false, sauMuoi)).toEqual([]);
    const heThong40 = [cha('c', 40, 'c', { section: KpiSection.COMPLIANCE })];
    expect(kiemTraMau(heThong40, true, sauMuoi)).toEqual([]);
  });
});
