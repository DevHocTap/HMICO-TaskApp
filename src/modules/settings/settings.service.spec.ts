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
  const log = vi.fn();
  const tx = { systemSetting, user };
  const prisma = {
    systemSetting,
    user,
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };
  let service: SettingsService;

  beforeEach(async () => {
    systemSetting.findMany.mockReset().mockResolvedValue([]);
    systemSetting.upsert.mockReset().mockResolvedValue({});
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
        after: lichMoi,
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
});
