import { describe, it, expect } from 'vitest';
import {
  chuanHoaNhanhCon,
  congDonTheoCay,
  LoiCayPhong,
  type DongPhong,
} from './cong-don-cay.js';

/** Dòng phòng ban với số liệu tối thiểu; cột không nêu đều 0. */
function phong(
  departmentId: string,
  parentId: string | null,
  so: Partial<Omit<DongPhong, 'departmentId' | 'departmentName' | 'parentId'>> = {},
): DongPhong {
  return {
    departmentId,
    departmentName: departmentId,
    parentId,
    tongNhanSu: 0,
    chuaCoPhieu: 0,
    chuaKyNhan: 0,
    choTuCham: 0,
    choTruongCham: 0,
    choTiepNhan: 0,
    daNop: 0,
    ...so,
  };
}

const lay = (kq: DongPhong[], id: string) => kq.find((d) => d.departmentId === id)!;

describe('congDonTheoCay', () => {
  it('phòng có 2 con -> tổng đúng bằng tổng cả ba mức', () => {
    const kq = congDonTheoCay([
      phong('KT', null, { tongNhanSu: 3, daNop: 1 }),
      phong('KT-SD', 'KT', { tongNhanSu: 4, daNop: 2 }),
      phong('KT-BT', 'KT', { tongNhanSu: 5, daNop: 3 }),
    ]);

    expect(lay(kq, 'KT').tongNhanSu).toBe(12);
    expect(lay(kq, 'KT').daNop).toBe(6);
    // Dòng con giữ nguyên số của chính nó
    expect(lay(kq, 'KT-SD').tongNhanSu).toBe(4);
    expect(lay(kq, 'KT-BT').daNop).toBe(3);
  });

  it('cây 4 tầng -> cộng dồn đúng lên tận đỉnh', () => {
    const kq = congDonTheoCay([
      phong('HMICO', null, { tongNhanSu: 1 }),
      phong('HN', 'HMICO', { tongNhanSu: 2 }),
      phong('KT', 'HN', { tongNhanSu: 4 }),
      phong('KT-TO', 'KT', { tongNhanSu: 8 }),
    ]);

    expect(lay(kq, 'KT-TO').tongNhanSu).toBe(8);
    expect(lay(kq, 'KT').tongNhanSu).toBe(12);
    expect(lay(kq, 'HN').tongNhanSu).toBe(14);
    expect(lay(kq, 'HMICO').tongNhanSu).toBe(15);
  });

  it('phòng không có nhân sự trực thuộc nhưng con có -> dòng cha vẫn hiện số của con', () => {
    // Đây chính là ca của cây thật: "Hà Nội (trụ sở)" có 0 người trực thuộc
    // nhưng bên dưới là toàn bộ các phòng.
    const kq = congDonTheoCay([
      phong('HN', null),
      phong('KT', 'HN', { tongNhanSu: 8, choTuCham: 3 }),
      phong('HCNS', 'HN', { tongNhanSu: 2, choTuCham: 1 }),
    ]);

    expect(lay(kq, 'HN').tongNhanSu).toBe(10);
    expect(lay(kq, 'HN').choTuCham).toBe(4);
  });

  it('KHÔNG đếm trùng: mỗi người cộng đúng một lần ở mỗi mức', () => {
    const kq = congDonTheoCay([
      phong('A', null, { tongNhanSu: 1 }),
      phong('B', 'A', { tongNhanSu: 1 }),
      phong('C', 'B', { tongNhanSu: 1 }),
      phong('D', 'B', { tongNhanSu: 1 }),
    ]);

    // Tổng ở đỉnh phải đúng bằng tổng số người có thật, không nhân lên theo
    // số tầng mà họ đi qua.
    expect(lay(kq, 'A').tongNhanSu).toBe(4);
    expect(lay(kq, 'B').tongNhanSu).toBe(3);
    expect(lay(kq, 'C').tongNhanSu).toBe(1);
    expect(lay(kq, 'D').tongNhanSu).toBe(1);
  });

  it('cộng dồn đủ MỌI cột, không chỉ tổng nhân sự', () => {
    const kq = congDonTheoCay([
      phong('CHA', null, {
        tongNhanSu: 1,
        chuaCoPhieu: 1,
        chuaKyNhan: 1,
        choTuCham: 1,
        choTruongCham: 1,
        choTiepNhan: 1,
        daNop: 1,
      }),
      phong('CON', 'CHA', {
        tongNhanSu: 2,
        chuaCoPhieu: 2,
        chuaKyNhan: 2,
        choTuCham: 2,
        choTruongCham: 2,
        choTiepNhan: 2,
        daNop: 2,
      }),
    ]);

    expect(lay(kq, 'CHA')).toMatchObject({
      tongNhanSu: 3,
      chuaCoPhieu: 3,
      chuaKyNhan: 3,
      choTuCham: 3,
      choTruongCham: 3,
      choTiepNhan: 3,
      daNop: 3,
    });
  });

  it('nhiều cây rời nhau cùng lúc — mỗi cây cộng riêng', () => {
    const kq = congDonTheoCay([
      phong('HN', null, { tongNhanSu: 1 }),
      phong('KT', 'HN', { tongNhanSu: 8 }),
      phong('HCM', null, { tongNhanSu: 1 }),
      phong('KT-HCM', 'HCM', { tongNhanSu: 2 }),
    ]);

    expect(lay(kq, 'HN').tongNhanSu).toBe(9);
    expect(lay(kq, 'HCM').tongNhanSu).toBe(3);
  });

  it('cha nằm NGOÀI danh sách thì coi như gốc, không ném lỗi', () => {
    // Ca của MANAGER: chỉ thấy phòng mình, `parentId` trỏ tới chi nhánh mà
    // họ không được xem.
    const kq = congDonTheoCay([phong('KT', 'HN-khong-thay-duoc', { tongNhanSu: 8 })]);

    expect(lay(kq, 'KT').tongNhanSu).toBe(8);
  });

  it('cây có vòng lặp -> ném lỗi thay vì đệ quy vô hạn', () => {
    try {
      congDonTheoCay([phong('A', 'B', { tongNhanSu: 1 }), phong('B', 'A', { tongNhanSu: 1 })]);
      expect.unreachable('phải ném lỗi');
    } catch (e) {
      expect(e).toBeInstanceOf(LoiCayPhong);
      expect((e as LoiCayPhong).ma).toBe('CAY_CO_VONG_LAP');
    }
  });

  it('không đụng vào mảng đầu vào', () => {
    const goc = [phong('CHA', null, { tongNhanSu: 1 }), phong('CON', 'CHA', { tongNhanSu: 2 })];
    congDonTheoCay(goc);

    expect(goc[0].tongNhanSu).toBe(1);
  });
});

describe('chuanHoaNhanhCon', () => {
  it('cắt parentId trỏ ra ngoài danh sách thành null', () => {
    const kq = chuanHoaNhanhCon([phong('KT', 'HN'), phong('KT-TO', 'KT')]);

    // Không cắt thì giao diện dựng cây theo parentId sẽ không tìm thấy 'HN'
    // và làm rơi mất CẢ nhánh — bảng trống trong khi dữ liệu vẫn về đủ.
    expect(lay(kq, 'KT').parentId).toBeNull();
    expect(lay(kq, 'KT-TO').parentId).toBe('KT');
  });

  it('giữ nguyên khi mọi cha đều có trong danh sách', () => {
    const kq = chuanHoaNhanhCon([phong('HN', null), phong('KT', 'HN')]);

    expect(lay(kq, 'KT').parentId).toBe('HN');
  });
});
