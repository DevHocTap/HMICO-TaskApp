import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignStatus,
  KpiSection,
  OwnerType,
  Prisma,
  ResultStatus,
  ScorecardAction,
  TemplateStatus,
  type KpiTemplateItem,
  type Period,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DepartmentScopeService } from '../org/department-scope.service.js';
import { MAX_SCALE } from '../kpi-template/kpi-scale.constants.js';
import { ScorecardWorkflowService } from './scorecard-workflow.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type {
  KetQuaHangLoat,
  NguoiBiBoQua,
} from './dto/scorecard.dto.js';

/** Mã mẫu hệ thống chứa Mục 2 "Chấp hành nội quy". */
const MA_MAU_HE_THONG = 'SYS-COMPLIANCE';

/** Người dùng kèm những gì cần để lập phiếu. */
type NguoiDungDeLapPhieu = Prisma.UserGetPayload<{
  include: {
    department: { select: { id: true; name: true; managerId: true } };
    jobTitle: { select: { id: true; name: true } };
  };
}>;

const INCLUDE_LAP_PHIEU = {
  department: { select: { id: true, name: true, managerId: true } },
  jobTitle: { select: { id: true, name: true } },
} as const;

@Injectable()
export class ScorecardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workflow: ScorecardWorkflowService,
    private readonly departmentScope: DepartmentScopeService,
  ) {}

  // ------------------------------------------------------- sinh một phiếu

  async create(
    userId: string,
    periodId: string,
    actor: AuthenticatedUser,
    evaluatorIdChiDinh?: string,
    ipAddress?: string,
  ) {
    const ky = await this.mustFindPeriod(periodId);
    this.assertKyChuaKhoa(ky);

    const nguoi = await this.prisma.user.findUnique({
      where: { id: userId },
      include: INCLUDE_LAP_PHIEU,
    });
    if (!nguoi) throw new NotFoundException('Không tìm thấy nhân viên');
    if (nguoi.departmentId) {
      await this.assertPhongTrongPhamVi(nguoi.departmentId, actor);
    }

    const canTro = this.kiemDieuKienLapPhieu(nguoi, evaluatorIdChiDinh);
    if (canTro) throw new BadRequestException(canTro);

    const daCo = await this.prisma.scorecard.findFirst({
      where: { ownerUserId: userId, periodId },
      select: { id: true },
    });
    if (daCo) {
      throw new ConflictException(
        `${nguoi.fullName} đã có phiếu KPI trong kỳ ${ky.name}.`,
      );
    }

    const id = await this.taoMotPhieu(nguoi, ky, actor, evaluatorIdChiDinh, ipAddress);
    return { id };
  }

  // ------------------------------------------------------- sinh hàng loạt

  /**
   * Sinh phiếu cho cả phòng.
   *
   * MỖI PHIẾU MỘT TRANSACTION, không gộp cả lô: với 200 người, một người
   * thiếu chức danh không được làm hỏng 199 phiếu còn lại. Người bị bỏ qua
   * trả về kèm LÝ DO CỤ THỂ — trưởng phòng cần biết ai, không phải một
   * thông báo lỗi chung.
   */
  async createBatch(
    departmentId: string,
    periodId: string,
    actor: AuthenticatedUser,
    userIds?: string[],
    evaluatorIdChiDinh?: string,
    ipAddress?: string,
  ): Promise<KetQuaHangLoat> {
    await this.assertPhongTrongPhamVi(departmentId, actor);
    const ky = await this.mustFindPeriod(periodId);
    this.assertKyChuaKhoa(ky);

    const nguoiTrongPhong = await this.prisma.user.findMany({
      where: {
        departmentId,
        isActive: true,
        ...(userIds?.length ? { id: { in: userIds } } : {}),
      },
      include: INCLUDE_LAP_PHIEU,
      orderBy: { employeeCode: 'asc' },
    });

    const daCoPhieu = new Set(
      (
        await this.prisma.scorecard.findMany({
          where: { periodId, ownerUserId: { in: nguoiTrongPhong.map((u) => u.id) } },
          select: { ownerUserId: true },
        })
      ).map((s) => s.ownerUserId),
    );

    const boQua: NguoiBiBoQua[] = [];
    let daTao = 0;

    for (const nguoi of nguoiTrongPhong) {
      if (daCoPhieu.has(nguoi.id)) {
        boQua.push(this.moTaBoQua(nguoi, `Đã có phiếu trong kỳ ${ky.name}`));
        continue;
      }
      const canTro = this.kiemDieuKienLapPhieu(nguoi, evaluatorIdChiDinh);
      if (canTro) {
        boQua.push(this.moTaBoQua(nguoi, canTro));
        continue;
      }
      try {
        await this.taoMotPhieu(nguoi, ky, actor, evaluatorIdChiDinh, ipAddress);
        daTao += 1;
      } catch (error) {
        boQua.push(
          this.moTaBoQua(
            nguoi,
            error instanceof Error ? error.message : 'Lỗi không xác định',
          ),
        );
      }
    }

    return {
      created: daTao,
      skipped: boQua.length,
      skippedDetails: boQua,
      warnings: [],
    };
  }

  // ------------------------------------------------------ chép từ kỳ trước

  /**
   * Chép phiếu của cả phòng từ kỳ nguồn sang kỳ đích.
   *
   * ITEM chép nguyên văn — đó là điểm của tính năng này: trưởng phòng chỉ
   * sửa vài con số thay vì dựng lại 37 dòng.
   *
   * BỐI CẢNH thì chụp lại theo dữ liệu HIỆN TẠI: chức danh, phòng ban,
   * người chấm. Người đổi chức danh giữa năm mà vẫn mang chức danh cũ trên
   * phiếu mới là sai; nhưng KPI của họ có thể vẫn phù hợp nên không chặn,
   * chỉ đưa vào danh sách cảnh báo để trưởng phòng xem lại.
   *
   * Không mang theo bất kỳ điểm số hay dấu vết duyệt nào của kỳ cũ.
   */
  async copyFromPeriod(
    departmentId: string,
    sourcePeriodId: string,
    targetPeriodId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<KetQuaHangLoat> {
    await this.assertPhongTrongPhamVi(departmentId, actor);
    if (sourcePeriodId === targetPeriodId) {
      throw new BadRequestException('Kỳ nguồn và kỳ đích phải khác nhau.');
    }
    const kyDich = await this.mustFindPeriod(targetPeriodId);
    this.assertKyChuaKhoa(kyDich);
    await this.mustFindPeriod(sourcePeriodId);

    const phieuNguon = await this.prisma.scorecard.findMany({
      where: { periodId: sourcePeriodId, departmentId, ownerUserId: { not: null } },
      include: { items: { orderBy: { displayOrder: 'asc' } } },
    });

    const chuSoHuu = await this.prisma.user.findMany({
      where: { id: { in: phieuNguon.map((p) => p.ownerUserId!) } },
      include: INCLUDE_LAP_PHIEU,
    });
    const theoId = new Map(chuSoHuu.map((u) => [u.id, u]));

    const daCoPhieu = new Set(
      (
        await this.prisma.scorecard.findMany({
          where: { periodId: targetPeriodId, ownerUserId: { in: [...theoId.keys()] } },
          select: { ownerUserId: true },
        })
      ).map((s) => s.ownerUserId),
    );

    const boQua: NguoiBiBoQua[] = [];
    const canhBao: NguoiBiBoQua[] = [];
    let daChep = 0;

    for (const nguon of phieuNguon) {
      const nguoi = theoId.get(nguon.ownerUserId!);
      if (!nguoi) continue;

      if (!nguoi.isActive) {
        boQua.push(this.moTaBoQua(nguoi, 'Đã nghỉ việc'));
        continue;
      }
      if (daCoPhieu.has(nguoi.id)) {
        boQua.push(this.moTaBoQua(nguoi, `Đã có phiếu trong kỳ ${kyDich.name}`));
        continue;
      }
      const canTro = this.kiemDieuKienLapPhieu(nguoi);
      if (canTro) {
        boQua.push(this.moTaBoQua(nguoi, canTro));
        continue;
      }

      // Đổi chức danh giữa năm: KPI cũ có thể không còn phù hợp
      if (nguon.jobTitleId && nguoi.jobTitle && nguon.jobTitleId !== nguoi.jobTitle.id) {
        canhBao.push(
          this.moTaBoQua(
            nguoi,
            `Đã đổi chức danh: phiếu cũ ghi "${nguon.jobTitleName}", ` +
              `nay là "${nguoi.jobTitle.name}". KPI chép sang có thể không còn phù hợp.`,
          ),
        );
      }

      await this.prisma.$transaction(async (tx) => {
        const moi = await tx.scorecard.create({
          data: {
            ...this.duLieuBoiCanh(nguoi, targetPeriodId, actor.id),
            // Bối cảnh mẫu giữ theo phiếu nguồn: item chép nguyên từ đó
            templateId: nguon.templateId,
            templateVersion: nguon.templateVersion,
            systemTemplateId: nguon.systemTemplateId,
          },
        });

        await tx.scorecardItem.createMany({
          data: nguon.items.map((it) => this.duLieuItemChep(it, moi.id)),
        });
        await this.noiLaiQuanHeChaCon(tx, nguon.items, moi.id);

        await this.workflow.ghiNhan(
          {
            scorecardId: moi.id,
            action: ScorecardAction.CREATE,
            actor,
            comment: `Chép từ kỳ ${nguon.periodId === sourcePeriodId ? 'trước' : ''}`.trim(),
            ipAddress,
          },
          tx,
        );
      });
      daChep += 1;
    }

    return {
      created: daChep,
      skipped: boQua.length,
      skippedDetails: boQua,
      warnings: canhBao,
    };
  }

  // ------------------------------------------------------------- nội bộ

  /**
   * Một lời gọi = một transaction. Phiếu và toàn bộ item của nó phải cùng
   * sống chết: phiếu tạo được mà item hỏng giữa chừng thì còn tệ hơn không
   * tạo, vì trưởng phòng thấy phiếu tồn tại và tưởng đã xong.
   */
  private async taoMotPhieu(
    nguoi: NguoiDungDeLapPhieu,
    ky: Period,
    actor: AuthenticatedUser,
    evaluatorIdChiDinh?: string,
    ipAddress?: string,
  ): Promise<string> {
    const mauChucDanh = await this.mustFindTemplate(nguoi.jobTitle!.id, nguoi.jobTitle!.name);
    const mauHeThong = await this.mustFindSystemTemplate();

    const itemMau = await this.prisma.kpiTemplateItem.findMany({
      where: { templateId: { in: [mauChucDanh.id, mauHeThong.id] } },
      orderBy: [{ section: 'asc' }, { displayOrder: 'asc' }],
    });

    return this.prisma.$transaction(async (tx) => {
      const phieu = await tx.scorecard.create({
        data: {
          ...this.duLieuBoiCanh(nguoi, ky.id, actor.id, evaluatorIdChiDinh),
          templateId: mauChucDanh.id,
          templateVersion: mauChucDanh.version,
          systemTemplateId: mauHeThong.id,
        },
      });

      // createMany nhanh hơn nhiều lần create, nhưng không trả về id nên
      // quan hệ cha con phải nối lại ở bước sau.
      await tx.scorecardItem.createMany({
        data: itemMau.map((it) => this.duLieuItemTuMau(it, phieu.id)),
      });
      await this.noiLaiQuanHeChaCon(tx, itemMau, phieu.id);

      await this.workflow.ghiNhan(
        {
          scorecardId: phieu.id,
          action: ScorecardAction.CREATE,
          actor,
          comment: `Sinh từ mẫu ${mauChucDanh.code} (phiên bản ${mauChucDanh.version})`,
          ipAddress,
        },
        tx,
      );

      return phieu.id;
    });
  }

  /**
   * Nối lại quan hệ cha con sau `createMany`.
   *
   * `createMany` không trả id nên phải tra ngược bằng `templateItemId` —
   * cột vốn để truy vết nguồn gốc, ở đây dùng thêm làm khoá nối.
   */
  private async noiLaiQuanHeChaCon(
    tx: Prisma.TransactionClient,
    itemGoc: Array<{ id: string; parentId: string | null }>,
    scorecardId: string,
  ): Promise<void> {
    const daTao = await tx.scorecardItem.findMany({
      where: { scorecardId },
      select: { id: true, templateItemId: true },
    });
    const theoNguon = new Map(daTao.map((i) => [i.templateItemId, i.id]));

    for (const goc of itemGoc) {
      if (!goc.parentId) continue;
      const idMoi = theoNguon.get(goc.id);
      const idChaMoi = theoNguon.get(goc.parentId);
      if (idMoi && idChaMoi) {
        await tx.scorecardItem.update({
          where: { id: idMoi },
          data: { parentId: idChaMoi },
        });
      }
    }
  }

  /** Snapshot bối cảnh, lấy theo dữ liệu HIỆN TẠI của người đó. */
  private duLieuBoiCanh(
    nguoi: NguoiDungDeLapPhieu,
    periodId: string,
    createdById: string,
    evaluatorIdChiDinh?: string,
  ): Prisma.ScorecardUncheckedCreateInput {
    return {
      ownerType: OwnerType.USER,
      ownerUserId: nguoi.id,
      periodId,
      departmentId: nguoi.department!.id,
      departmentName: nguoi.department!.name,
      jobTitleId: nguoi.jobTitle?.id ?? null,
      jobTitleName: nguoi.jobTitle?.name ?? '',
      employeeLevel: nguoi.level,
      evaluatorId: evaluatorIdChiDinh ?? nguoi.department!.managerId,
      assignStatus: AssignStatus.DRAFT,
      resultStatus: ResultStatus.PENDING,
      createdById,
    };
  }

  private duLieuItemTuMau(
    it: KpiTemplateItem,
    scorecardId: string,
  ): Prisma.ScorecardItemUncheckedCreateInput {
    return {
      scorecardId,
      templateItemId: it.id,
      parentId: null, // nối ở bước sau
      section: it.section,
      displayOrder: it.displayOrder,
      name: it.name,
      description: it.description,
      measurementText: it.measurementText,
      measureMethod: it.measureMethod,
      targetValue: it.targetValue,
      minValue: it.minValue,
      direction: it.direction,
      scoringMode: it.scoringMode,
      // Chụp thang điểm thành cột thật: công ty đổi thang về sau thì phiếu
      // cũ vẫn giữ nguyên thang lúc chấm.
      maxScale: MAX_SCALE[it.section],
      weight: it.weight,
    };
  }

  private duLieuItemChep(
    it: Prisma.ScorecardItemGetPayload<object>,
    scorecardId: string,
  ): Prisma.ScorecardItemUncheckedCreateInput {
    return {
      scorecardId,
      // Giữ nguyên nguồn gốc mẫu, đồng thời dùng làm khoá nối cha con
      templateItemId: it.id,
      parentId: null,
      section: it.section,
      displayOrder: it.displayOrder,
      name: it.name,
      description: it.description,
      measurementText: it.measurementText,
      measureMethod: it.measureMethod,
      targetValue: it.targetValue,
      minValue: it.minValue,
      direction: it.direction,
      scoringMode: it.scoringMode,
      maxScale: it.maxScale,
      weight: it.weight,
      // KHÔNG mang theo điểm số của kỳ cũ
    };
  }

  // -------------------------------------------------------- ràng buộc

  /**
   * Lý do KHÔNG lập được phiếu, hoặc null nếu đủ điều kiện.
   *
   * Trả chuỗi thay vì ném lỗi, để sinh hàng loạt gom được thành danh sách
   * "ai bị bỏ qua vì sao" thay vì hỏng cả lô ở người đầu tiên.
   */
  private kiemDieuKienLapPhieu(
    nguoi: NguoiDungDeLapPhieu,
    evaluatorIdChiDinh?: string,
  ): string | null {
    // Nghỉ việc thì mọi thứ khác không còn ý nghĩa, dừng ngay
    if (!nguoi.isActive) return 'Đã nghỉ việc';

    // Còn lại thì gom HẾT lý do. Nêu từng lý do một khiến người dùng sửa
    // xong cái này lại gặp cái kia — với 200 người thì đó là nhiều vòng
    // sửa vô ích.
    const lyDo: string[] = [];
    if (!nguoi.department) lyDo.push('Chưa được gán phòng ban');
    if (!nguoi.jobTitle) lyDo.push('Chưa được gán chức danh');
    if (nguoi.department && !evaluatorIdChiDinh && !nguoi.department.managerId) {
      lyDo.push(
        `Phòng "${nguoi.department.name}" chưa có trưởng bộ phận — chưa biết ai duyệt KPI`,
      );
    }

    // KHÔNG cho ai tự chấm chính mình.
    //
    // Trưởng bộ phận là managerId của chính phòng mình, nên nếu không chặn
    // thì phiếu của họ sẽ tự gửi, tự ký, và ở lát cắt chấm điểm là tự cho
    // mình điểm. Ký nhận và chấm điểm chỉ có nghĩa khi hai bên là hai người.
    const nguoiCham = evaluatorIdChiDinh ?? nguoi.department?.managerId ?? null;
    if (nguoiCham && nguoiCham === nguoi.id) {
      lyDo.push(
        'Không thể tự chấm chính mình — người này đang là trưởng bộ phận của ' +
          `phòng "${nguoi.department?.name ?? ''}". Cần chỉ định người chấm khác, ` +
          'thường là trưởng phòng cấp trên.',
      );
    }

    return lyDo.length > 0 ? lyDo.join('; ') : null;
  }

  private async assertPhongTrongPhamVi(
    departmentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (!trongPhamVi.includes(departmentId)) {
      throw new ForbiddenException('Bạn không có quyền giao KPI cho phòng ban này');
    }
  }

  private moTaBoQua(
    nguoi: { id: string; employeeCode: string; fullName: string },
    reason: string,
  ): NguoiBiBoQua {
    return {
      userId: nguoi.id,
      employeeCode: nguoi.employeeCode,
      fullName: nguoi.fullName,
      reason,
    };
  }

  private async mustFindPeriod(id: string): Promise<Period> {
    const ky = await this.prisma.period.findUnique({ where: { id } });
    if (!ky) throw new NotFoundException('Không tìm thấy kỳ đánh giá');
    return ky;
  }

  /**
   * Kỳ đã khoá thì không thao tác được.
   *
   * CHỈ nhìn đúng kỳ của phiếu, không đi ngược lên cây parentId: khoá quý
   * không khoá ba tháng bên trong (docs mục 5.6).
   */
  private assertKyChuaKhoa(ky: Period): void {
    if (ky.isLocked) {
      throw new BadRequestException(
        `Kỳ ${ky.name} đã khoá sổ, không thao tác được nữa.`,
      );
    }
  }

  private async mustFindTemplate(jobTitleId: string, jobTitleName: string) {
    const mau = await this.prisma.kpiTemplate.findFirst({
      where: {
        jobTitleId,
        status: TemplateStatus.PUBLISHED,
        isActive: true,
        isSystem: false,
      },
      orderBy: { version: 'desc' },
    });
    if (!mau) {
      throw new BadRequestException(
        `Chức danh "${jobTitleName}" chưa có mẫu KPI nào được xuất bản`,
      );
    }
    return mau;
  }

  private async mustFindSystemTemplate() {
    const mau = await this.prisma.kpiTemplate.findUnique({
      where: { code: MA_MAU_HE_THONG },
    });
    if (!mau) {
      throw new BadRequestException(
        `Chưa có mẫu hệ thống "${MA_MAU_HE_THONG}" chứa mục Chấp hành nội quy.`,
      );
    }
    return mau;
  }

  /** Có để tránh cảnh báo "khai mà không dùng" khi KpiSection chỉ dùng gián tiếp. */
  static readonly CAC_MUC = [KpiSection.BSC_WORK, KpiSection.COMPLIANCE];
}
