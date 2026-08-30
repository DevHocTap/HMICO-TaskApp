import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Department, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DepartmentScopeService } from './department-scope.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type {
  CreateDepartmentDto,
  DepartmentResponse,
  DepartmentTreeNode,
  UpdateDepartmentDto,
} from './dto/department.dto.js';

/** Bản ghi phòng ban kèm những gì cần để dựng response. */
type DepartmentWithExtras = Department & {
  manager: { fullName: string } | null;
  _count: { users: number };
};

const INCLUDE_EXTRAS = {
  manager: { select: { fullName: true } },
  // Chỉ đếm nhân viên đang hoạt động — số này hiện trên giao diện quản trị
  _count: { select: { users: { where: { isActive: true } } } },
} as const;

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentScope: DepartmentScopeService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ đọc

  /**
   * Cây phòng ban, ĐÃ LỌC theo phạm vi dữ liệu của người gọi.
   *
   * MANAGER phòng Kỹ thuật nhận về cây gốc là phòng Kỹ thuật kèm hai tổ
   * con — không thấy phòng cha lẫn phòng ngang cấp. Phòng nào có cha nằm
   * ngoài phạm vi thì tự nó thành gốc.
   *
   * STAFF nhận mảng rỗng: getAccessibleDepartmentIds trả rỗng cho họ.
   * Sai theo hướng an toàn.
   */
  async getDepartmentTree(user: AuthenticatedUser): Promise<DepartmentTreeNode[]> {
    const accessibleIds = new Set(
      await this.departmentScope.getAccessibleDepartmentIds(user),
    );
    if (accessibleIds.size === 0) return [];

    const all = await this.prisma.department.findMany({
      where: { isActive: true },
      include: INCLUDE_EXTRAS,
      orderBy: { code: 'asc' },
    });

    const visible = all.filter((d) => accessibleIds.has(d.id));

    const map = new Map<string, DepartmentTreeNode>();
    visible.forEach((d) => map.set(d.id, { ...this.toResponse(d), children: [] }));

    const roots: DepartmentTreeNode[] = [];
    visible.forEach((d) => {
      const node = map.get(d.id)!;
      const parent = d.parentId ? map.get(d.parentId) : undefined;
      // Cha nằm ngoài phạm vi (hoặc không có cha) thì node này là gốc
      if (parent) parent.children.push(node);
      else roots.push(node);
    });

    return roots;
  }

  /**
   * Chi tiết một phòng ban, có kiểm tra phạm vi.
   *
   * Kiểm quyền TRƯỚC khi kiểm tồn tại: nếu báo 404 cho phòng không có và
   * 403 cho phòng có thật ngoài phạm vi thì người ngoài dò được phòng nào
   * tồn tại. Ngoài phạm vi thì luôn 403.
   */
  async getDepartmentById(
    id: string,
    user: AuthenticatedUser,
  ): Promise<DepartmentResponse> {
    await this.assertInScope(id, user);
    return this.toResponse(await this.mustFind(id));
  }

  // ------------------------------------------------------------------ ghi

  async create(
    dto: CreateDepartmentDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<DepartmentResponse> {
    await this.assertCodeAvailable(dto.code);

    if (dto.parentId) await this.mustFind(dto.parentId);
    if (dto.managerId) await this.assertManagerBelongsTo(dto.managerId, null);

    const created = await this.prisma.department.create({
      data: {
        code: dto.code,
        name: dto.name,
        parentId: dto.parentId ?? null,
        managerId: dto.managerId ?? null,
      },
      include: INCLUDE_EXTRAS,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'Department',
      entityId: created.id,
      action: 'CREATE',
      after: this.toAuditSnapshot(created),
      ipAddress,
    });

    return this.toResponse(created);
  }

  async update(
    id: string,
    dto: UpdateDepartmentDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<DepartmentResponse> {
    const before = await this.mustFind(id);

    if (dto.code && dto.code !== before.code) {
      await this.assertCodeAvailable(dto.code);
    }
    if (dto.parentId !== undefined && dto.parentId !== before.parentId) {
      await this.assertNoCycle(id, dto.parentId);
    }
    if (dto.managerId !== undefined && dto.managerId !== null) {
      await this.assertManagerBelongsTo(dto.managerId, id);
    }
    if (dto.isActive === false && before.isActive) {
      await this.assertCanDeactivate(id);
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        parentId: dto.parentId,
        managerId: dto.managerId,
        isActive: dto.isActive,
      },
      include: INCLUDE_EXTRAS,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'Department',
      entityId: id,
      action: 'UPDATE',
      before: this.toAuditSnapshot(before),
      after: this.toAuditSnapshot(updated),
      ipAddress,
    });

    return this.toResponse(updated);
  }

  /**
   * Vô hiệu hoá, KHÔNG xoá cứng.
   *
   * Dữ liệu KPI sau này tham chiếu tới phòng ban; xoá cứng sẽ làm hỏng
   * phiếu của các kỳ đã qua.
   */
  async deactivate(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<DepartmentResponse> {
    const before = await this.mustFind(id);
    if (!before.isActive) {
      throw new BadRequestException('Phòng ban này đã ngừng hoạt động');
    }
    await this.assertCanDeactivate(id);

    const updated = await this.prisma.department.update({
      where: { id },
      data: { isActive: false },
      include: INCLUDE_EXTRAS,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'Department',
      entityId: id,
      action: 'DEACTIVATE',
      before: this.toAuditSnapshot(before),
      after: this.toAuditSnapshot(updated),
      ipAddress,
    });

    return this.toResponse(updated);
  }

  // ------------------------------------------------------------- ràng buộc

  private async mustFind(id: string): Promise<DepartmentWithExtras> {
    const found = await this.prisma.department.findUnique({
      where: { id },
      include: INCLUDE_EXTRAS,
    });
    if (!found) throw new NotFoundException('Không tìm thấy phòng ban');
    return found;
  }

  private async assertInScope(id: string, user: AuthenticatedUser): Promise<void> {
    const accessibleIds = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (!accessibleIds.includes(id)) {
      throw new ForbiddenException('Bạn không có quyền xem phòng ban này');
    }
  }

  private async assertCodeAvailable(code: string): Promise<void> {
    const trung = await this.prisma.department.findUnique({ where: { code } });
    if (trung) {
      throw new ConflictException(`Mã phòng ban "${code}" đã được dùng`);
    }
  }

  /**
   * Chặn vòng lặp trong cây.
   *
   * Đặt phòng cha là chính nó, hoặc là một phòng con cháu của nó, sẽ tạo ra
   * một nhánh trỏ vòng — mọi hàm duyệt cây sau đó đều treo vô hạn.
   */
  private async assertNoCycle(id: string, parentId: string | null): Promise<void> {
    if (!parentId) return;
    if (parentId === id) {
      throw new BadRequestException('Không thể đặt chính phòng này làm phòng cha');
    }

    await this.mustFind(parentId);

    const conChau = await this.departmentScope.getSubtreeIds(id);
    if (conChau.includes(parentId)) {
      throw new BadRequestException(
        'Không thể chuyển phòng ban vào bên trong chính nhánh con của nó',
      );
    }
  }

  /** Trưởng bộ phận phải là người thuộc chính phòng đó. */
  private async assertManagerBelongsTo(
    managerId: string,
    departmentId: string | null,
  ): Promise<void> {
    const manager = await this.prisma.user.findUnique({
      where: { id: managerId },
      select: { departmentId: true, isActive: true },
    });
    if (!manager) {
      throw new BadRequestException('Không tìm thấy người được chọn làm trưởng bộ phận');
    }
    if (!manager.isActive) {
      throw new BadRequestException(
        'Không thể chọn người đã ngừng hoạt động làm trưởng bộ phận',
      );
    }
    // departmentId = null nghĩa là phòng chưa tồn tại (lúc tạo mới); khi đó
    // chưa thể kiểm quan hệ, trưởng phòng sẽ được gán ở bước sửa sau.
    if (departmentId !== null && manager.departmentId !== departmentId) {
      throw new BadRequestException(
        'Trưởng bộ phận phải là người thuộc chính phòng ban đó',
      );
    }
  }

  private async assertCanDeactivate(id: string): Promise<void> {
    const soNhanVien = await this.prisma.user.count({
      where: { departmentId: id, isActive: true },
    });
    if (soNhanVien > 0) {
      throw new BadRequestException(
        `Phòng ban còn ${soNhanVien} nhân viên đang hoạt động. ` +
          'Chuyển họ sang phòng khác trước khi vô hiệu hoá.',
      );
    }

    const soPhongCon = await this.prisma.department.count({
      where: { parentId: id, isActive: true },
    });
    if (soPhongCon > 0) {
      throw new BadRequestException(
        `Phòng ban còn ${soPhongCon} phòng con đang hoạt động. ` +
          'Vô hiệu hoá các phòng con trước.',
      );
    }
  }

  // --------------------------------------------------------------- ánh xạ

  private toResponse(d: DepartmentWithExtras): DepartmentResponse {
    return {
      id: d.id,
      code: d.code,
      name: d.name,
      parentId: d.parentId,
      managerId: d.managerId,
      managerName: d.manager?.fullName ?? null,
      isActive: d.isActive,
      userCount: d._count.users,
    };
  }

  /** Bản ghi gọn để lưu vào nhật ký, bỏ phần đếm và quan hệ. */
  private toAuditSnapshot(d: DepartmentWithExtras): Prisma.InputJsonValue {
    return {
      code: d.code,
      name: d.name,
      parentId: d.parentId,
      managerId: d.managerId,
      isActive: d.isActive,
    };
  }
}
