import { describe, expect, it } from 'vitest';
import dayjs from 'dayjs';
import { chuVietTat, giaiDoanCuaKy, kyChuaHomNay, kyKeTiep, ngayTrongThang, tenGoi } from './period';
import type { KyDanhGia } from '../types/scorecard';

function ky(code: string, type: KyDanhGia['type'], start: string, end: string): KyDanhGia {
  return {
    id: code,
    code,
    name: code,
    type,
    startDate: start,
    endDate: end,
    assignDeadline: null,
    selfScoreDeadline: null,
    managerScoreDeadline: null,
    submitDeadline: null,
    isLocked: false,
    createdById: null,
    createdByName: null,
    scorecardCount: 0,
  };
}

describe('kyChuaHomNay', () => {
  const danhSach = [
    ky('2026-Q3', 'QUARTER', '2026-07-01', '2026-09-30'),
    ky('2026-09', 'MONTH', '2026-09-01', '2026-09-30'),
    ky('2026-10', 'MONTH', '2026-10-01', '2026-10-31'),
  ];

  it('lấy kỳ THÁNG, bỏ qua kỳ quý cùng chứa ngày đó', () => {
    expect(kyChuaHomNay(danhSach, dayjs('2026-09-11'))?.code).toBe('2026-09');
  });

  it('ngày đầu và cuối tháng đều thuộc kỳ', () => {
    expect(kyChuaHomNay(danhSach, dayjs('2026-10-01'))?.code).toBe('2026-10');
    expect(kyChuaHomNay(danhSach, dayjs('2026-10-31'))?.code).toBe('2026-10');
  });

  it('không có kỳ thì trả undefined', () => {
    expect(kyChuaHomNay(danhSach, dayjs('2026-12-01'))).toBeUndefined();
  });

  it('kyKeTiep: kỳ tháng bắt đầu ngay sau ngày cuối', () => {
    expect(kyKeTiep(danhSach, danhSach[1]!)?.code).toBe('2026-10');
    expect(kyKeTiep(danhSach, danhSach[2]!)).toBeUndefined();
  });
});

describe('ngayTrongThang', () => {
  it('lấy ngày không có số 0 đầu', () => {
    expect(ngayTrongThang('2026-09-05T00:00:00.000Z')).toBe('5');
  });
  it('null thành gạch ngang', () => {
    expect(ngayTrongThang(null)).toBe('—');
  });
});

describe('tenGoi / chuVietTat', () => {
  it('tên gọi là từ cuối', () => {
    expect(tenGoi('Trần Quốc Việt')).toBe('Việt');
    expect(tenGoi('  Quản trị hệ thống ')).toBe('thống');
    expect(tenGoi('Hà')).toBe('Hà');
  });
  it('viết tắt hai chữ đầu tên gọi', () => {
    expect(chuVietTat('Lê Minh Hoàng')).toBe('HO');
    expect(chuVietTat('Phạm Thu Hà')).toBe('HÀ');
  });
});

describe('giaiDoanCuaKy', () => {
  const ky10: KyDanhGia = {
    ...ky('2026-10', 'MONTH', '2026-10-01', '2026-10-31'),
    selfScoreDeadline: '2026-10-25',
    managerScoreDeadline: '2026-10-29',
    submitDeadline: '2026-10-30',
  };

  it('tới hết ngày 25 là giai đoạn 1, còn N ngày tính cả hôm nay', () => {
    expect(giaiDoanCuaKy(ky10, dayjs('2026-10-03'))).toMatchObject({ so: 1, conNgay: 22 });
    expect(giaiDoanCuaKy(ky10, dayjs('2026-10-25'))).toMatchObject({ so: 1, conNgay: 0 });
  });

  it('26–29 là giai đoạn 2, ngày 30 là giai đoạn 3, sau đó là 4', () => {
    expect(giaiDoanCuaKy(ky10, dayjs('2026-10-26')).so).toBe(2);
    expect(giaiDoanCuaKy(ky10, dayjs('2026-10-29')).so).toBe(2);
    expect(giaiDoanCuaKy(ky10, dayjs('2026-10-30')).so).toBe(3);
    expect(giaiDoanCuaKy(ky10, dayjs('2026-11-02'))).toMatchObject({ so: 4, han: null });
  });

  it('kỳ đã khoá sổ thì giai đoạn 4 ghi "Đã chốt sổ"', () => {
    expect(giaiDoanCuaKy({ ...ky10, isLocked: true }, dayjs('2026-11-02')).ten).toBe('Đã chốt sổ');
  });

  it('kỳ tạo tay không có mốc thì coi như đã qua hết', () => {
    expect(giaiDoanCuaKy(ky('2026-03', 'MONTH', '2026-03-01', '2026-03-31'), dayjs('2026-03-10')).so).toBe(4);
  });
});
