import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('AuditService', () => {
  let service: AuditService;
  const create = vi.fn();

  beforeEach(async () => {
    create.mockReset().mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: { auditLog: { create } } },
      ],
    }).compile();
    service = module.get(AuditService);
  });

  const entry = {
    actorId: 'u1',
    entityType: 'User',
    entityId: 'u2',
    action: 'UPDATE',
  };

  it('ghi đủ các trường', async () => {
    await service.log({ ...entry, ipAddress: '10.0.0.1' });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'u1',
        entityType: 'User',
        entityId: 'u2',
        action: 'UPDATE',
        ipAddress: '10.0.0.1',
      }),
    });
  });

  describe('che trường nhạy cảm', () => {
    it('KHÔNG ghi passwordHash vào nhật ký', async () => {
      await service.log({
        ...entry,
        before: { id: 'u2', fullName: 'Nguyễn Văn A', passwordHash: '$argon2id$abc' },
      });

      const { before } = create.mock.calls[0][0].data;
      expect(before.passwordHash).toBe('[đã che]');
      expect(JSON.stringify(before)).not.toContain('argon2');
      // Trường bình thường vẫn giữ nguyên
      expect(before.fullName).toBe('Nguyễn Văn A');
    });

    it.each(['passwordHash', 'refreshToken', 'tokenHash', 'apiSecret', 'newPassword'])(
      'che khoá %s',
      async (khoa) => {
        await service.log({ ...entry, after: { [khoa]: 'gia-tri-that' } });
        const { after } = create.mock.calls[0][0].data;
        expect(after[khoa]).toBe('[đã che]');
      },
    );

    it('che cả ở before lẫn after', async () => {
      await service.log({
        ...entry,
        before: { passwordHash: 'cu' },
        after: { passwordHash: 'moi' },
      });
      const { before, after } = create.mock.calls[0][0].data;
      expect(before.passwordHash).toBe('[đã che]');
      expect(after.passwordHash).toBe('[đã che]');
    });
  });

  describe('khi ghi log thất bại', () => {
    it('KHÔNG ném lỗi ra ngoài — thao tác nghiệp vụ vẫn thành công', async () => {
      create.mockRejectedValue(new Error('database sập'));

      await expect(service.log(entry)).resolves.toBeUndefined();
    });

    it('NHƯNG trong transaction thì ném lỗi để rollback cả cụm', async () => {
      const txCreate = vi.fn().mockRejectedValue(new Error('database sập'));

      await expect(
        service.log(entry, { auditLog: { create: txCreate } } as never),
      ).rejects.toThrow('database sập');
    });
  });

  it('dùng client của transaction khi được truyền vào', async () => {
    const txCreate = vi.fn().mockResolvedValue({});

    await service.log(entry, { auditLog: { create: txCreate } } as never);

    expect(txCreate).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });
});
