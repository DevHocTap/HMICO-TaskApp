import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { DepartmentScopeService } from './department-scope.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

// HMICO -> HN -> KT -> {KT-SD, KT-BT}, và HN -> RND
const departments = [
  { id: 'hmico', parentId: null },
  { id: 'hn', parentId: 'hmico' },
  { id: 'kt', parentId: 'hn' },
  { id: 'kt-sd', parentId: 'kt' },
  { id: 'kt-bt', parentId: 'kt' },
  { id: 'rnd', parentId: 'hn' },
];

function nguoiDung(role: Role, departmentId: string | null): AuthenticatedUser {
  return { id: 'u1', email: 'a@hmico.vn', role, departmentId };
}

describe('DepartmentScopeService', () => {
  let service: DepartmentScopeService;
  const findMany = vi.fn();

  beforeEach(async () => {
    findMany.mockReset();
    findMany.mockResolvedValue(departments);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentScopeService,
        { provide: PrismaService, useValue: { department: { findMany } } },
      ],
    }).compile();

    service = module.get(DepartmentScopeService);
  });

  it.each([Role.ADMIN, Role.EXECUTIVE, Role.HR])(
    '%s xem được toàn công ty',
    async (role) => {
      const ids = await service.getAccessibleDepartmentIds(nguoiDung(role, 'kt'));
      expect(ids.sort()).toEqual(departments.map((d) => d.id).sort());
    },
  );

  it('MANAGER phòng Kỹ thuật xem được phòng mình và hai tổ con', async () => {
    const ids = await service.getAccessibleDepartmentIds(nguoiDung(Role.MANAGER, 'kt'));
    expect(ids.sort()).toEqual(['kt', 'kt-bt', 'kt-sd']);
  });

  it('MANAGER KHÔNG xem được phòng ngang cấp lẫn phòng cha', async () => {
    const ids = await service.getAccessibleDepartmentIds(nguoiDung(Role.MANAGER, 'kt'));
    expect(ids).not.toContain('rnd');
    expect(ids).not.toContain('hn');
    expect(ids).not.toContain('hmico');
  });

  it('MANAGER tổ Shop Drawing chỉ xem được tổ mình', async () => {
    const ids = await service.getAccessibleDepartmentIds(nguoiDung(Role.MANAGER, 'kt-sd'));
    expect(ids).toEqual(['kt-sd']);
  });

  it('STAFF nhận mảng rỗng — lọc theo userId ở nơi gọi', async () => {
    const ids = await service.getAccessibleDepartmentIds(nguoiDung(Role.STAFF, 'kt-sd'));
    expect(ids).toEqual([]);
  });

  it('MANAGER chưa được gán phòng thì không xem được gì', async () => {
    const ids = await service.getAccessibleDepartmentIds(nguoiDung(Role.MANAGER, null));
    expect(ids).toEqual([]);
  });

  it('dữ liệu có chu trình thì không treo vòng lặp', async () => {
    findMany.mockResolvedValue([
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ]);
    const ids = await service.getAccessibleDepartmentIds(nguoiDung(Role.MANAGER, 'a'));
    expect(ids.sort()).toEqual(['a', 'b']);
  });
});
