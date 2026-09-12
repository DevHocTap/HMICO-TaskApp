import { describe, it, expect } from 'vitest';
import { Grade, KpiSection, Prisma } from '@prisma/client';
import {
  chotDiem,
  LoiChamDiem,
  tinhDiem,
  tranDiemCuaDong,
  xepLoaiTuTongDiem,
  type DongCham,
} from './scoring-engine.js';

const D = (n: number | string) => new Prisma.Decimal(n);

const THANG_BSC = 10;
const THANG_NOI_QUY = 3;

function cha(
  id: string,
  weight: number,
  diem: number | null,
  section = KpiSection.BSC_WORK,
): DongCham {
  const maxScale = section === KpiSection.BSC_WORK ? THANG_BSC : THANG_NOI_QUY;
  return {
    id,
    parentId: null,
    name: id,
    section,
    maxScale,
    weight: D(weight),
    selfScore: diem === null ? null : D(diem),
    managerScore: diem === null ? null : D(diem),
  };
}

function con(
  id: string,
  parentId: string,
  weight: number,
  diem: number | null,
  section = KpiSection.BSC_WORK,
): DongCham {
  return { ...cha(id, weight, diem, section), parentId };
}

/** Tiêu chí cha thì KHÔNG mang điểm — điểm suy ra từ con. */
function chaCoCon(id: string, weight: number, section = KpiSection.BSC_WORK): DongCham {
  return cha(id, weight, null, section);
}

const so = (d: Prisma.Decimal | null) => (d === null ? null : d.toString());

const dongTheoId = (kq: ReturnType<typeof tinhDiem>, id: string) =>
  kq.dong.find((x) => x.itemId === id)!;

/**
 * Phiếu đủ hai mục theo biểu mẫu thật: 6 tiêu chí BSC (tổng 70) + 3 tiêu chí
 * chấp hành nội quy (tổng 30). Mọi tiêu chí là lá, chấm cùng một mức.
 */
function phieuPhang(diemBsc: number | null, diemNoiQuy: number | null): DongCham[] {
  return [
    cha('b1', 15, diemBsc),
    cha('b2', 15, diemBsc),
    cha('b3', 10, diemBsc),
    cha('b4', 10, diemBsc),
    cha('b5', 10, diemBsc),
    cha('b6', 10, diemBsc),
    cha('c1', 10, diemNoiQuy, KpiSection.COMPLIANCE),
    cha('c2', 10, diemNoiQuy, KpiSection.COMPLIANCE),
    cha('c3', 10, diemNoiQuy, KpiSection.COMPLIANCE),
  ];
}

describe('tinhDiem — phiếu đầy đủ', () => {
  it('6 tiêu chí BSC + 3 nội quy, tất cả điểm tối đa -> đúng 100,00', () => {
    const kq = tinhDiem(phieuPhang(10, 3), 'manager');

    expect(so(kq.tongDiem)).toBe('100');
    expect(kq.daChamDu).toBe(true);
    expect(kq.thieuDiem).toEqual([]);
    expect(kq.xepLoai).toBe(Grade.COMPLETED);
  });

  it('mọi BSC = 12 và mọi nội quy = 3 -> tổng phiếu tối đa 114,00', () => {
    const kq = tinhDiem(phieuPhang(12, 3), 'manager');

    // 70 × 1,2 = 84 ở mục BSC, cộng 30 ở mục nội quy (nội quy không vượt được)
    expect(so(kq.tongDiem)).toBe('114');
    expect(kq.xepLoai).toBe(Grade.EXCEEDED);
  });

  it('một tiêu chí BSC chấm 12/10 -> đóng góp lớn hơn trọng số, tổng > 100', () => {
    const dongs = phieuPhang(10, 3);
    dongs[0] = cha('b1', 15, 12); // 12/10 × 15 = 18, hơn trọng số 15 đúng 3

    const kq = tinhDiem(dongs, 'manager');

    expect(so(dongTheoId(kq, 'b1').dongGop)).toBe('18');
    expect(so(kq.tongDiem)).toBe('103');
    expect(kq.xepLoai).toBe(Grade.EXCEEDED);
  });
});

describe('tinhDiem — cây hai cấp, mẫu Shop Drawing thật', () => {
  /**
   * "Tiến độ hoàn thành Shop Drawing" trọng số 15, có 5 KPI con mỗi con
   * trọng số 20. Cả 5 đạt 10/10 thì đóng góp phải đúng 15,00.
   */
  const tienDoShopDrawing = (): DongCham[] => [
    chaCoCon('tien-do', 15),
    con('td1', 'tien-do', 20, 10),
    con('td2', 'tien-do', 20, 10),
    con('td3', 'tien-do', 20, 10),
    con('td4', 'tien-do', 20, 10),
    con('td5', 'tien-do', 20, 10),
  ];

  it('5 KPI con trọng số 20, đều 10/10 -> điểm cha 10, đóng góp 15,00', () => {
    const kq = tinhDiem(tienDoShopDrawing(), 'manager');

    expect(so(dongTheoId(kq, 'tien-do').diem)).toBe('10');
    expect(so(dongTheoId(kq, 'tien-do').dongGop)).toBe('15');
    expect(so(kq.tongDiem)).toBe('15');
  });

  it('KPI con không đóng góp trực tiếp vào tổng phiếu', () => {
    const kq = tinhDiem(tienDoShopDrawing(), 'manager');

    expect(dongTheoId(kq, 'td1').dongGop).toBeNull();
    expect(so(dongTheoId(kq, 'td1').diem)).toBe('10');
  });

  it('con chấm lệch nhau thì điểm cha là trung bình theo trọng số', () => {
    const dongs = tienDoShopDrawing();
    dongs[1] = con('td1', 'tien-do', 20, 5); // 4 con 10 điểm + 1 con 5 điểm

    const kq = tinhDiem(dongs, 'manager');

    // (10+10+10+10)×0,2 + 5×0,2 = 9
    expect(so(dongTheoId(kq, 'tien-do').diem)).toBe('9');
    expect(so(dongTheoId(kq, 'tien-do').dongGop)).toBe('13.5');
  });
});

describe('tinhDiem — trần điểm theo mục', () => {
  it('BSC_WORK trần 12, chấm đúng 12 thì hợp lệ', () => {
    expect(() => tinhDiem([cha('b1', 70, 12)], 'manager')).not.toThrow();
  });

  it('BSC_WORK chấm 12,01 -> lỗi VUOT_TRAN', () => {
    try {
      tinhDiem([cha('b1', 70, 12.01)], 'manager');
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect(e).toBeInstanceOf(LoiChamDiem);
      expect((e as LoiChamDiem).ma).toBe('VUOT_TRAN');
      expect((e as LoiChamDiem).itemId).toBe('b1');
    }
  });

  it('COMPLIANCE chấm 3,01 -> lỗi VUOT_TRAN (nội quy không được vượt thang)', () => {
    try {
      tinhDiem([cha('c1', 30, 3.01, KpiSection.COMPLIANCE)], 'manager');
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect((e as LoiChamDiem).ma).toBe('VUOT_TRAN');
    }
  });

  it('điểm âm -> lỗi DIEM_AM', () => {
    try {
      tinhDiem([cha('b1', 70, -1)], 'manager');
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect((e as LoiChamDiem).ma).toBe('DIEM_AM');
    }
  });

  it('tranDiemCuaDong: BSC 10 -> 12, nội quy 3 -> 3', () => {
    expect(so(tranDiemCuaDong(KpiSection.BSC_WORK, 10))).toBe('12');
    expect(so(tranDiemCuaDong(KpiSection.COMPLIANCE, 3))).toBe('3');
  });

  it('trần tính theo maxScale CỦA DÒNG, không theo hằng số', () => {
    // Phiếu cũ chụp thang 100 thì trần của nó là 120, không phải 12.
    expect(so(tranDiemCuaDong(KpiSection.BSC_WORK, 100))).toBe('120');
  });

  it('COMPLIANCE là NGOẠI LỆ CỨNG: đổi thang sang 10 thì trần vẫn 10, không thành 12', () => {
    // Hệ số 1,2 gắn với SECTION chứ không phải với thang điểm. Công ty đổi
    // thang chấp hành nội quy sang 10 thì vẫn không ai "vượt chỉ tiêu" ở
    // khoản nội quy được — trần đúng bằng thang.
    expect(so(tranDiemCuaDong(KpiSection.COMPLIANCE, 10))).toBe('10');
    expect(so(tranDiemCuaDong(KpiSection.COMPLIANCE, 100))).toBe('100');
  });

  it('COMPLIANCE thang 10 chấm 10 hợp lệ, chấm 10,01 thì lỗi', () => {
    const noiQuyThang10 = (diem: number): DongCham => ({
      ...cha('c1', 30, diem, KpiSection.COMPLIANCE),
      maxScale: 10,
    });

    expect(() => tinhDiem([noiQuyThang10(10)], 'manager')).not.toThrow();
    try {
      tinhDiem([noiQuyThang10(10.01)], 'manager');
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect((e as LoiChamDiem).ma).toBe('VUOT_TRAN');
    }
  });
});

describe('tinhDiem — KHÔNG tự chuẩn hoá trọng số', () => {
  it('phiếu còn dở, tổng trọng số cấp 1 chỉ 60 -> tổng điểm ~60, KHÔNG ép về 100', () => {
    // Trưởng phòng mới soạn được 60/100 trọng số. Nếu engine chia lại cho
    // tổng trọng số thực tế thì phiếu thiếu KPI vẫn ra 100% và không ai
    // nhìn ra là nó thiếu.
    const dongs = [cha('b1', 30, 10), cha('b2', 20, 10), cha('c1', 10, 3, KpiSection.COMPLIANCE)];

    const kq = tinhDiem(dongs, 'manager');

    expect(so(kq.tongDiem)).toBe('60');
    expect(kq.daChamDu).toBe(true);
    expect(kq.xepLoai).toBe(Grade.NOT_ACHIEVED);
  });

  it('trọng số con chưa đủ 100 cũng không được chuẩn hoá', () => {
    // Cha trọng số 15, mới có 3 con × 20 = 60 trong 100.
    const dongs = [
      chaCoCon('tien-do', 15),
      con('td1', 'tien-do', 20, 10),
      con('td2', 'tien-do', 20, 10),
      con('td3', 'tien-do', 20, 10),
    ];

    const kq = tinhDiem(dongs, 'manager');

    // điểm cha = 10×0,2 ×3 = 6 (không phải 10), đóng góp = 6/10 × 15 = 9
    expect(so(dongTheoId(kq, 'tien-do').diem)).toBe('6');
    expect(so(dongTheoId(kq, 'tien-do').dongGop)).toBe('9');
  });
});

describe('tinhDiem — chống lỗi số thực', () => {
  it('trọng số 28,4 / 35,8 / 35,8 cộng lại ra đúng 100, không ra 99.99999999999999', () => {
    const dongs = [cha('b1', 28.4, 10), cha('b2', 35.8, 10), cha('b3', 35.8, 10)];

    const kq = tinhDiem(dongs, 'manager');

    expect(so(kq.tongDiem)).toBe('100');
    // Chốt lại bằng số thực để thấy rõ vì sao phải dùng Decimal
    expect(28.4 + 35.8 + 35.8).not.toBe(100);
  });

  it('điểm lẻ chia cho thang 3 vẫn cộng ra số tròn', () => {
    const dongs = [
      cha('c1', 10, 2, KpiSection.COMPLIANCE),
      cha('c2', 10, 2, KpiSection.COMPLIANCE),
      cha('c3', 10, 2, KpiSection.COMPLIANCE),
    ];

    // (2 ÷ 3) × 10 × 3 = 20 chẵn, dù 2/3 là số vô hạn tuần hoàn
    expect(so(tinhDiem(dongs, 'manager').tongDiem)).toBe('20');
  });
});

describe('xepLoaiTuTongDiem — ngưỡng từ Cài đặt hệ thống', () => {
  const nguong = { canCaiThien: 70, hoanThanh: 85, vuot: 100 };

  it('ranh giới đổi theo ngưỡng truyền vào', () => {
    expect(xepLoaiTuTongDiem(D('69.99'), nguong)).toBe(Grade.NOT_ACHIEVED);
    expect(xepLoaiTuTongDiem(D('70'), nguong)).toBe(Grade.NEEDS_IMPROVEMENT);
    expect(xepLoaiTuTongDiem(D('84.99'), nguong)).toBe(Grade.NEEDS_IMPROVEMENT);
    expect(xepLoaiTuTongDiem(D('85'), nguong)).toBe(Grade.COMPLETED);
    expect(xepLoaiTuTongDiem(D('100'), nguong)).toBe(Grade.COMPLETED);
    expect(xepLoaiTuTongDiem(D('100.01'), nguong)).toBe(Grade.EXCEEDED);
  });

  it('tinhDiem và chotDiem chuyển ngưỡng xuống xếp loại', () => {
    const dongs = [cha('b1', 100, 8)]; // 80 điểm
    expect(tinhDiem(dongs, 'manager').xepLoai).toBe(Grade.NEEDS_IMPROVEMENT);
    expect(tinhDiem(dongs, 'manager', { canCaiThien: 60, hoanThanh: 75, vuot: 100 }).xepLoai).toBe(
      Grade.COMPLETED,
    );
    expect(chotDiem(dongs, 'manager', { canCaiThien: 85, hoanThanh: 95, vuot: 100 }).xepLoai).toBe(
      Grade.NOT_ACHIEVED,
    );
  });
});

describe('xepLoaiTuTongDiem — bốn ranh giới', () => {
  it('79,99 -> NOT_ACHIEVED', () => {
    expect(xepLoaiTuTongDiem(D('79.99'))).toBe(Grade.NOT_ACHIEVED);
  });

  it('80,00 -> NEEDS_IMPROVEMENT', () => {
    expect(xepLoaiTuTongDiem(D('80.00'))).toBe(Grade.NEEDS_IMPROVEMENT);
  });

  it('89,996 làm tròn thành 90,00 -> COMPLETED, không phải NEEDS_IMPROVEMENT', () => {
    // Chỗ này chính là lý do phải làm tròn TRƯỚC rồi mới xếp loại.
    const dongs = [cha('b1', 100, 8.9996)];
    const kq = tinhDiem(dongs, 'manager');

    expect(so(kq.tongDiem)).toBe('90');
    expect(kq.xepLoai).toBe(Grade.COMPLETED);
    // So thẳng trên số chưa làm tròn thì ra kết quả khác
    expect(xepLoaiTuTongDiem(D('89.996'))).toBe(Grade.NEEDS_IMPROVEMENT);
  });

  it('100,00 -> COMPLETED, 100,01 -> EXCEEDED', () => {
    expect(xepLoaiTuTongDiem(D('100.00'))).toBe(Grade.COMPLETED);
    expect(xepLoaiTuTongDiem(D('100.01'))).toBe(Grade.EXCEEDED);
  });
});

describe('tinhDiem — dữ liệu vào sai', () => {
  it('tiêu chí có con mà bị truyền điểm trực tiếp -> lỗi DIEM_VAO_TIEU_CHI_CHA', () => {
    const dongs = [cha('tien-do', 15, 10), con('td1', 'tien-do', 100, 10)];

    try {
      tinhDiem(dongs, 'manager');
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect((e as LoiChamDiem).ma).toBe('DIEM_VAO_TIEU_CHI_CHA');
      expect((e as LoiChamDiem).itemId).toBe('tien-do');
    }
  });

  it('cây ba cấp -> lỗi CAY_QUA_SAU', () => {
    const dongs = [
      chaCoCon('a', 100),
      con('b', 'a', 100, null),
      { ...con('c', 'b', 100, 10) },
    ];

    try {
      tinhDiem(dongs, 'manager');
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect((e as LoiChamDiem).ma).toBe('CAY_QUA_SAU');
    }
  });

  it('con trỏ tới cha không có trong phiếu -> lỗi CHA_KHONG_TON_TAI', () => {
    try {
      tinhDiem([con('td1', 'khong-co', 100, 10)], 'manager');
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect((e as LoiChamDiem).ma).toBe('CHA_KHONG_TON_TAI');
    }
  });
});

describe('tinhDiem — chưa chấm đủ', () => {
  it('tiêu chí lá bỏ trống KHÔNG được ngầm coi là 0', () => {
    const dongs = phieuPhang(10, 3);
    dongs[2] = cha('b3', 10, null);

    const kq = tinhDiem(dongs, 'manager');

    expect(kq.daChamDu).toBe(false);
    expect(kq.thieuDiem).toEqual(['b3']);
    expect(kq.xepLoai).toBeNull();
    // Điểm tính thử: nhánh chưa chấm không đóng góp, KHÔNG phải chấm 0.
    expect(dongTheoId(kq, 'b3').diem).toBeNull();
    expect(dongTheoId(kq, 'b3').dongGop).toBeNull();
    expect(so(kq.tongDiem)).toBe('90');
  });

  it('cha còn con chưa chấm thì cả nhánh chưa tính được', () => {
    const dongs = [
      chaCoCon('tien-do', 15),
      con('td1', 'tien-do', 50, 10),
      con('td2', 'tien-do', 50, null),
    ];

    const kq = tinhDiem(dongs, 'manager');

    expect(kq.thieuDiem).toEqual(['td2']);
    expect(dongTheoId(kq, 'tien-do').diem).toBeNull();
    expect(dongTheoId(kq, 'tien-do').dongGop).toBeNull();
  });

  it('chotDiem ném lỗi CHUA_CHAM_DU kèm danh sách item còn thiếu', () => {
    const dongs = phieuPhang(10, 3);
    dongs[2] = cha('b3', 10, null);
    dongs[6] = cha('c1', 10, null, KpiSection.COMPLIANCE);

    try {
      chotDiem(dongs, 'manager');
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect((e as LoiChamDiem).ma).toBe('CHUA_CHAM_DU');
      expect((e as LoiChamDiem).itemIds).toEqual(['b3', 'c1']);
    }
  });

  it('chotDiem trả điểm và xếp loại khi đã chấm đủ', () => {
    expect(chotDiem(phieuPhang(10, 3), 'manager')).toEqual({
      tongDiem: D(100),
      xepLoai: Grade.COMPLETED,
    });
  });
});

describe('tinhDiem — hai cột độc lập', () => {
  it('mỗi cột tính riêng, không ảnh hưởng nhau', () => {
    const dongs = phieuPhang(10, 3).map((d) => ({
      ...d,
      selfScore: D(10),
      managerScore: D(8),
    }));
    // Cột nội quy thang 3, đặt lại cho đúng thang
    for (const d of dongs) {
      if (d.section === KpiSection.COMPLIANCE) {
        d.selfScore = D(3);
        d.managerScore = D(2);
      }
    }

    const tuCham = tinhDiem(dongs, 'self');
    const truongPhong = tinhDiem(dongs, 'manager');

    expect(so(tuCham.tongDiem)).toBe('100');
    // 8/10 × 70 = 56, cộng 2/3 × 30 = 20 -> 76
    expect(so(truongPhong.tongDiem)).toBe('76');
    expect(truongPhong.xepLoai).toBe(Grade.NOT_ACHIEVED);
  });

  it('cột TỰ CHẤM có tổng điểm nhưng KHÔNG có xếp loại', () => {
    const kq = tinhDiem(phieuPhang(10, 3), 'self');

    expect(so(kq.tongDiem)).toBe('100');
    expect(kq.daChamDu).toBe(true);
    expect(kq.xepLoai).toBeNull();
    expect(chotDiem(phieuPhang(10, 3), 'self').xepLoai).toBeNull();
  });

  it('thiếu điểm ở cột này không làm hỏng cột kia', () => {
    const dongs = phieuPhang(10, 3);
    dongs[0] = { ...cha('b1', 15, 10), selfScore: null };

    expect(tinhDiem(dongs, 'self').thieuDiem).toEqual(['b1']);
    expect(tinhDiem(dongs, 'manager').thieuDiem).toEqual([]);
  });
});
