import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JobTitle, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DepartmentScopeService } from './department-scope.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type {
  CreateJobTitleDto,
  JobTitleResponse,
  ListJobTitlesQuery,
  UpdateJobTitleDto,
} from './dto/job-title.dto.js';

type JobTitleWithExtras = JobTitle & {
  department: { name: string } | null;
  _count: { users: number };
};

const INCLUDE_EXTRAS = {
  department: { select: { name: true } },
  _count: { select: { users: { where: { isActive: true } } } },
} as const;

@Injectable()
export class JobTitlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentScope: DepartmentScopeService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Danh sách chức danh trong phạm vi người gọi.
   *
   * Chức danh dùng chung toàn công ty (departmentId = null) hiện với mọi
   * người — nó không gắn với phòng nào nên không tiết lộ cơ cấu tổ chức.
   */
  async list(
    query: ListJobTitlesQuery,
    user: AuthenticatedUser,
  ): Promise<JobTitleResponse[]> {
    const accessibleIds = await this.departmentScope.getAccessibleDepartmentIds(user);

    const where: Prisma.JobTitleWhereInput = query.departmentId
      ? { departmentId: accessibleIds.includes(query.departmentId) ? query.departmentId : '__ngoai_pham_vi__' }
      : { OR: [{ departmentId: null }, { departmentId: { in: accessibleIds } }] };

    const rows = await this.prisma.jobTitle.findMany({
      where,
      include: INCLUDE_EXTRAS,
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async create(
    dto: CreateJobTitleDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<JobTitleResponse> {
    await this.assertCodeAvailable(dto.code);
    if (dto.departmentId) await this.assertDepartmentExists(dto.departmentId);

    const created = await this.prisma.jobTitle.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        departmentId: dto.departmentId ?? null,
      },
      include: INCLUDE_EXTRAS,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'JobTitle',
      entityId: created.id,
      action: 'CREATE',
      after: this.toAuditSnapshot(created),
      ipAddress,
    });

    return this.toResponse(created);
  }

  async update(
    id: string,
    dto: UpdateJobTitleDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<JobTitleResponse> {
    const before = await this.mustFind(id);

    if (dto.code && dto.code !== before.code) await this.assertCodeAvailable(dto.code);
    if (dto.departmentId) await this.assertDepartmentExists(dto.departmentId);
    if (dto.isActive === false && before.isActive) await this.assertCanDeactivate(id);

    const updated = await this.prisma.jobTitle.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        departmentId: dto.departmentId,
        isActive: dto.isActive,
      },
      include: INCLUDE_EXTRAS,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'JobTitle',
      entityId: id,
      action: 'UPDATE',
      before: this.toAuditSnapshot(before),
      after: this.toAuditSnapshot(updated),
      ipAddress,
    });

    return this.toResponse(updated);
  }

  async deactivate(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<JobTitleResponse> {
    const before = await this.mustFind(id);
    if (!before.isActive) {
      throw new BadRequestException('Chức danh này đã ngừng sử dụng');
    }
    await this.assertCanDeactivate(id);

    const updated = await this.prisma.jobTitle.update({
      where: { id },
      data: { isActive: false },
      include: INCLUDE_EXTRAS,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'JobTitle',
      entityId: id,
      action: 'DEACTIVATE',
      before: this.toAuditSnapshot(before),
      after: this.toAuditSnapshot(updated),
      ipAddress,
    });

    return this.toResponse(updated);
  }

  // ------------------------------------------------------------- ràng buộc

  private async mustFind(id: string): Promise<JobTitleWithExtras> {
    const found = await this.prisma.jobTitle.findUnique({
      where: { id },
      include: INCLUDE_EXTRAS,
    });
    if (!found) throw new NotFoundException('Không tìm thấy chức danh');
    return found;
  }

  private async assertCodeAvailable(code: string): Promise<void> {
    const trung = await this.prisma.jobTitle.findUnique({ where: { code } });
    if (trung) throw new ConflictException(`Mã chức danh "${code}" đã được dùng`);
  }

  private async assertDepartmentExists(departmentId: string): Promise<void> {
    const found = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Không tìm thấy phòng ban');
  }

  private async assertCanDeactivate(id: string): Promise<void> {
    const soNguoi = await this.prisma.user.count({
      where: { jobTitleId: id, isActive: true },
    });
    if (soNguoi > 0) {
      throw new BadRequestException(
        `Còn ${soNguoi} người đang giữ chức danh này. ` +
          'Đổi chức danh cho họ trước khi vô hiệu hoá.',
      );
    }
  }

  // --------------------------------------------------------------- ánh xạ

  private toResponse(t: JobTitleWithExtras): JobTitleResponse {
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      departmentId: t.departmentId,
      departmentName: t.department?.name ?? null,
      isActive: t.isActive,
      userCount: t._count.users,
    };
  }

  private toAuditSnapshot(t: JobTitleWithExtras): Prisma.InputJsonValue {
    return {
      code: t.code,
      name: t.name,
      description: t.description,
      departmentId: t.departmentId,
      isActive: t.isActive,
    };
  }
}
