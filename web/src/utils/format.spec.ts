import { describe, expect, it } from 'vitest';
import { diemTomTat, phanTram } from './format';

describe('diemTomTat', () => {
  it('một chữ số thập phân, dấu phẩy', () => {
    expect(diemTomTat('88.20')).toBe('88,2');
    expect(diemTomTat('100.00')).toBe('100,0');
    expect(diemTomTat('89.65')).toBe('89,7');
  });
  it('null thành gạch ngang, không phải 0', () => {
    expect(diemTomTat(null)).toBe('—');
    expect(diemTomTat(undefined)).toBe('—');
  });
});

describe('phanTram', () => {
  it('làm tròn về số nguyên', () => {
    expect(phanTram(118, 164)).toBe(72);
    expect(phanTram(1, 3)).toBe(33);
  });
  it('mẫu số 0 → 0, không NaN', () => {
    expect(phanTram(0, 0)).toBe(0);
    expect(phanTram(5, 0)).toBe(0);
  });
});
