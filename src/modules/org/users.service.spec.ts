import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsService } from '../settings/settings.service.js';
import { settingsGia } from '../settings/settings.mock.js';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { UsersService } from './users.service.js';
import { DepartmentScopeService } from './department-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { TokenService } from '../auth/token.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

function nhanVien(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    employeeCode: 'HM999',
    email: 'a@hmico.vn',
    fullName: 'Nguyễn Văn A',
    passwordHash: '$argon2id$KHONG-DUOC-LO-RA',
    role: Role.STAFF,
    departmentId: 'kt-sd',
    jobTitleId: null,
    level: null,
    managerId: null,
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: null,
    department: { name: 'Tổ Shop Drawing' },
    jobTitle: null,
    manager: null,
    ...extra,
  };
}

const admin: AuthenticatedUser = {
  id: 'admin',
  email: 'admin@hmico.vn',
  role: Role.ADMIN,
  departmentId: 'hmico',
};
const hr: AuthenticatedUser = {
  id: 'hr',
  email: 'hcns@hmico.vn',
  role: Role.HR,
  departmentId: 'hcns',
};

describe('UsersService', () => {
  let service: UsersService;

  const user = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  };
  const departmentFindMany = vi.fn();
  const departmentFindUnique = vi.fn();
  const getAccessibleDepartmentIds = vi.fn();
  const getSubtreeIds = vi.fn();
  const revokeAllForUser = vi.fn();
  const log = vi.fn();

  beforeEach(async () => {
    Object.values(user).forEach((fn) => fn.mockReset());
    [
      departmentFindMany,
      departmentFindUnique,
      getAccessibleDepartmentIds,
      getSubtreeIds,
      revokeAllForUser,
      log,
    ].forEach((fn) => fn.mockReset());
    // Mặc định: người này không làm trưởng bộ phận của phòng nào
    departmentFindMany.mockResolvedValue([]);
    departmentFindUnique.mockResolvedValue({ id: 'phong-khac' });
    user.count.mockResolvedValue(0);
    user.findUnique.mockResolvedValue(null);
    getAccessibleDepartmentIds.mockResolvedValue(['kt-sd']);
    log.mockResolvedValue(undefined);
    revokeAllForUser.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: SettingsService, useValue: settingsGia() },
        {
          provide: PrismaService,
          useValue: {
            user,
            department: {
              findUnique: departmentFindUnique,
              findMany: departmentFindMany,
            },
            jobTitle: { findUnique: vi.fn() },
            // Lịch sử phân công ghi trong $transaction — mock nhận mảng và bỏ qua
            employeeAssignmentHistory: { updateMany: vi.fn(), create: vi.fn() },
            $transaction: vi.fn().mockResolvedValue([]),
          },
        },
        {
          provide: DepartmentScopeService,
          useValue: { getAccessibleDepartmentIds, getSubtreeIds },
        },
        { provide: TokenService, useValue: { revokeAllForUser } },
        { provide: AuditService, useValue: { log } },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('không bao giờ trả passwordHash', () => {
    it('getById', async () => {
      user.findUnique.mockResolvedValue(nhanVien('u1'));

      const kq = await service.getById('u1', admin);

      expect(JSON.stringify(kq)).not.toContain('argon2');
      expect('passwordHash' in kq).toBe(false);
    });

    it('list', async () => {
      user.findMany.mockResolvedValue([nhanVien('u1')]);
      user.count.mockResolvedValue(1);

      const kq = await service.list({}, admin);

      expect(JSON.stringify(kq)).not.toContain('argon2');
    });

    it('create', async () => {
      user.create.mockResolvedValue(nhanVien('moi'));

      const kq = await service.create(
        { employeeCode: 'HM100', email: 'b@hmico.vn', fullName: 'B', role: Role.STAFF },
        admin,
      );

      expect(JSON.stringify(kq)).not.toContain('argon2');
    });
  });

  describe('phân quyền vai trò', () => {
    it('HR không tạo được tài khoản ADMIN', async () => {
      await expect(
        service.create(
          { employeeCode: 'HM100', email: 'b@hmico.vn', fullName: 'B', role: Role.ADMIN },
          hr,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(user.create).not.toHaveBeenCalled();
    });

    it('ADMIN tạo được tài khoản ADMIN', async () => {
      user.create.mockResolvedValue(nhanVien('moi', { role: Role.ADMIN }));

      await expect(
        service.create(
          { employeeCode: 'HM100', email: 'b@hmico.vn', fullName: 'B', role: Role.ADMIN },
          admin,
        ),
      ).resolves.toBeDefined();
    });

    it('không ai tự đổi vai trò của chính mình, kể cả ADMIN', async () => {
      user.findUnique.mockResolvedValue(nhanVien('admin', { role: Role.ADMIN }));

      await expect(
        service.update('admin', { role: Role.STAFF }, admin),
      ).rejects.toThrow(/tự thay đổi vai trò của chính mình/);
    });

    it('HR không đụng được vào tài khoản ADMIN', async () => {
      // Không có quy tắc này thì HR đặt lại mật khẩu ADMIN rồi đăng nhập
      user.findUnique.mockResolvedValue(nhanVien('u1', { role: Role.ADMIN }));

      await expect(service.update('u1', { fullName: 'X' }, hr)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.resetPassword('u1', hr)).rejects.toThrow(ForbiddenException);
      await expect(service.setActive('u1', false, hr)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('resetPassword', () => {
    beforeEach(() => {
      user.findUnique.mockResolvedValue(nhanVien('u1'));
      user.update.mockResolvedValue(nhanVien('u1'));
    });

    it('băm mật khẩu tạm bằng argon2, bắt đổi lần đăng nhập sau', async () => {
      const { temporaryPassword } = await service.resetPassword('u1', admin);

      const data = user.update.mock.calls[0][0].data;
      expect(data.mustChangePassword).toBe(true);
      expect(data.passwordChangedAt).toBeInstanceOf(Date);
      expect(data.passwordHash).toMatch(/^\$argon2id\$/);
      await expect(argon2.verify(data.passwordHash, temporaryPassword)).resolves.toBe(
        true,
      );
    });

    it('thu hồi TOÀN BỘ refresh token', async () => {
      // Thiếu bước này thì tài khoản đang bị chiếm vẫn giữ phiên tới 7 ngày
      await service.resetPassword('u1', admin);
      expect(revokeAllForUser).toHaveBeenCalledWith('u1');
    });

    it('ghi nhật ký nhưng KHÔNG kèm before/after', async () => {
      await service.resetPassword('u1', admin);

      const entry = log.mock.calls[0][0];
      expect(entry.action).toBe('RESET_PASSWORD');
      expect(entry.before).toBeUndefined();
      expect(entry.after).toBeUndefined();
    });

    it('mỗi lần sinh một mật khẩu khác nhau', async () => {
      const a = await service.resetPassword('u1', admin);
      const b = await service.resetPassword('u1', admin);
      expect(a.temporaryPassword).not.toBe(b.temporaryPassword);
    });
  });

  describe('setActive', () => {
    it('vô hiệu hoá thì thu hồi refresh token', async () => {
      user.findUnique.mockResolvedValue(nhanVien('u1'));
      user.update.mockResolvedValue(nhanVien('u1', { isActive: false }));

      await service.setActive('u1', false, admin);

      expect(revokeAllForUser).toHaveBeenCalledWith('u1');
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DEACTIVATE' }),
      );
    });

    it('kích hoạt lại thì KHÔNG thu hồi token', async () => {
      user.findUnique.mockResolvedValue(nhanVien('u1', { isActive: false }));
      user.update.mockResolvedValue(nhanVien('u1'));

      await service.setActive('u1', true, admin);

      expect(revokeAllForUser).not.toHaveBeenCalled();
    });

    it('không cho tự vô hiệu hoá chính mình', async () => {
      user.findUnique.mockResolvedValue(nhanVien('admin', { role: Role.ADMIN }));

      await expect(service.setActive('admin', false, admin)).rejects.toThrow(
        /chính mình/,
      );
    });
  });

  describe('bẫy phòng ban mất trưởng bộ phận', () => {
    beforeEach(() => {
      user.findUnique.mockResolvedValue(nhanVien('u1'));
      user.update.mockResolvedValue(nhanVien('u1'));
    });

    it('chặn vô hiệu hoá người đang là trưởng bộ phận', async () => {
      // Phòng mất trưởng bộ phận thì KPI không ai duyệt, và lỗi chỉ lộ ra
      // cuối tháng khi nhân viên đã nộp kết quả
      departmentFindMany.mockResolvedValue([{ name: 'Tổ Shop Drawing' }]);

      await expect(service.setActive('u1', false, admin)).rejects.toThrow(
        /Tổ Shop Drawing.*chỉ định người thay/s,
      );
      expect(user.update).not.toHaveBeenCalled();
      expect(revokeAllForUser).not.toHaveBeenCalled();
    });

    it('nêu tên TẤT CẢ các phòng người đó đang phụ trách', async () => {
      departmentFindMany.mockResolvedValue([
        { name: 'Phòng Kỹ thuật' },
        { name: 'Tổ Bảo trì bảo hành' },
      ]);

      await expect(service.setActive('u1', false, admin)).rejects.toThrow(
        /Phòng Kỹ thuật, Tổ Bảo trì bảo hành/,
      );
    });

    it('chặn chuyển phòng cho người đang là trưởng bộ phận', async () => {
      departmentFindMany.mockResolvedValue([{ name: 'Tổ Shop Drawing' }]);

      await expect(
        service.update('u1', { departmentId: 'phong-khac' }, admin),
      ).rejects.toThrow(/chuyển phòng cho người đang là trưởng bộ phận/);
    });

    it('người thường thì vô hiệu hoá bình thường', async () => {
      user.update.mockResolvedValue(nhanVien('u1', { isActive: false }));

      await expect(service.setActive('u1', false, admin)).resolves.toBeDefined();
      expect(revokeAllForUser).toHaveBeenCalledWith('u1');
    });

    it('KÍCH HOẠT LẠI thì không bị chặn', async () => {
      user.findUnique.mockResolvedValue(nhanVien('u1', { isActive: false }));
      departmentFindMany.mockResolvedValue([{ name: 'Tổ Shop Drawing' }]);

      await expect(service.setActive('u1', true, admin)).resolves.toBeDefined();
    });
  });

  describe('vòng lặp quan hệ quản lý', () => {
    it('không cho tự làm quản lý của chính mình', async () => {
      user.findUnique.mockResolvedValue(nhanVien('u1'));

      await expect(
        service.update('u1', { managerId: 'u1' }, admin),
      ).rejects.toThrow(BadRequestException);
    });

    it('phát hiện vòng lặp gián tiếp A -> B -> A', async () => {
      // u1 là quản lý của u2; giờ đặt u2 làm quản lý của u1
      user.findUnique.mockImplementation(({ where, select }) => {
        if (select?.managerId) {
          return Promise.resolve({ managerId: where.id === 'u2' ? 'u1' : null });
        }
        return Promise.resolve(nhanVien(where.id as string));
      });

      await expect(
        service.update('u1', { managerId: 'u2' }, admin),
      ).rejects.toThrow(/lặp vòng/);
    });
  });

  describe('phạm vi dữ liệu', () => {
    it('không xem được người ngoài phạm vi', async () => {
      user.findUnique.mockResolvedValue(nhanVien('u1', { departmentId: 'kt' }));
      getAccessibleDepartmentIds.mockResolvedValue(['rnd']);

      await expect(
        service.getById('u1', { ...admin, role: Role.MANAGER }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('luôn xem được chính mình dù phạm vi rỗng', async () => {
      user.findUnique.mockResolvedValue(nhanVien('toi', { departmentId: 'kt' }));
      getAccessibleDepartmentIds.mockResolvedValue([]);

      await expect(
        service.getById('toi', { ...admin, id: 'toi', role: Role.STAFF }),
      ).resolves.toBeDefined();
    });
  });
});
