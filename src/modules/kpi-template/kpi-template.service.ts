import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  Role,
  TemplateStatus,
  type KpiTemplate,
  type KpiTemplateItem,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DepartmentScopeService } from '../org/department-scope.service.js';
import { MAX_SCALE } from './kpi-scale.constants.js';
import { kiemTraMau, type ItemDeKiem, type LoiKiemTra } from './template-validation.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type {
  CreateTemplateDto,
  DuplicateTemplateDto,
  ListTemplatesQuery,
  TemplateDetailResponse,
  TemplateItemInput,
  TemplateItemResponse,
  TemplateResponse,
  UpdateTemplateDto,
} from './dto/kpi-template.dto.js';

type TemplateWithExtras = KpiTemplate & {
  jobTitle: { name: string; departmentId: string | null } | null;
  _count: { items: number };
};

const INCLUDE_EXTRAS = {
  jobTitle: { select: { name: true, departmentId: true } },
  // Chỉ đếm tiêu chí cấp 1 — đó là con số người dùng quan tâm
  _count: { select: { items: { where: { parentId: null } } } },
} as const;

@Injectable()
export class KpiTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentScope: DepartmentScopeService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ đọc

  /**
   * Danh sách mẫu trong phạm vi người gọi.
   *
   * Mẫu hệ thống (`jobTitleId = null`) và mẫu của chức danh dùng chung
   * (`jobTitle.departmentId = null`) hiện với mọi người — chúng không gắn
   * phòng nào nên không tiết lộ cơ cấu tổ chức. Nhất quán với `/job-titles`.
   */
  async list(
    query: ListTemplatesQuery,
    user: AuthenticatedUser,
  ): Promise<TemplateResponse[]> {
    const rows = await this.prisma.kpiTemplate.findMany({
      where: {
        isActive: true,
        jobTitleId: query.jobTitleId,
        status: query.status,
      },
      include: INCLUDE_EXTRAS,
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
    });

    const trongPhamVi = await this.locTheoPhamVi(rows, user);
    return trongPhamVi.map((r) => this.toResponse(r));
  }

  async getById(id: string, user: AuthenticatedUser): Promise<TemplateDetailResponse> {
    const template = await this.mustFind(id);
    await this.assertCoTheXem(template, user);

    const items = await this.prisma.kpiTemplateItem.findMany({
      where: { templateId: id },
      orderBy: [{ section: 'asc' }, { displayOrder: 'asc' }],
    });

    return { ...this.toResponse(template), items: this.dungCay(items) };
  }

  // ------------------------------------------------------------------ ghi

  async create(
    dto: CreateTemplateDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TemplateResponse> {
    await this.assertCodeAvailable(dto.code);
    if (dto.jobTitleId) await this.assertJobTitleExists(dto.jobTitleId);

    const created = await this.prisma.kpiTemplate.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        jobTitleId: dto.jobTitleId ?? null,
        status: TemplateStatus.DRAFT,
        createdById: actor.id,
      },
      include: INCLUDE_EXTRAS,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'KpiTemplate',
      entityId: created.id,
      action: 'CREATE',
      after: this.toAuditSnapshot(created),
      ipAddress,
    });

    return this.toResponse(created);
  }

  /**
   * Sao chép mẫu, kể cả toàn bộ cây item.
   *
   * Bản sao luôn ở trạng thái DRAFT và version 1: nó là mẫu mới, chưa ai
   * kiểm tra nội dung sau khi sửa. Không giữ liên hệ nào với mẫu gốc —
   * sửa bản sao không được đụng tới mẫu đang dùng.
   */
  async duplicate(
    id: string,
    dto: DuplicateTemplateDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TemplateResponse> {
    const goc = await this.mustFind(id);
    await this.assertCodeAvailable(dto.code);
    if (dto.jobTitleId) await this.assertJobTitleExists(dto.jobTitleId);

    const items = await this.prisma.kpiTemplateItem.findMany({
      where: { templateId: id },
      orderBy: [{ displayOrder: 'asc' }],
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const moi = await tx.kpiTemplate.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: goc.description,
          jobTitleId: dto.jobTitleId ?? goc.jobTitleId,
          // Bản sao KHÔNG bao giờ là mẫu hệ thống, dù gốc là
          isSystem: false,
          status: TemplateStatus.DRAFT,
          version: 1,
          createdById: actor.id,
        },
        include: INCLUDE_EXTRAS,
      });

      // Tạo cha trước, rồi con — cần id cha mới để nối
      const anhXaId = new Map<string, string>();
      for (const it of items.filter((i) => !i.parentId)) {
        const c = await tx.kpiTemplateItem.create({
          data: this.duLieuItemSaoChep(it, moi.id, null),
        });
        anhXaId.set(it.id, c.id);
      }
      for (const it of items.filter((i) => i.parentId)) {
        await tx.kpiTemplateItem.create({
          data: this.duLieuItemSaoChep(it, moi.id, anhXaId.get(it.parentId!) ?? null),
        });
      }

      await this.audit.log(
        {
          actorId: actor.id,
          entityType: 'KpiTemplate',
          entityId: moi.id,
          action: 'DUPLICATE',
          before: { sourceTemplateId: goc.id, sourceCode: goc.code },
          after: this.toAuditSnapshot(moi),
          ipAddress,
        },
        tx,
      );

      return moi;
    });

    return this.toResponse(created);
  }

  async update(
    id: string,
    dto: UpdateTemplateDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TemplateResponse> {
    const before = await this.mustFind(id);
    this.assertKhongPhaiMauHeThong(before);

    if (dto.code && dto.code !== before.code) await this.assertCodeAvailable(dto.code);
    if (dto.jobTitleId) await this.assertJobTitleExists(dto.jobTitleId);

    const updated = await this.prisma.kpiTemplate.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        jobTitleId: dto.jobTitleId,
      },
      include: INCLUDE_EXTRAS,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'KpiTemplate',
      entityId: id,
      action: 'UPDATE',
      before: this.toAuditSnapshot(before),
      after: this.toAuditSnapshot(updated),
      ipAddress,
    });

    return this.toResponse(updated);
  }

  /**
   * Lưu TOÀN BỘ cây item trong một lần, một transaction.
   *
   * Không làm CRUD từng dòng: người dùng sửa nhiều dòng rồi bấm Lưu một
   * lần, và lưu từng dòng sẽ để lại mẫu ở trạng thái nửa vời nếu đứt giữa
   * chừng — mẫu nửa vời nghĩa là trọng số không còn cộng đúng.
   *
   * KHÔNG kiểm trọng số ở đây: lưu nháp phải cho phép lệch, người dùng
   * đang gõ dở. Kiểm dồn vào lúc publish.
   */
  async saveItems(
    id: string,
    items: TemplateItemInput[],
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TemplateDetailResponse> {
    const template = await this.mustFind(id);
    if (template.isSystem && actor.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Mẫu hệ thống chỉ quản trị viên mới sửa được, qua endpoint riêng.',
      );
    }

    this.assertKhoaHopLe(items);

    await this.prisma.$transaction(async (tx) => {
      // Xoá sạch rồi tạo lại: cây thường vài chục dòng, đối chiếu từng dòng
      // để biết thêm/sửa/xoá phức tạp hơn nhiều mà không nhanh hơn đáng kể.
      await tx.kpiTemplateItem.deleteMany({ where: { templateId: id } });

      const anhXaId = new Map<string, string>();
      for (const it of items.filter((i) => !i.parentKey)) {
        const c = await tx.kpiTemplateItem.create({
          data: this.duLieuItemMoi(it, id, null),
        });
        anhXaId.set(it.key, c.id);
      }
      for (const it of items.filter((i) => i.parentKey)) {
        const parentId = anhXaId.get(it.parentKey!);
        if (!parentId) {
          throw new BadRequestException(
            `Dòng "${it.name}" trỏ tới một tiêu chí cha không tồn tại trong mẫu.`,
          );
        }
        await tx.kpiTemplateItem.create({
          data: this.duLieuItemMoi(it, id, parentId),
        });
      }

      // Sửa nội dung mẫu đã xuất bản thì đưa về nháp: PUBLISHED phải luôn
      // có nghĩa "nội dung này đã qua kiểm tra trọng số".
      if (template.status === TemplateStatus.PUBLISHED) {
        await tx.kpiTemplate.update({
          where: { id },
          data: { status: TemplateStatus.DRAFT },
        });
      }

      await this.audit.log(
        {
          actorId: actor.id,
          entityType: 'KpiTemplate',
          entityId: id,
          action: 'SAVE_ITEMS',
          before: { itemCount: template._count.items, status: template.status },
          after: { itemCount: items.length, status: TemplateStatus.DRAFT },
          ipAddress,
        },
        tx,
      );
    });

    return this.getById(id, actor);
  }

  /**
   * Xuất bản: DRAFT -> PUBLISHED, tăng version.
   *
   * Đây là chỗ DUY NHẤT kiểm trọng số. Chỉ mẫu đã qua hết kiểm tra mới
   * được dùng để giao KPI cho người thật.
   */
  async publish(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TemplateResponse> {
    const template = await this.mustFind(id);
    if (template.isSystem && actor.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Mẫu hệ thống chỉ quản trị viên mới xuất bản được.',
      );
    }

    const items = await this.prisma.kpiTemplateItem.findMany({
      where: { templateId: id },
    });

    const loi = kiemTraMau(this.sangItemDeKiem(items), template.isSystem);
    if (loi.length > 0) {
      throw new BadRequestException({
        message: 'Mẫu chưa xuất bản được vì còn lỗi trọng số hoặc cấu trúc.',
        errors: loi,
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.kpiTemplate.update({
        where: { id },
        data: { status: TemplateStatus.PUBLISHED, version: { increment: 1 } },
        include: INCLUDE_EXTRAS,
      });

      await this.audit.log(
        {
          actorId: actor.id,
          entityType: 'KpiTemplate',
          entityId: id,
          action: 'PUBLISH',
          before: { status: template.status, version: template.version },
          after: { status: u.status, version: u.version, itemCount: items.length },
          ipAddress,
        },
        tx,
      );

      return u;
    });

    return this.toResponse(updated);
  }

  async deactivate(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<TemplateResponse> {
    const before = await this.mustFind(id);
    this.assertKhongPhaiMauHeThong(before);

    if (!before.isActive) {
      throw new BadRequestException('Mẫu này đã ngừng sử dụng');
    }

    const updated = await this.prisma.kpiTemplate.update({
      where: { id },
      data: { isActive: false },
      include: INCLUDE_EXTRAS,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'KpiTemplate',
      entityId: id,
      action: 'DEACTIVATE',
      before: this.toAuditSnapshot(before),
      after: this.toAuditSnapshot(updated),
      ipAddress,
    });

    return this.toResponse(updated);
  }

  /** Kiểm thử trước, không lưu gì — giao diện gọi để hiện lỗi ngay khi gõ. */
  async validateItems(
    id: string,
    items: TemplateItemInput[],
    user: AuthenticatedUser,
  ): Promise<LoiKiemTra[]> {
    const template = await this.mustFind(id);
    await this.assertCoTheXem(template, user);

    return kiemTraMau(
      items.map((i) => ({
        key: i.key,
        parentKey: i.parentKey ?? null,
        name: i.name,
        section: i.section,
        weight: new Prisma.Decimal(i.weight),
        scoringMode: i.scoringMode,
      })),
      template.isSystem,
    );
  }

  // ------------------------------------------------------------- ràng buộc

  private async mustFind(id: string): Promise<TemplateWithExtras> {
    const found = await this.prisma.kpiTemplate.findUnique({
      where: { id },
      include: INCLUDE_EXTRAS,
    });
    if (!found) throw new NotFoundException('Không tìm thấy mẫu KPI');
    return found;
  }

  private assertKhongPhaiMauHeThong(t: KpiTemplate): void {
    if (t.isSystem) {
      throw new ForbiddenException(
        'Mẫu hệ thống không sửa được qua endpoint thường. ' +
          'Mục "Chấp hành nội quy" áp dụng chung cho mọi chức danh.',
      );
    }
  }

  /**
   * Lọc danh sách theo phạm vi phòng ban.
   *
   * Mẫu không gắn chức danh, hoặc gắn chức danh dùng chung, thì ai cũng xem
   * được. Còn lại phải thuộc phòng trong phạm vi.
   */
  private async locTheoPhamVi(
    rows: TemplateWithExtras[],
    user: AuthenticatedUser,
  ): Promise<TemplateWithExtras[]> {
    if (user.role === Role.ADMIN || user.role === Role.HR || user.role === Role.EXECUTIVE) {
      return rows;
    }
    const accessibleIds = await this.departmentScope.getAccessibleDepartmentIds(user);
    return rows.filter((r) => {
      const deptId = r.jobTitle?.departmentId;
      return !r.jobTitleId || !deptId || accessibleIds.includes(deptId);
    });
  }

  private async assertCoTheXem(
    t: TemplateWithExtras,
    user: AuthenticatedUser,
  ): Promise<void> {
    const trong = await this.locTheoPhamVi([t], user);
    if (trong.length === 0) {
      throw new ForbiddenException('Bạn không có quyền xem mẫu KPI này');
    }
  }

  private async assertCodeAvailable(code: string): Promise<void> {
    const trung = await this.prisma.kpiTemplate.findUnique({ where: { code } });
    if (trung) throw new ConflictException(`Mã mẫu "${code}" đã được dùng`);
  }

  private async assertJobTitleExists(jobTitleId: string): Promise<void> {
    const found = await this.prisma.jobTitle.findUnique({
      where: { id: jobTitleId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Không tìm thấy chức danh');
  }

  /**
   * Kiểm cấu trúc cây TRƯỚC KHI lưu.
   *
   * Khác kiểm trọng số (dồn vào lúc publish, vì nháp cho phép lệch), cấu
   * trúc phải đúng ngay lúc lưu — cây ba cấp hoặc cha không tồn tại thì
   * không có cách nào ghi xuống database cho đúng.
   */
  private assertKhoaHopLe(items: TemplateItemInput[]): void {
    const daThay = new Set<string>();
    for (const i of items) {
      if (daThay.has(i.key)) {
        throw new BadRequestException(`Có hai dòng cùng khoá "${i.key}" trong mẫu.`);
      }
      daThay.add(i.key);
    }

    const theoKey = new Map(items.map((i) => [i.key, i]));
    for (const i of items) {
      if (!i.parentKey) continue;
      const cha = theoKey.get(i.parentKey);
      if (!cha) {
        throw new BadRequestException(
          `Dòng "${i.name}" trỏ tới một tiêu chí cha không tồn tại trong mẫu.`,
        );
      }
      if (cha.parentKey) {
        throw new BadRequestException(
          `Mẫu KPI chỉ có hai cấp. Dòng "${i.name}" đang nằm dưới "${cha.name}", ` +
            `mà "${cha.name}" đã là KPI con của một tiêu chí khác.`,
        );
      }
    }
  }

  // --------------------------------------------------------------- ánh xạ

  private duLieuItemMoi(
    it: TemplateItemInput,
    templateId: string,
    parentId: string | null,
  ): Prisma.KpiTemplateItemUncheckedCreateInput {
    return {
      templateId,
      parentId,
      name: it.name,
      description: it.description ?? null,
      section: it.section,
      measurementText: it.measurementText ?? null,
      measureMethod: it.measureMethod ?? null,
      weight: new Prisma.Decimal(it.weight),
      scoringMode: it.scoringMode,
      displayOrder: it.displayOrder,
    };
  }

  private duLieuItemSaoChep(
    it: KpiTemplateItem,
    templateId: string,
    parentId: string | null,
  ): Prisma.KpiTemplateItemUncheckedCreateInput {
    return {
      templateId,
      parentId,
      name: it.name,
      description: it.description,
      section: it.section,
      measurementText: it.measurementText,
      measureMethod: it.measureMethod,
      targetValue: it.targetValue,
      minValue: it.minValue,
      direction: it.direction,
      scoringMode: it.scoringMode,
      weight: it.weight,
      displayOrder: it.displayOrder,
    };
  }

  private sangItemDeKiem(items: KpiTemplateItem[]): ItemDeKiem[] {
    return items.map((i) => ({
      key: i.id,
      parentKey: i.parentId,
      name: i.name,
      section: i.section,
      weight: i.weight,
      scoringMode: i.scoringMode,
    }));
  }

  private dungCay(items: KpiTemplateItem[]): TemplateItemResponse[] {
    const map = new Map<string, TemplateItemResponse>();
    items.forEach((i) => map.set(i.id, { ...this.toItemResponse(i), children: [] }));

    const goc: TemplateItemResponse[] = [];
    items.forEach((i) => {
      const node = map.get(i.id)!;
      const cha = i.parentId ? map.get(i.parentId) : undefined;
      if (cha) cha.children.push(node);
      else goc.push(node);
    });
    return goc;
  }

  private toItemResponse(i: KpiTemplateItem): Omit<TemplateItemResponse, 'children'> {
    return {
      id: i.id,
      parentId: i.parentId,
      name: i.name,
      description: i.description,
      section: i.section,
      measurementText: i.measurementText,
      measureMethod: i.measureMethod,
      // Chuỗi, không phải number: Decimal qua JSON dạng số sẽ mất độ chính xác
      weight: i.weight.toString(),
      scoringMode: i.scoringMode,
      displayOrder: i.displayOrder,
      maxScale: MAX_SCALE[i.section],
    };
  }

  private toResponse(t: TemplateWithExtras): TemplateResponse {
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      jobTitleId: t.jobTitleId,
      jobTitleName: t.jobTitle?.name ?? null,
      isSystem: t.isSystem,
      status: t.status,
      version: t.version,
      isActive: t.isActive,
      criteriaCount: t._count.items,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  private toAuditSnapshot(t: TemplateWithExtras): Prisma.InputJsonValue {
    return {
      code: t.code,
      name: t.name,
      jobTitleId: t.jobTitleId,
      isSystem: t.isSystem,
      status: t.status,
      version: t.version,
      isActive: t.isActive,
    };
  }
}
