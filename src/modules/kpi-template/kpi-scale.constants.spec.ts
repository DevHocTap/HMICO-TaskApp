import { describe, it, expect } from 'vitest';
import { KpiSection } from '@prisma/client';
import { MAX_SCALE, TONG_TRONG_SO, tranDiem } from './kpi-scale.constants.js';

describe('hằng số thang điểm KPI', () => {
  it('thang điểm đúng theo biểu mẫu thật', () => {
    expect(MAX_SCALE[KpiSection.BSC_WORK]).toBe(10);
    expect(MAX_SCALE[KpiSection.COMPLIANCE]).toBe(3);
  });

  it('tổng trọng số hai mục cộng lại đúng 100', () => {
    expect(
      TONG_TRONG_SO[KpiSection.BSC_WORK] + TONG_TRONG_SO[KpiSection.COMPLIANCE],
    ).toBe(100);
  });

  it('chỉ BSC_WORK được vượt thang', () => {
    expect(tranDiem(KpiSection.BSC_WORK)).toBe(12);
    // COMPLIANCE trần đúng bằng thang — không ai "vượt chỉ tiêu" ở khoản
    // chấp hành nội quy
    expect(tranDiem(KpiSection.COMPLIANCE)).toBe(3);
  });
});
