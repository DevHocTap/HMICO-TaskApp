import { describe, it, expect } from 'vitest';
import {
  cacKyCanBaoDam,
  congThang,
  kyNam,
  kyQuy,
  kyThang,
  namThangHienTai,
  soNgayCuaThang,
  tinhTinhTrangHanNop,
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
    expect(iso(k.submitDeadline)).toBe('2026-09-30');
    expect(k.parentCode).toBe('2026-Q3');
  });

  it('tháng 12 thì hạn nộp rơi sang năm sau', () => {
    expect(iso(kyThang(2026, 12).submitDeadline)).toBe('2026-12-30');
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

  describe('khởi động vào tháng 12 — vắt sang năm mới', () => {
    const ds = cacKyCanBaoDam(new Date('2026-12-10T03:00:00Z'));
    const theoMa = new Map(ds.map((k) => [k.code, k]));

    it('sinh đủ sáu kỳ của cả hai năm', () => {
      expect(ds.map((k) => k.code).sort()).toEqual([
        '2026', '2026-12', '2026-Q4', '2027', '2027-01', '2027-Q1',
      ]);
    });

    it('2027-01 nối lên 2027-Q1, rồi lên 2027 — không lạc sang cây năm cũ', () => {
      expect(theoMa.get('2027-01')!.parentCode).toBe('2027-Q1');
      expect(theoMa.get('2027-Q1')!.parentCode).toBe('2027');
      expect(theoMa.get('2027')!.parentCode).toBeNull();
    });

    it('2026-12 vẫn nối lên 2026-Q4 rồi 2026', () => {
      expect(theoMa.get('2026-12')!.parentCode).toBe('2026-Q4');
      expect(theoMa.get('2026-Q4')!.parentCode).toBe('2026');
    });

    it('mọi kỳ cha đứng TRƯỚC con, kể cả khi vắt qua hai năm', () => {
      const viTri = new Map(ds.map((k, i) => [k.code, i]));
      for (const k of ds) {
        if (!k.parentCode) continue;
        expect(viTri.has(k.parentCode)).toBe(true);
        expect(viTri.get(k.parentCode)!).toBeLessThan(viTri.get(k.code)!);
      }
    });

    it('ngày tháng của kỳ năm mới đúng', () => {
      const q1 = theoMa.get('2027-Q1')!;
      expect(q1.startDate.toISOString().slice(0, 10)).toBe('2027-01-01');
      expect(q1.endDate.toISOString().slice(0, 10)).toBe('2027-03-31');
      const t1 = theoMa.get('2027-01')!;
      expect(t1.submitDeadline!.toISOString().slice(0, 10)).toBe('2027-01-30');
    });
  });

  it('không sinh trùng mã dù hai tháng cùng quý', () => {
    const ma = cacKyCanBaoDam(new Date('2026-07-05T03:00:00Z')).map((k) => k.code);
    expect(new Set(ma).size).toBe(ma.length);
  });
});

/**
 * Bốn mốc quanh hạn nộp 02/10/2026.
 *
 * Quy tắc: hạn là HẾT ngày 02 giờ Việt Nam, nên chính ngày 02 vẫn nộp được.
 * Giả lập giờ hệ thống bằng mốc UTC tương ứng (VN = UTC+7), không phụ thuộc
 * ngày chạy thật cũng không phụ thuộc múi giờ của máy chạy test.
 */
describe('tinhTinhTrangHanNop — hạn là HẾT ngày 02, giờ Việt Nam', () => {
  const HAN = new Date(Date.UTC(2026, 9, 2)); // 02/10/2026, kiểu @db.Date

  const truongHop: Array<[string, string, number, boolean]> = [
    ['01/10 09:00 giờ VN', '2026-10-01T02:00:00Z', 2, false],
    ['02/10 09:00 giờ VN', '2026-10-02T02:00:00Z', 1, false],
    ['02/10 23:00 giờ VN', '2026-10-02T16:00:00Z', 1, false],
    ['03/10 09:00 giờ VN', '2026-10-03T02:00:00Z', 0, true],
  ];

  for (const [ten, mocUtc, soNgay, quaHan] of truongHop) {
    it(`${ten} → còn ${soNgay} ngày, quá hạn = ${quaHan}`, () => {
      expect(tinhTinhTrangHanNop(HAN, new Date(mocUtc))).toEqual({
        daysUntilDeadline: soNgay,
        isOverdue: quaHan,
      });
    });
  }

  it('quá hạn nhiều ngày vẫn trả 0, không bao giờ âm', () => {
    expect(tinhTinhTrangHanNop(HAN, new Date('2026-10-20T02:00:00Z'))).toEqual({
      daysUntilDeadline: 0,
      isOverdue: true,
    });
  });

  it('không có hạn thì trả null, và không phải quá hạn', () => {
    expect(tinhTinhTrangHanNop(null, new Date('2026-10-20T02:00:00Z'))).toEqual({
      daysUntilDeadline: null,
      isOverdue: false,
    });
  });

  /**
   * Ca mà công thức cũ (`Date.now()` trừ mốc, chia 86400000) sai: 23:00
   * ngày 02 giờ VN vẫn là 16:00 ngày 02 giờ UTC, nhưng 07:00 ngày 03 giờ VN
   * lại là 00:00 ngày 03 giờ UTC — biên ngày phải cắt theo giờ VN.
   */
  it('23:59 ngày 02 còn nộp được, 00:01 ngày 03 là quá hạn (biên giờ VN)', () => {
    expect(tinhTinhTrangHanNop(HAN, new Date('2026-10-02T16:59:00Z')).isOverdue).toBe(
      false,
    );
    expect(tinhTinhTrangHanNop(HAN, new Date('2026-10-02T17:01:00Z')).isOverdue).toBe(
      true,
    );
  });
});

/**
 * Bốn mốc HCNS chốt 03/09/2026 (câu A2). Toàn bộ nằm TRONG chính tháng đó —
 * bản trước đặt hạn nộp ở ngày 02 THÁNG SAU, lệch hẳn một tháng.
 */
describe('kyThang — bốn mốc trong tháng', () => {
  const iso = (d: Date | null) => d!.toISOString().slice(0, 10);

  it('tháng 09/2026: lên KPI 25/08, tự chấm 25/09, TP chấm 29/09, gửi HCNS 30/09', () => {
    const k = kyThang(2026, 9);
    expect(iso(k.assignDeadline)).toBe('2026-08-25');
    expect(iso(k.selfScoreDeadline)).toBe('2026-09-25');
    expect(iso(k.managerScoreDeadline)).toBe('2026-09-29');
    expect(iso(k.submitDeadline)).toBe('2026-09-30');
  });

  it('hạn lên KPI nằm ở THÁNG TRƯỚC, kể cả khi vắt qua năm', () => {
    // Trưởng phòng lên KPI tháng 01/2027 vào ngày 25/12/2026
    expect(iso(kyThang(2027, 1).assignDeadline)).toBe('2026-12-25');
  });

  /**
   * Ca dễ trượt nhất: `Date.UTC(2027, 1, 30)` KHÔNG báo lỗi, nó lặng lẽ trôi
   * sang 02/03. Hạn nộp của tháng 2 rơi vào tháng 3 mà không ai nhìn ra.
   */
  it('tháng 2 kẹp về ngày cuối tháng, không trôi sang tháng 3', () => {
    const t2 = kyThang(2027, 2); // 2027 không nhuận -> 28 ngày
    expect(iso(t2.selfScoreDeadline)).toBe('2027-02-25');
    expect(iso(t2.managerScoreDeadline)).toBe('2027-02-28');
    expect(iso(t2.submitDeadline)).toBe('2027-02-28');
    expect(iso(t2.endDate)).toBe('2027-02-28');
  });

  it('tháng 2 năm nhuận kẹp về 29', () => {
    const t2 = kyThang(2028, 2);
    expect(iso(t2.managerScoreDeadline)).toBe('2028-02-29');
    expect(iso(t2.submitDeadline)).toBe('2028-02-29');
  });

  it('tháng 30 ngày: hạn gửi HCNS đúng ngày cuối tháng', () => {
    expect(iso(kyThang(2026, 4).submitDeadline)).toBe('2026-04-30');
    expect(iso(kyThang(2026, 4).managerScoreDeadline)).toBe('2026-04-29');
  });

  it('mọi hạn đều nằm trong lòng kỳ, trừ hạn lên KPI (ở tháng trước)', () => {
    for (let thang = 1; thang <= 12; thang++) {
      const k = kyThang(2027, thang);
      expect(k.selfScoreDeadline!.getTime()).toBeGreaterThanOrEqual(k.startDate.getTime());
      expect(k.submitDeadline!.getTime()).toBeLessThanOrEqual(k.endDate.getTime());
      expect(k.managerScoreDeadline!.getTime()).toBeLessThanOrEqual(k.submitDeadline!.getTime());
      expect(k.assignDeadline!.getTime()).toBeLessThan(k.startDate.getTime());
    }
  });

  it('kỳ quý và kỳ năm không có mốc nào', () => {
    for (const k of [kyQuy(2026, 3), kyNam(2026)]) {
      expect(k.assignDeadline).toBeNull();
      expect(k.selfScoreDeadline).toBeNull();
      expect(k.managerScoreDeadline).toBeNull();
      expect(k.submitDeadline).toBeNull();
    }
  });

  it('soNgayCuaThang đúng cả năm nhuận', () => {
    expect(soNgayCuaThang(2027, 2)).toBe(28);
    expect(soNgayCuaThang(2028, 2)).toBe(29);
    expect(soNgayCuaThang(2026, 4)).toBe(30);
    expect(soNgayCuaThang(2026, 12)).toBe(31);
  });
});
