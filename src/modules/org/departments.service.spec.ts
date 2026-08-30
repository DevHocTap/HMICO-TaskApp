import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { DepartmentsService } from './departments.service.js';
import { DepartmentScopeService } from './department-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

/** Dựng một bản ghi phòng ban như Prisma trả về (kèm manager và _count). */
function phong(
  id: string,
  code: string,
  name: string,
  parentId: string | null,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    code,
    name,
    parentId,
    managerId: null,
    isActive: true,
    manager: null,
    _count: { users: 0 },
    ...extra,
  };
}

// Cố ý xếp con trước cha để chắc chắn hàm dựng cây không phụ thuộc thứ tự.
const CAY = [
  phong('kt-sd', 'KT-SD', 'Tổ Shop Drawing', 'kt'),
  phong('hmico', 'HMICO', 'Công ty HMICO', null),
  phong('kt', 'KT', 'Phòng Kỹ thuật', 'hn'),
  phong('hn', 'HN', 'Hà Nội (trụ sở)', 'hmico'),
];

const admin: AuthenticatedUser = {
  id: 'u0',
  email: 'admin@hmico.vn',
  role: Role.ADMIN,
  departmentId: 'hmico',
};
const manager: AuthenticatedUser = {
  id: 'u1',
  email: 'truongphong.rnd@hmico.vn',
  role: Role.MANAGER,
  departmentId: 'rnd',
};

const TAT_CA = ['hmico', 'hn', 'kt', 'kt-sd'];

describe('DepartmentsService', () => {
  let service: DepartmentsService;

  const department = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  };
  const user = { count: vi.fn(), findUnique: vi.fn() };
  const getAccessibleDepartmentIds = vi.fn();
  const getSubtreeIds = vi.fn();
  const log = vi.fn();

  beforeEach(async () => {
    [
      department.findMany,
      department.findUnique,
      department.create,
      department.update,
      department.count,
      user.count,
      user.findUnique,
      getAccessibleDepartmentIds,
      getSubtreeIds,
      log,
    ].forEach((fn) => fn.mockReset());

    department.count.mockResolvedValue(0);
    user.count.mockResolvedValue(0);
    getSubtreeIds.mockResolvedValue([]);
    log.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        { provide: PrismaService, useValue: { department, user } },
        {
          provide: DepartmentScopeService,
          useValue: { getAccessibleDepartmentIds, getSubtreeIds },
        },
        { provide: AuditService, useValue: { log } },
      ],
    }).compile();

    service = module.get(DepartmentsService);
  });

  describe('getDepartmentTree', () => {
    it('ADMIN: dựng cây bốn tầng đúng, không phụ thuộc thứ tự dòng trả về', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(TAT_CA);
      department.findMany.mockResolvedValue(CAY);

      const tree = await service.getDepartmentTree(admin);

      expect(tree).toHaveLength(1);
      expect(tree[0].code).toBe('HMICO');
      expect(tree[0].children[0].code).toBe('HN');
      expect(tree[0].children[0].children[0].code).toBe('KT');
      expect(tree[0].children[0].children[0].children[0].code).toBe('KT-SD');
    });

    it('MANAGER: cây bắt đầu từ phòng mình, không thấy cha lẫn phòng ngang cấp', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(['kt', 'kt-sd']);
      department.findMany.mockResolvedValue(CAY);

      const tree = await service.getDepartmentTree(manager);

      // KT có cha là HN nằm ngoài phạm vi -> KT tự thành gốc
      expect(tree).toHaveLength(1);
      expect(tree[0].code).toBe('KT');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].code).toBe('KT-SD');
      expect(JSON.stringify(tree)).not.toContain('HMICO');
    });

    it('STAFF (phạm vi rỗng) nhận cây rỗng và KHÔNG truy vấn database', async () => {
      getAccessibleDepartmentIds.mockResolvedValue([]);

      expect(await service.getDepartmentTree({ ...manager, role: Role.STAFF })).toEqual(
        [],
      );
      expect(department.findMany).not.toHaveBeenCalled();
    });

    it('chỉ lấy phòng ban đang hoạt động', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(TAT_CA);
      department.findMany.mockResolvedValue([]);
      await service.getDepartmentTree(admin);
      expect(department.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('trả về số nhân viên của từng phòng', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(['kt']);
      department.findMany.mockResolvedValue([
        phong('kt', 'KT', 'Phòng Kỹ thuật', null, { _count: { users: 7 } }),
      ]);

      const tree = await service.getDepartmentTree(admin);
      expect(tree[0].userCount).toBe(7);
    });
  });

  describe('getDepartmentById', () => {
    it('trong phạm vi thì trả về phòng ban', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(['rnd']);
      department.findUnique.mockResolvedValue(phong('rnd', 'RND', 'Phòng R&D', null));

      await expect(service.getDepartmentById('rnd', manager)).resolves.toMatchObject({
        code: 'RND',
      });
    });

    it('ngoài phạm vi thì 403 và KHÔNG truy vấn database', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(['rnd']);

      await expect(service.getDepartmentById('kt', manager)).rejects.toThrow(
        ForbiddenException,
      );
      // Kiểm quyền phải chặn trước khi chạm database, nếu không thời gian
      // phản hồi khác nhau sẽ tiết lộ phòng nào có thật.
      expect(department.findUnique).not.toHaveBeenCalled();
    });

    it('trong phạm vi nhưng không tồn tại thì 404', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(['rnd']);
      department.findUnique.mockResolvedValue(null);

      await expect(service.getDepartmentById('rnd', manager)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('mã trùng thì 409', async () => {
      department.findUnique.mockResolvedValue(phong('x', 'RND', 'Trùng', null));

      await expect(
        service.create({ code: 'RND', name: 'Mới' }, admin),
      ).rejects.toThrow(ConflictException);
    });

    it('tạo xong ghi nhật ký kèm actorId', async () => {
      department.findUnique.mockResolvedValue(null);
      department.create.mockResolvedValue(phong('moi', 'MOI', 'Phòng mới', null));

      await service.create({ code: 'MOI', name: 'Phòng mới' }, admin, '10.0.0.1');

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'u0',
          entityType: 'Department',
          entityId: 'moi',
          action: 'CREATE',
          ipAddress: '10.0.0.1',
        }),
      );
    });
  });

  describe('ràng buộc cây', () => {
    beforeEach(() => {
      department.findUnique.mockResolvedValue(phong('kt', 'KT', 'Phòng Kỹ thuật', 'hn'));
    });

    it('không cho đặt chính nó làm phòng cha', async () => {
      await expect(
        service.update('kt', { parentId: 'kt' }, admin),
      ).rejects.toThrow(/chính phòng này làm phòng cha/);
    });

    it('không cho chuyển phòng vào nhánh con của nó', async () => {
      getSubtreeIds.mockResolvedValue(['kt', 'kt-sd', 'kt-bt']);

      await expect(
        service.update('kt', { parentId: 'kt-sd' }, admin),
      ).rejects.toThrow(/nhánh con của nó/);
    });

    it('cho chuyển sang nhánh không liên quan', async () => {
      getSubtreeIds.mockResolvedValue(['kt', 'kt-sd']);
      department.update.mockResolvedValue(phong('kt', 'KT', 'Phòng Kỹ thuật', 'hcm'));

      await expect(
        service.update('kt', { parentId: 'hcm' }, admin),
      ).resolves.toMatchObject({ parentId: 'hcm' });
    });
  });

  describe('trưởng bộ phận', () => {
    beforeEach(() => {
      department.findUnique.mockResolvedValue(phong('rnd', 'RND', 'Phòng R&D', 'hn'));
    });

    it('không cho gán người thuộc phòng khác', async () => {
      user.findUnique.mockResolvedValue({ departmentId: 'kt', isActive: true });

      await expect(
        service.update('rnd', { managerId: 'u-kt' }, admin),
      ).rejects.toThrow(/thuộc chính phòng ban đó/);
    });

    it('không cho gán người đã ngừng hoạt động', async () => {
      user.findUnique.mockResolvedValue({ departmentId: 'rnd', isActive: false });

      await expect(
        service.update('rnd', { managerId: 'u-nghi' }, admin),
      ).rejects.toThrow(/ngừng hoạt động/);
    });

    it('cho gán người thuộc đúng phòng đó', async () => {
      user.findUnique.mockResolvedValue({ departmentId: 'rnd', isActive: true });
      department.update.mockResolvedValue(
        phong('rnd', 'RND', 'Phòng R&D', 'hn', { managerId: 'u-rnd' }),
      );

      await expect(
        service.update('rnd', { managerId: 'u-rnd' }, admin),
      ).resolves.toMatchObject({ managerId: 'u-rnd' });
    });
  });

  describe('deactivate', () => {
    beforeEach(() => {
      department.findUnique.mockResolvedValue(phong('kt', 'KT', 'Phòng Kỹ thuật', 'hn'));
    });

    it('chặn khi còn nhân viên đang hoạt động', async () => {
      user.count.mockResolvedValue(3);

      await expect(service.deactivate('kt', admin)).rejects.toThrow(
        /còn 3 nhân viên đang hoạt động/,
      );
    });

    it('chặn khi còn phòng con đang hoạt động', async () => {
      department.count.mockResolvedValue(2);

      await expect(service.deactivate('kt', admin)).rejects.toThrow(
        /còn 2 phòng con đang hoạt động/,
      );
    });

    it('phòng rỗng thì vô hiệu hoá được và ghi nhật ký', async () => {
      department.update.mockResolvedValue(
        phong('kt', 'KT', 'Phòng Kỹ thuật', 'hn', { isActive: false }),
      );

      await service.deactivate('kt', admin);

      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DEACTIVATE', entityId: 'kt' }),
      );
    });

    it('phòng đã vô hiệu hoá rồi thì báo lỗi', async () => {
      department.findUnique.mockResolvedValue(
        phong('kt', 'KT', 'Phòng Kỹ thuật', 'hn', { isActive: false }),
      );

      await expect(service.deactivate('kt', admin)).rejects.toThrow(BadRequestException);
    });
  });
});
