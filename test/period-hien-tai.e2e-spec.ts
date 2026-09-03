import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AppModule } from '../src/app.module.js';
import { tinhTinhTrangHanNop } from '../src/modules/period/period-calendar.js';
import type { AuthenticatedUser } from '../src/common/types/authenticated-user.js';
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

/**
 * Test ở `period-calendar.spec.ts` tự dựng `new Date(Date.UTC(...))` làm hạn.
 * Ca này đọc `submitDeadline` THẬT do Prisma trả về từ cột `@db.Date`, để
 * bắt được sai khác giữa "Date mình tự tạo" và "Date Prisma dựng lại từ DB"
 * — nếu driver đổi cách dựng ngày, chỗ này đỏ trước.
 */
describe('tinhTinhTrangHanNop với submitDeadline đọc thẳng từ database', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('kỳ 2026-09 có hạn nộp 02/10/2026 trong DB', async () => {
    const ky = await prisma.period.findUnique({
      where: { code: '2026-09' },
      select: { submitDeadline: true },
    });
    expect(ky?.submitDeadline?.toISOString().slice(0, 10)).toBe('2026-10-02');
  });

  it('hôm nay 02/10 giờ VN → còn 1 ngày, CHƯA quá hạn', async () => {
    const ky = await prisma.period.findUnique({
      where: { code: '2026-09' },
      select: { submitDeadline: true },
    });
    expect(
      tinhTinhTrangHanNop(ky!.submitDeadline, new Date('2026-10-02T02:00:00Z')),
    ).toEqual({ daysUntilDeadline: 1, isOverdue: false });
  });

  it('hôm nay 03/10 giờ VN → quá hạn', async () => {
    const ky = await prisma.period.findUnique({
      where: { code: '2026-09' },
      select: { submitDeadline: true },
    });
    expect(
      tinhTinhTrangHanNop(ky!.submitDeadline, new Date('2026-10-03T02:00:00Z')),
    ).toEqual({ daysUntilDeadline: 0, isOverdue: true });
  });
});

/**
 * Không có kỳ tháng nào chứa hôm nay là chuyện CÓ THỂ XẢY RA THẬT: tác vụ
 * tự sinh chết, hoặc ai đó xoá kỳ. Trang chủ khi đó phải trống chứ không
 * được vỡ — người dùng nhìn thấy màn hình lỗi thì tưởng hệ thống hỏng hẳn.
 */
describe('pendingMyAction khi không có kỳ tháng nào chứa hôm nay', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let queries: ScorecardQueryService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    queries = app.get(ScorecardQueryService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app.close();
  });

  const nguoiDung = async (email: string): Promise<AuthenticatedUser> => {
    const u = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true, email: true, role: true, departmentId: true },
    });
    return u;
  };

  it('2030 — không kỳ nào chứa hôm nay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-05-15T02:00:00Z'));
    const ky = await prisma.period.findFirst({
      where: {
        type: 'MONTH',
        startDate: { lte: new Date(Date.UTC(2030, 4, 15)) },
        endDate: { gte: new Date(Date.UTC(2030, 4, 15)) },
      },
    });
    expect(ky).toBeNull();
  });

  it('không ném lỗi với cả bốn vai trò, luôn trả mảng', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-05-15T02:00:00Z'));
    for (const email of [
      'sd.nhanvien1@hmico.vn',
      'totruong.shopdrawing@hmico.vn',
      'hcns@hmico.vn',
      'giamdoc@hmico.vn',
    ]) {
      const ra = await queries.pendingMyAction(await nguoiDung(email));
      expect(Array.isArray(ra)).toBe(true);
    }
  });

  it('HR không có phiếu nào của riêng mình → mảng RỖNG', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-05-15T02:00:00Z'));
    const hr = await nguoiDung('hcns@hmico.vn');
    expect(hr.role).toBe(Role.HR);
    expect(await queries.pendingMyAction(hr)).toEqual([]);
  });

  /**
   * Ngoại lệ CÓ CHỦ Ý: việc gắn với phiếu cụ thể (chờ ký, chờ xử lý ý kiến)
   * KHÔNG phụ thuộc kỳ hiện tại, nên vẫn phải hiện. Nuốt nó đi thì người
   * dùng mất luôn đường vào phiếu đang chờ chữ ký của chính họ.
   */
  it('nhưng phiếu đang chờ ký của chính mình thì VẪN hiện', async () => {
    // Tự dựng phiếu rồi tự xoá: KHÔNG dựa vào dữ liệu có sẵn trong DB.
    // Test đọc dữ liệu nền của người khác là test sẽ lặng lẽ bỏ qua chính
    // nó vào ngày nền đó biến mất.
    const nv = await nguoiDung('sd.nhanvien1@hmico.vn');
    const ky = await prisma.period.findUniqueOrThrow({ where: { code: '2026-09' } });
    const phieu = await prisma.scorecard.create({
      data: {
        ownerUserId: nv.id,
        periodId: ky.id,
        departmentId: nv.departmentId!,
        departmentName: 'ZTEST phòng',
        jobTitleName: 'ZTEST chức danh',
        assignStatus: 'PROPOSED',
        createdById: nv.id,
      },
      select: { id: true },
    });

    try {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2030-05-15T02:00:00Z'));
      const ra = await queries.pendingMyAction(nv);
      expect(ra.map((v) => v.type)).toContain('CHO_KY_NHAN');
      const viec = ra.find((v) => v.type === 'CHO_KY_NHAN')!;
      // Không có kỳ thì câu chữ không kèm tên kỳ, và vẫn không bịa hạn
      expect(viec.message).not.toMatch(/Tháng/);
      expect(viec.daysUntilDeadline).toBeNull();
      expect(viec.isOverdue).toBe(false);
    } finally {
      vi.useRealTimers();
      await prisma.scorecard.delete({ where: { id: phieu.id } });
    }
  });
});
