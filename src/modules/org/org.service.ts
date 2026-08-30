import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DepartmentScopeService } from './department-scope.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

export interface DepartmentNode {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  children: DepartmentNode[];
}

@Injectable()
export class OrgService {
  constructor(
    private prisma: PrismaService,
    private departmentScope: DepartmentScopeService,
  ) {}

  /**
   * Cây phòng ban, ĐÃ LỌC theo phạm vi dữ liệu của người gọi.
   *
   * MANAGER phòng Kỹ thuật nhận về cây gốc là phòng Kỹ thuật kèm hai tổ
   * con — không thấy phòng cha lẫn phòng ngang cấp. Phòng nào có cha nằm
   * ngoài phạm vi thì tự nó thành gốc.
   *
   * STAFF nhận mảng rỗng: getAccessibleDepartmentIds trả rỗng cho họ
   * (xem DepartmentScopeService). Sai theo hướng an toàn.
   */
  async getDepartmentTree(user: AuthenticatedUser): Promise<DepartmentNode[]> {
    const accessibleIds = new Set(
      await this.departmentScope.getAccessibleDepartmentIds(user),
    );
    if (accessibleIds.size === 0) return [];

    const all = await this.prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, parentId: true },
    });

    const visible = all.filter((d) => accessibleIds.has(d.id));

    const map = new Map<string, DepartmentNode>();
    visible.forEach((d) => map.set(d.id, { ...d, children: [] }));

    const roots: DepartmentNode[] = [];
    visible.forEach((d) => {
      const node = map.get(d.id)!;
      const parent = d.parentId ? map.get(d.parentId) : undefined;
      // Cha nằm ngoài phạm vi (hoặc không có cha) thì node này là gốc
      if (parent) {
        parent.children.push(node);
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
