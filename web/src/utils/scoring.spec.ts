import { describe, it, expect } from 'vitest';
import { hienDiem, tinhDiemPhieu, type DongCham } from './scoring';

/**
 * Mấy ca dưới đây LẤY NGUYÊN từ test của engine backend
 * (`src/modules/scorecard/scoring/scoring-engine.spec.ts`).
 *
 * Cố ý trùng lặp: hai bên tính bằng hai cách khác nhau (Decimal ở backend,
 * số nguyên ở đây), nên chỉ có cùng bộ ca mới phát hiện được lúc chúng bắt
 * đầu lệch nhau. Màn hình hiện một số rồi lưu xong nhảy sang số khác là lỗi
 * người dùng không có cách nào tự hiểu.
 */

const THANG_BSC = 10;
const THANG_NOI_QUY = 3;

function dong(
  id: string,
  weight: number,
  diem: number | null,
  maxScale = THANG_BSC,
  parentId: string | null = null,
): DongCham {
  return {
    id,
    parentId,
    maxScale,
    weight: String(weight),
    selfScore: diem === null ? null : String(diem),
    managerScore: diem === null ? null : String(diem),
  };
}

/** 6 tiêu chí BSC (tổng 70) + 3 tiêu chí nội quy (tổng 30), đều là lá. */
function phieuPhang(diemBsc: number | null, diemNoiQuy: number | null): DongCham[] {
  return [
    dong('b1', 15, diemBsc),
    dong('b2', 15, diemBsc),
    dong('b3', 10, diemBsc),
    dong('b4', 10, diemBsc),
    dong('b5', 10, diemBsc),
    dong('b6', 10, diemBsc),
    dong('c1', 10, diemNoiQuy, THANG_NOI_QUY),
    dong('c2', 10, diemNoiQuy, THANG_NOI_QUY),
    dong('c3', 10, diemNoiQuy, THANG_NOI_QUY),
  ];
}

describe('tinhDiemPhieu — khớp với engine backend', () => {
  it('tất cả điểm tối đa -> đúng 100', () => {
    expect(tinhDiemPhieu(phieuPhang(10, 3), 'manager').tongDiem).toBe(100);
  });

  it('mọi BSC = 12 và mọi nội quy = 3 -> tổng phiếu tối đa 114', () => {
    expect(tinhDiemPhieu(phieuPhang(12, 3), 'manager').tongDiem).toBe(114);
  });

  it('một tiêu chí BSC chấm 12/10 -> đóng góp 18, tổng 103', () => {
    const dongs = phieuPhang(10, 3);
    dongs[0] = dong('b1', 15, 12);
    const kq = tinhDiemPhieu(dongs, 'manager');

    expect(kq.theoDong.get('b1')?.dongGop).toBe(18);
    expect(kq.tongDiem).toBe(103);
  });

  it('trọng số 28,4 / 35,8 / 35,8 cộng lại ra đúng 100', () => {
    const dongs = [dong('b1', 28.4, 10), dong('b2', 35.8, 10), dong('b3', 35.8, 10)];

    expect(tinhDiemPhieu(dongs, 'manager').tongDiem).toBe(100);
    // Cộng bằng số thực thì không ra 100 — đây là lý do hàm này tồn tại
    expect(28.4 + 35.8 + 35.8).not.toBe(100);
  });

  it('điểm 2 trên thang 3, ba tiêu chí trọng số 10 -> đúng 20', () => {
    const dongs = [
      dong('c1', 10, 2, THANG_NOI_QUY),
      dong('c2', 10, 2, THANG_NOI_QUY),
      dong('c3', 10, 2, THANG_NOI_QUY),
    ];

    // 2/3 là số vô hạn tuần hoàn, tổng vẫn phải tròn 20
    expect(tinhDiemPhieu(dongs, 'manager').tongDiem).toBe(20);
  });

  it('KHÔNG tự chuẩn hoá trọng số: phiếu mới soạn 60/100 ra 60 điểm', () => {
    const dongs = [dong('b1', 30, 10), dong('b2', 20, 10), dong('c1', 10, 3, THANG_NOI_QUY)];

    expect(tinhDiemPhieu(dongs, 'manager').tongDiem).toBe(60);
  });
});

describe('tinhDiemPhieu — cây hai cấp', () => {
  const tienDo = (): DongCham[] => [
    dong('td', 15, null),
    dong('td1', 20, 10, THANG_BSC, 'td'),
    dong('td2', 20, 10, THANG_BSC, 'td'),
    dong('td3', 20, 10, THANG_BSC, 'td'),
    dong('td4', 20, 10, THANG_BSC, 'td'),
    dong('td5', 20, 10, THANG_BSC, 'td'),
  ];

  it('5 KPI con trọng số 20 đều 10/10 -> điểm cha 10, đóng góp 15', () => {
    const kq = tinhDiemPhieu(tienDo(), 'manager');

    expect(kq.theoDong.get('td')?.diem).toBe(10);
    expect(kq.theoDong.get('td')?.dongGop).toBe(15);
    expect(kq.tongDiem).toBe(15);
  });

  it('KPI con không đóng góp trực tiếp vào tổng phiếu', () => {
    const kq = tinhDiemPhieu(tienDo(), 'manager');

    expect(kq.theoDong.get('td1')?.diem).toBe(10);
    expect(kq.theoDong.get('td1')?.dongGop).toBeNull();
  });

  it('con chấm lệch nhau -> điểm cha 9, đóng góp 13,5', () => {
    const dongs = tienDo();
    dongs[1] = dong('td1', 20, 5, THANG_BSC, 'td');
    const kq = tinhDiemPhieu(dongs, 'manager');

    expect(kq.theoDong.get('td')?.diem).toBe(9);
    expect(kq.theoDong.get('td')?.dongGop).toBe(13.5);
  });

  it('còn một con chưa chấm thì cả nhánh chưa tính được', () => {
    const dongs = tienDo();
    dongs[2] = dong('td2', 20, null, THANG_BSC, 'td');
    const kq = tinhDiemPhieu(dongs, 'manager');

    expect(kq.theoDong.get('td')?.diem).toBeNull();
    expect(kq.theoDong.get('td')?.dongGop).toBeNull();
    expect(kq.thieuDiem).toEqual(['td2']);
    expect(kq.daChamDu).toBe(false);
  });
});

describe('tinhDiemPhieu — ô trống', () => {
  it('tiêu chí lá bỏ trống KHÔNG bị coi là 0 điểm', () => {
    const dongs = phieuPhang(10, 3);
    dongs[2] = dong('b3', 10, null);
    const kq = tinhDiemPhieu(dongs, 'manager');

    expect(kq.daChamDu).toBe(false);
    expect(kq.thieuDiem).toEqual(['b3']);
    expect(kq.theoDong.get('b3')?.dongGop).toBeNull();
    // Điểm tính thử: nhánh chưa chấm không đóng góp
    expect(kq.tongDiem).toBe(90);
  });

  it('hai cột tính độc lập', () => {
    const dongs = phieuPhang(10, 3).map((d) => ({ ...d, managerScore: null }));

    expect(tinhDiemPhieu(dongs, 'self').tongDiem).toBe(100);
    expect(tinhDiemPhieu(dongs, 'manager').daChamDu).toBe(false);
  });
});

describe('hienDiem', () => {
  it('bỏ số 0 thừa và dùng dấu phẩy thập phân', () => {
    expect(hienDiem(15)).toBe('15');
    expect(hienDiem(13.5)).toBe('13,5');
    expect(hienDiem(null)).toBe('—');
  });
});
