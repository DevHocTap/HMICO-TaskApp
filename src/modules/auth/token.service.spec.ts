import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { Role, type User } from '@prisma/client';
import { TokenService } from './token.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const user = {
  id: 'u1',
  email: 'admin@hmico.vn',
  role: Role.ADMIN,
  departmentId: 'hmico',
  isActive: true,
} as User;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe('TokenService', () => {
  let service: TokenService;

  const refreshToken = {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
  };
  const signAsync = vi.fn();

  beforeEach(async () => {
    Object.values(refreshToken).forEach((fn) => fn.mockReset());
    signAsync.mockReset().mockResolvedValue('access-token-gia-lap');
    refreshToken.create.mockImplementation(({ data }) => ({ id: 'rt-moi', ...data }));

    const prisma = {
      refreshToken,
      // $transaction nhận callback: chạy luôn với chính đối tượng prisma giả lập
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { signAsync } },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === 'JWT_REFRESH_TTL_DAYS' ? 7 : '15m') },
        },
      ],
    }).compile();

    service = module.get(TokenService);
  });

  describe('issuePair', () => {
    it('lưu SHA-256 chứ không lưu token thô', async () => {
      const { refreshToken: raw } = await service.issuePair(user);

      const saved = refreshToken.create.mock.calls[0][0].data;
      expect(saved.tokenHash).toBe(sha256(raw));
      expect(saved.tokenHash).not.toBe(raw);
      expect(saved.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('mỗi lần cấp ra một token khác nhau', async () => {
      const a = await service.issuePair(user);
      const b = await service.issuePair(user);
      expect(a.refreshToken).not.toBe(b.refreshToken);
    });

    it('hạn refresh token đúng 7 ngày', async () => {
      await service.issuePair(user);
      const { expiresAt } = refreshToken.create.mock.calls[0][0].data;
      const soNgay = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(soNgay).toBeCloseTo(7, 1);
    });
  });

  describe('rotate', () => {
    const conHieuLuc = {
      id: 'rt-cu',
      userId: 'u1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
    };

    it('cấp token mới và thu hồi token cũ trong cùng một giao dịch', async () => {
      refreshToken.findUnique.mockResolvedValue(conHieuLuc);

      const result = await service.rotate('token-cu');

      expect(result.refreshToken).not.toBe('token-cu');
      expect(refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-cu' },
        data: { revokedAt: expect.any(Date), replacedById: 'rt-moi' },
      });
    });

    it('tra cứu bằng hash, không bằng token thô', async () => {
      refreshToken.findUnique.mockResolvedValue(conHieuLuc);
      await service.rotate('token-cu');
      expect(refreshToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: sha256('token-cu') } }),
      );
    });

    it('từ chối token không tồn tại', async () => {
      refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.rotate('bia-dat')).rejects.toThrow(UnauthorizedException);
    });

    it('từ chối token đã thu hồi', async () => {
      refreshToken.findUnique.mockResolvedValue({
        ...conHieuLuc,
        revokedAt: new Date(),
      });
      await expect(service.rotate('token-cu')).rejects.toThrow(UnauthorizedException);
    });

    it('từ chối token đã hết hạn', async () => {
      refreshToken.findUnique.mockResolvedValue({
        ...conHieuLuc,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.rotate('token-cu')).rejects.toThrow(UnauthorizedException);
    });

    it('từ chối khi tài khoản đã bị vô hiệu hoá', async () => {
      refreshToken.findUnique.mockResolvedValue({
        ...conHieuLuc,
        user: { ...user, isActive: false },
      });
      await expect(service.rotate('token-cu')).rejects.toThrow(UnauthorizedException);
    });
  });

  it('revokeAllForUser chỉ đụng token chưa thu hồi của đúng người đó', async () => {
    await service.revokeAllForUser('u1');
    expect(refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
