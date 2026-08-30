import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DepartmentScopeService } from './department-scope.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

@Injectable()
export class OrgService {
  constructor(
    private prisma: PrismaService,
    private departmentScope: DepartmentScopeService,
  ) {}

  async getDepartmentTree() {
    const all = await this.prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, parentId: true },
    });

    // Dựng cây từ danh sách phẳng
    const map = new Map<string, any>();
    all.forEach((d) => map.set(d.id, { ...d, children: [] }));

    const roots: any[] = [];
    all.forEach((d) => {
      const node = map.get(d.id);
      if (d.parentId) {
        map.get(d.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  }

  /**
   * Chi tiết một phòng ban, có kiểm tra phạm vi dữ liệu.
   *
   * Kiểm quyền TRƯỚC khi kiểm tồn tại: nếu báo 404 cho phòng ngoài phạm vi
   * và 403 cho phòng có thật ngoài phạm vi thì người ngoài dò được phòng
   * nào tồn tại. Ngoài phạm vi thì luôn 403, bất kể có thật hay không.
   */
  async getDepartmentById(id: string, user: AuthenticatedUser) {
    const accessibleIds =
      await this.departmentScope.getAccessibleDepartmentIds(user);

    if (!accessibleIds.includes(id)) {
      throw new ForbiddenException('Bạn không có quyền xem phòng ban này');
    }

    const department = await this.prisma.department.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        parentId: true,
        isActive: true,
      },
    });

    if (!department) {
      throw new NotFoundException('Không tìm thấy phòng ban');
    }

    return department;
  }
}
