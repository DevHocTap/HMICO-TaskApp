import { describe, it, expect } from 'vitest';
import { KpiSection, Prisma } from '@prisma/client';
import { kiemTraTrongSoPhieu, type DongDeKiem } from './scorecard-validation.js';

const D = (n: number) => new Prisma.Decimal(n);

function cha(id: string, weight: number, section = KpiSection.BSC_WORK, name = id): DongDeKiem {
  return { id, parentId: null, name, section, weight: D(weight) };
}
function con(id: string, parentId: string, weight: number, section = KpiSection.BSC_WORK): DongDeKiem {
  return { id, parentId, name: id, section, weight: D(weight) };
}

const ma = (l: ReturnType<typeof kiemTraTrongSoPhieu>) => l.map((x) => x.ma);

/** Phiếu hợp lệ tối thiểu: BSC 70 + nội quy 30. */
function phieuDung(): DongDeKiem[] {
  return [
    cha('b1', 40),
    cha('b2', 30),
    cha('c1', 10, KpiSection.COMPLIANCE),
    cha('c2', 10, KpiSection.COMPLIANCE),
    cha('c3', 10, KpiSection.COMPLIANCE),
  ];
}

describe('kiemTraTrongSoPhieu', () => {
  it('phiếu ghép đủ hai mục 70 + 30 thì hợp lệ', () => {
    expect(kiemTraTrongSoPhieu(phieuDung())).toEqual([]);
  });

  it('tỉ lệ hai mục lấy từ Cài đặt: 60/40 thì phiếu 70/30 sai, phiếu 60/40 đúng', () => {
    const sauMuoi = { bscWork: 60, compliance: 40 };
    expect(ma(kiemTraTrongSoPhieu(phieuDung(), sauMuoi))).toContain('TONG_MUC_SAI');
    const phieu6040 = [
      cha('b1', 40),
      cha('b2', 20),
      cha('c1', 20, KpiSection.COMPLIANCE),
      cha('c2', 20, KpiSection.COMPLIANCE),
    ];
    expect(kiemTraTrongSoPhieu(phieu6040, sauMuoi)).toEqual([]);
  });

  it('thiếu hẳn mục Chấp hành nội quy — gợi ý kiểm mẫu hệ thống', () => {
    const loi = kiemTraTrongSoPhieu([cha('b1', 70)]);
    expect(ma(loi)).toContain('THIEU_MUC');
    const l = loi.find((x) => x.ma === 'THIEU_MUC')!;
    expect(l.thongDiep).toContain('Chấp hành nội quy');
    expect(l.thongDiep).toContain('mẫu hệ thống');
  });

  it('thiếu hẳn mục BSC — gợi ý kiểm mẫu chức danh', () => {
    const loi = kiemTraTrongSoPhieu([
      cha('c1', 10, KpiSection.COMPLIANCE),
      cha('c2', 20, KpiSection.COMPLIANCE),
    ]);
    const l = loi.find((x) => x.ma === 'THIEU_MUC')!;
    expect(l.thongDiep).toContain('BSC công việc');
    expect(l.thongDiep).toContain('mẫu KPI của chức danh');
  });

  it('BSC 60 thay vì 70: nêu rõ con số và phần thiếu', () => {
    const items = phieuDung().map((i) => (i.id === 'b2' ? cha('b2', 20) : i));
    const loi = kiemTraTrongSoPhieu(items);

    const mucSai = loi.find((x) => x.ma === 'TONG_MUC_SAI')!;
    expect(mucSai.thongDiep).toContain('60');
    expect(mucSai.thongDiep).toContain('cần 70');
    expect(mucSai.thongDiep).toContain('thiếu 10');
    // và tổng phiếu cũng sai theo
    expect(ma(loi)).toContain('TONG_PHIEU_SAI');
  });

  it('mỗi mục đúng nhưng phiếu vẫn phải đúng 100 — hai kiểm tra độc lập', () => {
    // Không dựng được ca này bằng dữ liệu hợp lệ, nên kiểm gián tiếp:
    // sai một mục thì có ĐÚNG hai lỗi, không phải một
    const items = phieuDung().map((i) => (i.id === 'b1' ? cha('b1', 45) : i));
    const loi = kiemTraTrongSoPhieu(items);
    expect(ma(loi).sort()).toEqual(['TONG_MUC_SAI', 'TONG_PHIEU_SAI']);
  });

  it('tiêu chí có con phải đủ 100, nêu ĐÚNG TÊN tiêu chí sai', () => {
    const items = [
      ...phieuDung(),
      con('b1a', 'b1', 60),
      con('b1b', 'b1', 30),
    ];
    const loi = kiemTraTrongSoPhieu(items);
    expect(ma(loi)).toEqual(['TONG_CON_SAI']);
    expect(loi[0].thongDiep).toContain('b1');
    expect(loi[0].thongDiep).toContain('90');
    expect(loi[0].itemId).toBe('b1');
  });

  it('tiêu chí lá không bị áp ràng buộc tổng con', () => {
    expect(kiemTraTrongSoPhieu(phieuDung())).toEqual([]);
  });

  it('phiếu rỗng báo ngay, không đổ thêm lỗi phụ', () => {
    expect(ma(kiemTraTrongSoPhieu([]))).toEqual(['PHIEU_RONG']);
  });

  describe('cộng bằng Decimal, không phải số thực', () => {
    it('KPI con 28.4 + 35.8 + 35.8 = 100 dù số thực ra 99.99999999999999', () => {
      expect(28.4 + 35.8 + 35.8).not.toBe(100);
      const items = [
        ...phieuDung(),
        con('b1a', 'b1', 28.4),
        con('b1b', 'b1', 35.8),
        con('b1c', 'b1', 35.8),
      ];
      expect(kiemTraTrongSoPhieu(items)).toEqual([]);
    });

    it('tiêu chí cấp 1 lẻ thập phân vẫn cộng đúng 70', () => {
      const items = [
        cha('b1', 23.4),
        cha('b2', 23.3),
        cha('b3', 23.3),
        cha('c1', 10, KpiSection.COMPLIANCE),
        cha('c2', 10, KpiSection.COMPLIANCE),
        cha('c3', 10, KpiSection.COMPLIANCE),
      ];
      expect(kiemTraTrongSoPhieu(items)).toEqual([]);
    });
  });

  it('trả HẾT các lỗi cùng lúc, không dừng ở lỗi đầu', () => {
    const items = [
      cha('b1', 30),
      con('b1a', 'b1', 90),
      cha('c1', 20, KpiSection.COMPLIANCE),
    ];
    const loi = kiemTraTrongSoPhieu(items);
    // BSC sai + nội quy sai + tổng phiếu sai + tổng con sai
    expect(loi.length).toBe(4);
  });
});
