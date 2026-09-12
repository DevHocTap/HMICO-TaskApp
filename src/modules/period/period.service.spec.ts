import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService } from '../settings/settings.service.js';
import { settingsGia } from '../settings/settings.mock.js';
import { Test, TestingModule } from '@nestjs/testing';
import { PeriodService } from './period.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/** 10/12/2026 — mốc vắt sang năm mới, ca khó nhất. */
const THANG_12 = new Date('2026-12-10T03:00:00Z');
/** 15/09/2026 — mốc giữa năm bình thường. */
const THANG_9 = new Date('2026-09-15T03:00:00Z');

describe('PeriodService.ensurePeriodsExist', () => {
  let service: PeriodService;

  const period = { findUnique: vi.fn(), create: vi.fn() };
  const log = vi.fn();

  /** Giả lập database: giữ các kỳ đã tạo trong một Map theo code. */
  function gaLapDatabase(daCoSan: string[] = []) {
    const kho = new Map<string, { id: string; code: string }>(
      daCoSan.map((c) => [c, { id: `id-${c}`, code: c }]),
    );
    period.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(kho.get(where.code) ?? null),
    );
    period.create.mockImplementation(({ data }) => {
      const ban = { id: `id-${data.code}`, ...data };
      kho.set(data.code, ban);
      return Promise.resolve(ban);
    });
    return kho;
  }

  beforeEach(async () => {
    period.findUnique.mockReset();
    period.create.mockReset();
    log.mockReset().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PeriodService,
        { provide: PrismaService, useValue: { period } },
        { provide: AuditService, useValue: { log } },
        { provide: SettingsService, useValue: settingsGia() },
      ],
    }).compile();
    service = module.get(PeriodService);
  });

  describe('database rỗng', () => {
    it('tạo đủ năm kỳ cho mốc giữa năm', async () => {
      gaLapDatabase();
      const kq = await service.ensurePeriodsExist(THANG_9);

      expect(kq.daTao.sort()).toEqual(['2026', '2026-09', '2026-10', '2026-Q3', '2026-Q4']);
      expect(kq.daCoSan).toEqual([]);
    });

    it('nối parentId đúng khi vắt sang năm mới', async () => {
      const kho = gaLapDatabase();
      await service.ensurePeriodsExist(THANG_12);

      const theoCode = new Map(
        period.create.mock.calls.map(([{ data }]) => [data.code, data]),
      );
      // 2027-01 -> 2027-Q1 -> 2027, không lạc sang cây 2026
      expect(theoCode.get('2027-01')!.parentId).toBe(kho.get('2027-Q1')!.id);
      expect(theoCode.get('2027-Q1')!.parentId).toBe(kho.get('2027')!.id);
      expect(theoCode.get('2027')!.parentId).toBeNull();
      expect(theoCode.get('2026-12')!.parentId).toBe(kho.get('2026-Q4')!.id);
    });

    it('kỳ tự sinh có createdById = null (hệ thống, không phải người)', async () => {
      gaLapDatabase();
      await service.ensurePeriodsExist(THANG_9);

      for (const [{ data }] of period.create.mock.calls) {
        expect(data.createdById).toBeNull();
      }
    });

    it('chỉ kỳ tháng có hạn nộp, kỳ quý và năm để null', async () => {
      gaLapDatabase();
      await service.ensurePeriodsExist(THANG_9);

      for (const [{ data }] of period.create.mock.calls) {
        if (data.type === 'MONTH') expect(data.submitDeadline).toBeInstanceOf(Date);
        else expect(data.submitDeadline).toBeNull();
      }
    });
  });

  describe('AuditLog AUTO_CREATE — chỉ ghi khi THẬT SỰ tạo mới', () => {
    it('database rỗng: mỗi kỳ tạo ra đúng một bản ghi', async () => {
      gaLapDatabase();
      const kq = await service.ensurePeriodsExist(THANG_9);

      expect(log).toHaveBeenCalledTimes(kq.daTao.length);
      for (const [entry] of log.mock.calls) {
        expect(entry.action).toBe('AUTO_CREATE');
        expect(entry.entityType).toBe('Period');
        expect(entry.actorId).toBeNull();
      }
    });

    it('kỳ đã có sẵn: KHÔNG ghi log, KHÔNG gọi create', async () => {
      gaLapDatabase(['2026', '2026-Q3', '2026-Q4', '2026-09', '2026-10']);

      const kq = await service.ensurePeriodsExist(THANG_9);

      expect(kq.daTao).toEqual([]);
      expect(kq.daCoSan).toHaveLength(5);
      expect(period.create).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });

    it('chạy lần hai ngay sau lần đầu: không tạo thêm, không ghi thêm', async () => {
      gaLapDatabase();

      const lanDau = await service.ensurePeriodsExist(THANG_9);
      const soLogLanDau = log.mock.calls.length;

      const lanHai = await service.ensurePeriodsExist(THANG_9);

      expect(lanDau.daTao).toHaveLength(5);
      expect(lanHai.daTao).toEqual([]);
      // Số lần ghi log KHÔNG tăng thêm ở lần chạy thứ hai
      expect(log.mock.calls.length).toBe(soLogLanDau);
    });

    it('chỉ thiếu một kỳ: chỉ tạo và chỉ ghi log cho đúng kỳ đó', async () => {
      gaLapDatabase(['2026', '2026-Q3', '2026-Q4', '2026-09']);

      const kq = await service.ensurePeriodsExist(THANG_9);

      expect(kq.daTao).toEqual(['2026-10']);
      expect(period.create).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0].after).toMatchObject({ code: '2026-10' });
    });
  });

  it('KHÔNG bù ngược quá khứ dù database rỗng hoàn toàn', async () => {
    gaLapDatabase();
    const kq = await service.ensurePeriodsExist(THANG_9);

    for (const cu of ['2026-01', '2026-05', '2026-08']) {
      expect(kq.daTao).not.toContain(cu);
    }
  });
});
