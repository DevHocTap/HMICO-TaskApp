import { describe, it, expect } from 'vitest';
import {
  cacKyCanBaoDam,
  congThang,
  kyNam,
  kyQuy,
  kyThang,
  namThangHienTai,
  quyCuaThang,
} from './period-calendar.js';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe('namThangHienTai — theo giờ Việt Nam', () => {
  it('23:30 ngày 31/08 giờ VN vẫn là tháng 8, dù giờ UTC đã sang 30/08 16:30', () => {
    // 2026-08-31T16:30Z = 2026-08-31T23:30 giờ VN
    expect(namThangHienTai(new Date('2026-08-31T16:30:00Z'))).toEqual({
      nam: 2026,
      thang: 8,
    });
  });

  it('00:30 ngày 01/09 giờ VN đã là tháng 9, dù giờ UTC còn 31/08', () => {
    // 2026-08-31T17:30Z = 2026-09-01T00:30 giờ VN
    expect(namThangHienTai(new Date('2026-08-31T17:30:00Z'))).toEqual({
      nam: 2026,
      thang: 9,
    });
  });
});

describe('congThang', () => {
  it('cộng trong cùng năm', () => {
    expect(congThang(2026, 5, 1)).toEqual({ nam: 2026, thang: 6 });
  });

  it('tháng 12 cộng 1 thì nhảy sang năm sau', () => {
    expect(congThang(2026, 12, 1)).toEqual({ nam: 2027, thang: 1 });
  });
});

describe('quyCuaThang', () => {
  it.each([
    [1, 1], [3, 1], [4, 2], [6, 2], [7, 3], [9, 3], [10, 4], [12, 4],
  ])('tháng %i thuộc quý %i', (thang, quy) => {
    expect(quyCuaThang(thang)).toBe(quy);
  });
});

describe('kyThang', () => {
  it('tháng 9/2026: mã, tên, ngày đầu/cuối, hạn nộp, kỳ cha', () => {
    const k = kyThang(2026, 9);
    expect(k.code).toBe('2026-09');
    expect(k.name).toBe('Tháng 09/2026');
    expect(iso(k.startDate)).toBe('2026-09-01');
    expect(iso(k.endDate)).toBe('2026-09-30');
    expect(iso(k.submitDeadline)).toBe('2026-10-02');
    expect(k.parentCode).toBe('2026-Q3');
  });

  it('tháng 12 thì hạn nộp rơi sang năm sau', () => {
    expect(iso(kyThang(2026, 12).submitDeadline)).toBe('2027-01-02');
  });

  it('tháng 2 năm thường có 28 ngày', () => {
    expect(iso(kyThang(2026, 2).endDate)).toBe('2026-02-28');
  });

  it('tháng 2 năm nhuận có 29 ngày', () => {
    expect(iso(kyThang(2028, 2).endDate)).toBe('2028-02-29');
  });
});

describe('kyQuy và kyNam KHÔNG có hạn nộp', () => {
  it('kỳ quý: chỉ để tổng hợp, không ai nộp gì', () => {
    const q = kyQuy(2026, 3);
    expect(q.code).toBe('2026-Q3');
    expect(iso(q.startDate)).toBe('2026-07-01');
    expect(iso(q.endDate)).toBe('2026-09-30');
    expect(q.submitDeadline).toBeNull();
    expect(q.parentCode).toBe('2026');
  });

  it('kỳ năm', () => {
    const n = kyNam(2026);
    expect(n.code).toBe('2026');
    expect(iso(n.startDate)).toBe('2026-01-01');
    expect(iso(n.endDate)).toBe('2026-12-31');
    expect(n.submitDeadline).toBeNull();
    expect(n.parentCode).toBeNull();
  });
});

describe('cacKyCanBaoDam — quy tắc bù kỳ', () => {
  it('CHỈ tháng hiện tại và tháng kế tiếp, không bù ngược quá khứ', () => {
    // Khởi động lại máy chủ giữa tháng 9 năm 2026
    const ma = cacKyCanBaoDam(new Date('2026-09-15T03:00:00Z')).map((k) => k.code);

    expect(ma).toContain('2026-09');
    expect(ma).toContain('2026-10');
    // Tám tháng đầu năm KHÔNG được sinh ra
    for (const m of ['2026-01', '2026-02', '2026-03', '2026-08']) {
      expect(ma).not.toContain(m);
    }
  });

  it('kèm đủ kỳ quý và kỳ năm chứa hai tháng đó', () => {
    const ma = cacKyCanBaoDam(new Date('2026-09-15T03:00:00Z')).map((k) => k.code);
    expect(ma.sort()).toEqual(['2026', '2026-09', '2026-10', '2026-Q3', '2026-Q4']);
  });

  it('CHA đứng trước CON, để tạo tuần tự là nối được parentId', () => {
    const ds = cacKyCanBaoDam(new Date('2026-09-15T03:00:00Z'));
    const viTri = new Map(ds.map((k, i) => [k.code, i]));

    for (const k of ds) {
      if (!k.parentCode) continue;
      expect(viTri.get(k.parentCode)!).toBeLessThan(viTri.get(k.code)!);
    }
  });

  it('tháng 12 thì kéo theo cả kỳ năm sau', () => {
    const ma = cacKyCanBaoDam(new Date('2026-12-10T03:00:00Z')).map((k) => k.code);
    expect(ma.sort()).toEqual(['2026', '2026-12', '2026-Q4', '2027', '2027-01', '2027-Q1']);
  });

  it('không sinh trùng mã dù hai tháng cùng quý', () => {
    const ma = cacKyCanBaoDam(new Date('2026-07-05T03:00:00Z')).map((k) => k.code);
    expect(new Set(ma).size).toBe(ma.length);
  });
});
