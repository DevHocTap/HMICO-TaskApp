import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SettingsService } from './settings.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CAI_DAT_MAC_DINH } from './cai-dat-mac-dinh.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

const ADMIN: AuthenticatedUser = { id: 'u-admin', email: 'admin@hmico.vn', role: Role.ADMIN, departmentId: null };

describe('SettingsService', () => {
  const systemSetting = { findMany: vi.fn(), upsert: vi.fn() };
  const user = { findMany: vi.fn().mockResolvedValue([]) };
  const period = { findMany: vi.fn().mockResolvedValue([]), update: vi.fn().mockResolvedValue({}) };
  const log = vi.fn();
  const tx = { systemSetting, user, period };
  const prisma = {
    systemSetting,
    user,
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };
  let service: SettingsService;

  beforeEach(async () => {
    systemSetting.findMany.mockReset().mockResolvedValue([]);
    systemSetting.upsert.mockReset().mockResolvedValue({});
    period.findMany.mockReset().mockResolvedValue([]);
    period.update.mockReset().mockResolvedValue({});
    log.mockReset();
    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log } },
      ],
    }).compile();
    service = module.get(SettingsService);
    await service.onModuleInit();
  });

  it('bảng rỗng thì dùng mặc định', () => {
    expect(service.lay()).toEqual(CAI_DAT_MAC_DINH);
  });

  it('dòng trong bảng thiếu trường thì lấp bằng mặc định', async () => {
    systemSetting.findMany.mockResolvedValue([
      { key: 'baoMat', value: { soLanSaiToiDa: 5 }, updatedAt: new Date(), updatedById: null },
    ]);
    await service.onModuleInit();
    expect(service.lay().baoMat).toEqual({ ...CAI_DAT_MAC_DINH.baoMat, soLanSaiToiDa: 5 });
    expect(service.lay().lichKy).toEqual(CAI_DAT_MAC_DINH.lichKy);
  });

  it('dữ liệu trong bảng vô lý thì bỏ qua, chạy mặc định', async () => {
    systemSetting.findMany.mockResolvedValue([
      { key: 'nguongXepLoai', value: { canCaiThien: 95, hoanThanh: 80, vuot: 100 }, updatedAt: new Date(), updatedById: null },
    ]);
    await service.onModuleInit();
    expect(service.lay().nguongXepLoai).toEqual(CAI_DAT_MAC_DINH.nguongXepLoai);
  });

  it('cập nhật MỘT nhóm: ghi đúng nhóm đó, audit kèm before/after, cache đổi ngay', async () => {
    const lichMoi = { ngayLenKpiThangSau: 20, ngayTuCham: 22, ngayTruongCham: 26, ngayGuiHcns: 28 };
    systemSetting.findMany.mockResolvedValue([
      { key: 'lichKy', value: lichMoi, updatedAt: new Date(), updatedById: ADMIN.id },
    ]);

    const ra = await service.capNhat({ lichKy: lichMoi }, ADMIN, '::1');

    expect(systemSetting.upsert).toHaveBeenCalledTimes(1);
    expect(systemSetting.upsert.mock.calls[0]![0].where).toEqual({ key: 'lichKy' });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Setting',
        entityId: 'lichKy',
        action: 'UPDATE',
        before: CAI_DAT_MAC_DINH.lichKy,
        after: { ...lichMoi, kyDaApMoc: [] },
        ipAddress: '::1',
      }),
      tx,
    );
    expect(ra.lichKy).toEqual(lichMoi);
    expect(service.lay().lichKy).toEqual(lichMoi);
  });

  it('từ chối khi bản ghép vi phạm quan hệ, không ghi gì', async () => {
    await expect(
      service.capNhat({ lichKy: { ...CAI_DAT_MAC_DINH.lichKy, ngayTuCham: 30 } }, ADMIN),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(systemSetting.upsert).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('body rỗng -> 400', async () => {
    await expect(service.capNhat({}, ADMIN)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('đổi lịch thì áp mốc mới vào kỳ tháng đang mở từ tháng hiện tại, kỳ khoá và quá khứ không đụng', async () => {
    period.findMany.mockResolvedValue([
      { id: 'p10', code: '2026-10', startDate: new Date(Date.UTC(2026, 9, 1)) },
      { id: 'p11', code: '2026-11', startDate: new Date(Date.UTC(2026, 10, 1)) },
    ]);
    const lichMoi = { ngayLenKpiThangSau: 20, ngayTuCham: 22, ngayTruongCham: 26, ngayGuiHcns: 28 };

    await service.capNhat({ lichKy: lichMoi }, ADMIN, null, new Date('2026-10-12T03:00:00Z'));

    // Chỉ hỏi kỳ THÁNG, chưa khoá, bắt đầu từ 01/10
    expect(period.findMany.mock.calls[0]![0].where).toMatchObject({
      type: 'MONTH',
      isLocked: false,
      startDate: { gte: new Date(Date.UTC(2026, 9, 1)) },
    });
    expect(period.update).toHaveBeenCalledTimes(2);
    const kyMuoi = period.update.mock.calls.find((c) => c[0].where.id === 'p10')![0].data;
    expect(kyMuoi.selfScoreDeadline.toISOString().slice(0, 10)).toBe('2026-10-22');
    expect(kyMuoi.managerScoreDeadline.toISOString().slice(0, 10)).toBe('2026-10-26');
    expect(kyMuoi.submitDeadline.toISOString().slice(0, 10)).toBe('2026-10-28');
    // Hạn lên KPI của kỳ 10 nằm ở THÁNG 9 (ngày 20/09)
    expect(kyMuoi.assignDeadline.toISOString().slice(0, 10)).toBe('2026-09-20');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ after: { ...lichMoi, kyDaApMoc: ['2026-10', '2026-11'] } }),
      tx,
    );
  });

  it('đổi nhóm khác (không phải lịch) thì không đụng kỳ', async () => {
    await service.capNhat({ kyDanhGia: { tuSinhHangThang: false } }, ADMIN);
    expect(period.findMany).not.toHaveBeenCalled();
  });
});
