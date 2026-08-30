import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OrgService } from './org.service.js';
import { DepartmentScopeService } from './department-scope.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

// Cố ý xếp con trước cha để chắc chắn hàm dựng cây không phụ thuộc thứ tự dòng.
const departmentRows = [
  { id: 'kt-sd', code: 'KT-SD', name: 'Tổ Shop Drawing', parentId: 'kt' },
  { id: 'hmico', code: 'HMICO', name: 'Công ty HMICO', parentId: null },
  { id: 'kt', code: 'KT', name: 'Phòng Kỹ thuật', parentId: 'hn' },
  { id: 'hn', code: 'HN', name: 'Hà Nội (trụ sở)', parentId: 'hmico' },
];

const manager: AuthenticatedUser = {
  id: 'u1',
  email: 'truongphong.rnd@hmico.vn',
  role: Role.MANAGER,
  departmentId: 'rnd',
};

describe('OrgService', () => {
  let service: OrgService;
  const findMany = vi.fn();
  const findUnique = vi.fn();
  const getAccessibleDepartmentIds = vi.fn();

  beforeEach(async () => {
    findMany.mockReset();
    findUnique.mockReset();
    getAccessibleDepartmentIds.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgService,
        {
          provide: PrismaService,
          useValue: { department: { findMany, findUnique } },
        },
        {
          provide: DepartmentScopeService,
          useValue: { getAccessibleDepartmentIds },
        },
      ],
    }).compile();

    service = module.get<OrgService>(OrgService);
  });

  describe('getDepartmentTree', () => {
    it('dựng cây bốn tầng đúng, không phụ thuộc thứ tự dòng trả về', async () => {
      findMany.mockResolvedValue(departmentRows);

      const tree = await service.getDepartmentTree();

      expect(tree).toHaveLength(1);
      expect(tree[0].code).toBe('HMICO');
      expect(tree[0].children[0].code).toBe('HN');
      expect(tree[0].children[0].children[0].code).toBe('KT');
      expect(tree[0].children[0].children[0].children[0].code).toBe('KT-SD');
    });

    it('chỉ lấy phòng ban đang hoạt động', async () => {
      findMany.mockResolvedValue([]);
      await service.getDepartmentTree();
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('trả về mảng rỗng khi chưa có phòng ban nào', async () => {
      findMany.mockResolvedValue([]);
      expect(await service.getDepartmentTree()).toEqual([]);
    });
  });

  describe('getDepartmentById', () => {
    it('trong phạm vi thì trả về phòng ban', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(['rnd']);
      findUnique.mockResolvedValue({ id: 'rnd', code: 'RND' });

      await expect(service.getDepartmentById('rnd', manager)).resolves.toEqual({
        id: 'rnd',
        code: 'RND',
      });
    });

    it('ngoài phạm vi thì 403', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(['rnd']);

      await expect(service.getDepartmentById('kt', manager)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('ngoài phạm vi thì KHÔNG truy vấn database', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(['rnd']);

      await service.getDepartmentById('kt', manager).catch(() => undefined);

      // Kiểm quyền phải chặn trước khi chạm database, nếu không thời gian
      // phản hồi khác nhau sẽ tiết lộ phòng nào có thật.
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('STAFF (phạm vi rỗng) không xem được phòng nào', async () => {
      getAccessibleDepartmentIds.mockResolvedValue([]);

      await expect(
        service.getDepartmentById('rnd', { ...manager, role: Role.STAFF }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('trong phạm vi nhưng không tồn tại thì 404', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(['rnd']);
      findUnique.mockResolvedValue(null);

      await expect(service.getDepartmentById('rnd', manager)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
