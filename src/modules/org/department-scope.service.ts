import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

/** Vai trò xem được toàn công ty. */
const COMPANY_WIDE_ROLES: readonly Role[] = [Role.ADMIN, Role.EXECUTIVE, Role.HR];

/**
 * Xác định người dùng được xem dữ liệu của những phòng ban nào.
 *
 * Đây là chỗ dễ sinh lỗ hổng nhất của hệ thống, nên chỉ có MỘT hàm duy
 * nhất — mọi nơi cần lọc dữ liệu đều gọi vào đây, không module nào tự kiểm
 * theo cách riêng (docs/quy-tac-nghiep-vu.md mục 7).
 *
 * Phạm vi đi theo cây phòng ban `Department.parentId`, KHÔNG theo
 * `User.managerId`. `managerId` chỉ để hiển thị quan hệ báo cáo.
 */
@Injectable()
export class DepartmentScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Trả về danh sách id phòng ban người dùng được xem.
   *
   * Quy ước quan trọng: STAFF luôn nhận mảng RỖNG. Họ chỉ xem dữ liệu của
   * chính mình, nên nơi gọi phải lọc thêm theo userId. Mảng rỗng dùng với
   * `{ departmentId: { in: [] } }` sẽ không trả về gì — sai theo hướng an
   * toàn, quên lọc thì mất dữ liệu chứ không rò dữ liệu.
   */
  async getAccessibleDepartmentIds(user: AuthenticatedUser): Promise<string[]> {
    if (COMPANY_WIDE_ROLES.includes(user.role)) {
      const all = await this.prisma.department.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      return all.map((d) => d.id);
    }

    if (user.role === Role.MANAGER && user.departmentId) {
      return this.getSubtreeIds(user.departmentId);
    }

    // STAFF, hoặc MANAGER chưa được gán phòng
    return [];
  }

  /**
   * Phòng ban đó cộng toàn bộ phòng con, không giới hạn số tầng.
   *
   * Lấy hết rồi duyệt trong bộ nhớ thay vì WITH RECURSIVE: công ty có
   * khoảng vài chục phòng, một truy vấn phẳng nhanh hơn và dễ kiểm thử hơn.
   * Khi cây lên tới hàng nghìn nút mới cần đổi.
   */
  async getSubtreeIds(rootId: string): Promise<string[]> {
    const all = await this.prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, parentId: true },
    });

    const childrenOf = new Map<string, string[]>();
    for (const dept of all) {
      if (!dept.parentId) continue;
      const siblings = childrenOf.get(dept.parentId) ?? [];
      siblings.push(dept.id);
      childrenOf.set(dept.parentId, siblings);
    }

    const result: string[] = [];
    const queue = [rootId];
    const seen = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      // Cây phòng ban về lý thuyết không có chu trình, nhưng dữ liệu nhập
      // tay có thể tạo ra — không chặn thì vòng lặp chạy mãi.
      if (seen.has(current)) continue;
      seen.add(current);
      result.push(current);
      queue.push(...(childrenOf.get(current) ?? []));
    }

    return result;
  }
}
