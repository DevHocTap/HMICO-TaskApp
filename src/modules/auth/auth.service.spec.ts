import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { Role, type User } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const MAT_KHAU = 'Hmico@2026';

function taoUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'admin@hmico.vn',
    fullName: 'Quản trị hệ thống',
    role: Role.ADMIN,
    departmentId: 'hmico',
    isActive: true,
    mustChangePassword: true,
    ...overrides,
  } as User;
}

describe('AuthService', () => {
  let service: AuthService;
  let hashMatKhau: string;

  const user = { findUnique: vi.fn(), update: vi.fn() };
  const issuePair = vi.fn();
  const revokeAllForUser = vi.fn();

  beforeEach(async () => {
    // Băm một lần cho cả file: argon2 cố ý chậm, băm lại mỗi test rất tốn
    hashMatKhau ??= await argon2.hash(MAT_KHAU);

    user.findUnique.mockReset();
    user.update.mockReset();
    issuePair.mockReset().mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
    });
    revokeAllForUser.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: { user } },
        { provide: TokenService, useValue: { issuePair, revokeAllForUser, rotate: vi.fn(), revoke: vi.fn() } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('login', () => {
    it('đăng nhập đúng thì cấp token và trả hồ sơ', async () => {
      user.findUnique.mockResolvedValue(taoUser({ passwordHash: hashMatKhau }));

      const result = await service.login({ email: 'admin@hmico.vn', password: MAT_KHAU });

      expect(result.accessToken).toBe('access');
      expect(result.user.mustChangePassword).toBe(true);
      // Không được lộ hash mật khẩu ra ngoài
      expect(JSON.stringify(result)).not.toContain('$argon2');
    });

    it('chuẩn hoá email về chữ thường và cắt khoảng trắng', async () => {
      user.findUnique.mockResolvedValue(taoUser({ passwordHash: hashMatKhau }));

      await service.login({ email: '  ADMIN@HMICO.VN  ', password: MAT_KHAU });

      expect(user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@hmico.vn' },
      });
    });

    it('sai mật khẩu thì từ chối, không cấp token', async () => {
      user.findUnique.mockResolvedValue(taoUser({ passwordHash: hashMatKhau }));

      await expect(
        service.login({ email: 'admin@hmico.vn', password: 'sai' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(issuePair).not.toHaveBeenCalled();
    });

    it('email không tồn tại và sai mật khẩu trả CÙNG một thông báo', async () => {
      user.findUnique.mockResolvedValue(null);
      const loiKhongCoEmail = await service
        .login({ email: 'ai-do@hmico.vn', password: MAT_KHAU })
        .catch((e: Error) => e.message);

      user.findUnique.mockResolvedValue(taoUser({ passwordHash: hashMatKhau }));
      const loiSaiMatKhau = await service
        .login({ email: 'admin@hmico.vn', password: 'sai' })
        .catch((e: Error) => e.message);

      // Khác nhau là kẻ tấn công dò được email nào có thật
      expect(loiKhongCoEmail).toBe(loiSaiMatKhau);
    });

    it('tài khoản bị vô hiệu hoá thì không đăng nhập được', async () => {
      user.findUnique.mockResolvedValue(
        taoUser({ passwordHash: hashMatKhau, isActive: false }),
      );

      await expect(
        service.login({ email: 'admin@hmico.vn', password: MAT_KHAU }),
      ).rejects.toThrow('Tài khoản đã bị vô hiệu hoá');
      expect(issuePair).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    beforeEach(() => {
      user.findUnique.mockResolvedValue(taoUser({ passwordHash: hashMatKhau }));
    });

    it('đổi xong thì tắt mustChangePassword và thu hồi mọi phiên', async () => {
      await service.changePassword('u1', {
        currentPassword: MAT_KHAU,
        newPassword: 'MatKhauMoi@2026',
      });

      const data = user.update.mock.calls[0][0].data;
      expect(data.mustChangePassword).toBe(false);
      expect(data.passwordChangedAt).toBeInstanceOf(Date);
      expect(revokeAllForUser).toHaveBeenCalledWith('u1');
    });

    it('mật khẩu mới được băm bằng argon2, không lưu dạng thường', async () => {
      await service.changePassword('u1', {
        currentPassword: MAT_KHAU,
        newPassword: 'MatKhauMoi@2026',
      });

      const { passwordHash } = user.update.mock.calls[0][0].data;
      expect(passwordHash).toMatch(/^\$argon2id\$/);
      expect(passwordHash).not.toContain('MatKhauMoi@2026');
      await expect(argon2.verify(passwordHash, 'MatKhauMoi@2026')).resolves.toBe(true);
    });

    it('sai mật khẩu hiện tại thì không đổi gì', async () => {
      await expect(
        service.changePassword('u1', {
          currentPassword: 'sai',
          newPassword: 'MatKhauMoi@2026',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(user.update).not.toHaveBeenCalled();
      expect(revokeAllForUser).not.toHaveBeenCalled();
    });

    it('không cho đặt lại đúng mật khẩu cũ', async () => {
      await expect(
        service.changePassword('u1', {
          currentPassword: MAT_KHAU,
          newPassword: MAT_KHAU,
        }),
      ).rejects.toThrow('Mật khẩu mới phải khác mật khẩu hiện tại');
      expect(user.update).not.toHaveBeenCalled();
    });
  });
});
