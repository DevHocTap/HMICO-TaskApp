import { describe, it, expect } from 'vitest';
import { taoKiemTraOrigin } from './cors.js';

const DUOC_PHEP = ['https://kpi.hmico.vn'];

function thu(origin: string | undefined, laDev: boolean): boolean {
  let ketQua = false;
  taoKiemTraOrigin(DUOC_PHEP, laDev)(origin, (_err, allow) => {
    ketQua = allow ?? false;
  });
  return ketQua;
}

describe('taoKiemTraOrigin', () => {
  it('không có Origin thì cho qua (curl, request cùng nguồn)', () => {
    expect(thu(undefined, false)).toBe(true);
  });

  it('địa chỉ trong danh sách luôn được phép', () => {
    expect(thu('https://kpi.hmico.vn', false)).toBe(true);
    expect(thu('https://kpi.hmico.vn', true)).toBe(true);
  });

  describe('môi trường dev', () => {
    it.each([
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
      'http://localhost',
    ])('chấp nhận %s', (origin) => {
      expect(thu(origin, true)).toBe(true);
    });

    it('vẫn chặn trang lạ', () => {
      expect(thu('http://ke-tan-cong.example.com', true)).toBe(false);
    });

    it('chặn tên miền chỉ CHỨA chữ localhost', () => {
      // Không được để regex khớp nhầm kiểu localhost.ke-tan-cong.com
      expect(thu('http://localhost.ke-tan-cong.com', true)).toBe(false);
      expect(thu('http://notlocalhost', true)).toBe(false);
      expect(thu('http://127.0.0.1.ke-tan-cong.com', true)).toBe(false);
    });
  });

  describe('môi trường production', () => {
    it('KHÔNG nới lỏng cho localhost', () => {
      expect(thu('http://localhost:5173', false)).toBe(false);
      expect(thu('http://127.0.0.1:5174', false)).toBe(false);
    });

    it('chặn trang lạ', () => {
      expect(thu('http://ke-tan-cong.example.com', false)).toBe(false);
    });
  });
});
