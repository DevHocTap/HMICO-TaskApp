import { describe, it, expect } from 'vitest';
import { chiaDeu, hienSo, sangDonVi, tongTrongSo } from './weight';

describe('cộng trọng số không dùng số thực', () => {
  it('28.4 + 35.8 + 35.8 = 100, dù số thực ra 99.99999999999999', () => {
    expect(28.4 + 35.8 + 35.8).not.toBe(100);
    expect(tongTrongSo([28.4, 35.8, 35.8])).toBe(100);
  });

  it('28.6 + 35.7 + 35.7 = 100, dù số thực ra 100.00000000000001', () => {
    expect(28.6 + 35.7 + 35.7).not.toBe(100);
    expect(tongTrongSo([28.6, 35.7, 35.7])).toBe(100);
  });

  it('cộng được cả chuỗi người dùng gõ', () => {
    expect(tongTrongSo(['20', '15', '15', '5', '5', '5', '5'])).toBe(70);
  });

  it('ô trống tính là 0, không làm hỏng tổng', () => {
    expect(tongTrongSo(['20', '', null, undefined, '50'])).toBe(70);
  });

  it('chấp nhận dấu phẩy thập phân kiểu Việt Nam', () => {
    expect(sangDonVi('12,5')).toBe(1250);
  });

  it('chuỗi không đọc được thì tính 0 thay vì NaN', () => {
    expect(tongTrongSo(['abc', '70'])).toBe(70);
  });
});

describe('chiaDeu', () => {
  it('5 phần của 100 thì mỗi phần 20', () => {
    expect(chiaDeu(100, 5)).toEqual([20, 20, 20, 20, 20]);
  });

  it('3 phần của 100: dồn phần dư vào phần đầu, tổng vẫn đúng 100', () => {
    const p = chiaDeu(100, 3);
    expect(p).toEqual([33.34, 33.33, 33.33]);
    expect(tongTrongSo(p)).toBe(100);
  });

  it('7 phần của 100 vẫn cộng lại đúng 100', () => {
    expect(tongTrongSo(chiaDeu(100, 7))).toBe(100);
  });

  it('6 phần của 70 vẫn cộng lại đúng 70', () => {
    expect(tongTrongSo(chiaDeu(70, 6))).toBe(70);
  });

  it('0 phần thì trả mảng rỗng, không chia cho 0', () => {
    expect(chiaDeu(100, 0)).toEqual([]);
  });
});

describe('hienSo', () => {
  it('bỏ số 0 thừa ở đuôi', () => {
    expect(hienSo(70)).toBe('70');
    expect(hienSo(12.5)).toBe('12.5');
    expect(hienSo(33.34)).toBe('33.34');
  });
});
