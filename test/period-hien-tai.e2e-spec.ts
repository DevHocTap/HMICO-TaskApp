import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ScorecardQueryService } from '../src/modules/scorecard/scorecard-query.service.js';

/**
 * `kyHienTai()` là hàm nội bộ của service. Khai kiểu hẹp thay vì ép `any`
 * để test vẫn bắt được lỗi nếu chữ ký hàm đổi.
 */
interface CoKyHienTai {
  kyHienTai(): Promise<{ id: string; name: string; submitDeadline: Date | null } | null>;
}

/**
 * Bẫy chính của hàm này: tác vụ tự sinh LUÔN tạo sẵn tháng kế tiếp, nên kỳ
 * có `startDate` muộn nhất là tháng SAU. Bản cũ dùng `orderBy startDate desc`
 * và trả về đúng kỳ sai đó — mọi nhãn trên trang chủ lệch một tháng.
 */
describe('kyHienTai — kỳ THÁNG chứa hôm nay', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queries: CoKyHienTai;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    queries = app.get(ScorecardQueryService) as unknown as CoKyHienTai;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app.close();
  });

  const gaHomNay = (mocUtc: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(mocUtc));
  };

  it('DB có sẵn cả 2026-09 và 2026-10', async () => {
    const ma = (
      await prisma.period.findMany({
        where: { code: { in: ['2026-09', '2026-10'] } },
        select: { code: true },
      })
    ).map((p) => p.code);
    expect(ma.sort()).toEqual(['2026-09', '2026-10']);
  });

  it('03/09 giờ VN → trả 2026-09, KHÔNG phải kỳ mới nhất 2026-10', async () => {
    gaHomNay('2026-09-03T02:00:00Z');
    const ky = await queries.kyHienTai();
    expect(ky?.name).toBe('Tháng 09/2026');
  });

  it('30/09 23:00 giờ VN vẫn là 2026-09 (biên cuối tháng theo giờ VN)', async () => {
    gaHomNay('2026-09-30T16:00:00Z');
    expect((await queries.kyHienTai())?.name).toBe('Tháng 09/2026');
  });

  it('01/10 00:30 giờ VN đã sang 2026-10', async () => {
    gaHomNay('2026-09-30T17:30:00Z');
    expect((await queries.kyHienTai())?.name).toBe('Tháng 10/2026');
  });

  it('ngày không thuộc kỳ nào → null, không lấy đại kỳ khác', async () => {
    gaHomNay('2030-05-15T02:00:00Z');
    expect(await queries.kyHienTai()).toBeNull();
  });
});
