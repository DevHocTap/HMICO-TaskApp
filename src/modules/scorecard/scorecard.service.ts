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
  Role,
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

/**
 * Dữ liệu tra cứu gom sẵn một lần, để kiểm điều kiện lập phiếu nêu được
 * HẾT lý do cùng lúc.
 *
 * Không có nó thì mỗi lý do phải một truy vấn riêng, và việc kiểm phải
 * dừng ở lý do đầu tiên — trưởng phòng sửa xong cái này lại gặp cái kia.
 */
interface BoiCanhKiemTra {
  /** Chức danh đã có mẫu KPI xuất bản. */
  chucDanhCoMau: Set<string>;
  /**
   * Người đang là `Department.managerId` của ít nhất một đơn vị.
   *
   * CHÚ Ý: tập này gộp cả TRƯỞNG PHÒNG lẫn TỔ TRƯỞNG. HCNS mới xác nhận
   * quy tắc "ban giám đốc chấm" cho trưởng phòng; tổ trưởng do ai chấm thì
   * chưa có câu trả lời — xem docs/no-ky-thuat.md Câu 0b.
   *
   * Nếu HCNS trả lời tổ trưởng do trưởng phòng chấm thì sửa ở đây: tách
   * hai cấp thay vì gộp một tập.
   */
  laTruongBoPhan: Set<string>;
  /** Người có vai trò EXECUTIVE và đang hoạt động. */
  banGiamDoc: Set<string>;
}

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
    phieuRong = false,
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

    const boiCanh = await this.dungBoiCanh();

    if (phieuRong) {
      this.assertDuocSinhPhieuRong(actor);
    }

    const canTro = this.kiemDieuKienLapPhieu(
      nguoi,
      boiCanh,
      evaluatorIdChiDinh,
      phieuRong,
    );
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

    const id = await this.taoMotPhieu(
      nguoi,
      ky,
      actor,
      boiCanh,
      evaluatorIdChiDinh,
      ipAddress,
      phieuRong,
    );
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

    const boiCanh = await this.dungBoiCanh();
    const boQua: NguoiBiBoQua[] = [];
    let daTao = 0;

    for (const nguoi of nguoiTrongPhong) {
      // Gom cả "đã có phiếu" vào cùng danh sách lý do, không dừng riêng
      const lyDo: string[] = [];
      if (daCoPhieu.has(nguoi.id)) lyDo.push(`Đã có phiếu trong kỳ ${ky.name}`);
      const canTro = this.kiemDieuKienLapPhieu(nguoi, boiCanh, evaluatorIdChiDinh);
      if (canTro) lyDo.push(canTro);
      if (lyDo.length > 0) {
        boQua.push(this.moTaBoQua(nguoi, lyDo.join('; ')));
        continue;
      }
      try {
        await this.taoMotPhieu(nguoi, ky, actor, boiCanh, evaluatorIdChiDinh, ipAddress);
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

    const boiCanh = await this.dungBoiCanh();
    const boQua: NguoiBiBoQua[] = [];
    const canhBao: NguoiBiBoQua[] = [];
    let daChep = 0;

    for (const nguon of phieuNguon) {
      const nguoi = theoId.get(nguon.ownerUserId!);
      if (!nguoi) continue;

      const lyDo: string[] = [];
      if (daCoPhieu.has(nguoi.id)) lyDo.push(`Đã có phiếu trong kỳ ${kyDich.name}`);
      // Chép phiếu thì item đã có sẵn, không cần mẫu -> phieuRong = true
      const canTro = this.kiemDieuKienLapPhieu(nguoi, boiCanh, undefined, true);
      if (canTro) lyDo.push(canTro);
      if (lyDo.length > 0) {
        boQua.push(this.moTaBoQua(nguoi, lyDo.join('; ')));
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
            ...this.duLieuBoiCanh(nguoi, targetPeriodId, actor.id, boiCanh),
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
    boiCanh: BoiCanhKiemTra,
    evaluatorIdChiDinh?: string,
    ipAddress?: string,
    phieuRong = false,
  ): Promise<string> {
    const mauHeThong = await this.mustFindSystemTemplate();
    // Phiếu rỗng: chỉ dựng Mục 2, Mục 1 để trống chờ nhập trực tiếp
    const mauChucDanh = phieuRong
      ? null
      : await this.mustFindTemplate(nguoi.jobTitle!.id, nguoi.jobTitle!.name);

    const idMau = [mauHeThong.id, ...(mauChucDanh ? [mauChucDanh.id] : [])];
    const itemMau = await this.prisma.kpiTemplateItem.findMany({
      where: { templateId: { in: idMau } },
      orderBy: [{ section: 'asc' }, { displayOrder: 'asc' }],
    });

    return this.prisma.$transaction(async (tx) => {
      const phieu = await tx.scorecard.create({
        data: {
          ...this.duLieuBoiCanh(nguoi, ky.id, actor.id, boiCanh, evaluatorIdChiDinh),
          templateId: mauChucDanh?.id ?? null,
          templateVersion: mauChucDanh?.version ?? null,
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
          comment: mauChucDanh
            ? `Sinh từ mẫu ${mauChucDanh.code} (phiên bản ${mauChucDanh.version})`
            : 'Sinh phiếu rỗng: chỉ có Mục 2, Mục 1 chờ nhập trực tiếp',
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
    boiCanh: BoiCanhKiemTra,
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
      evaluatorId: this.nguoiChamDuKien(nguoi, boiCanh, evaluatorIdChiDinh),
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
  /** Gom sẵn dữ liệu tra cứu, một lần cho cả lô. */
  private async dungBoiCanh(): Promise<BoiCanhKiemTra> {
    const [mau, phong, bgd] = await Promise.all([
      this.prisma.kpiTemplate.findMany({
        where: { status: TemplateStatus.PUBLISHED, isActive: true, isSystem: false },
        select: { jobTitleId: true },
      }),
      this.prisma.department.findMany({
        where: { managerId: { not: null } },
        select: { managerId: true },
      }),
      this.prisma.user.findMany({
        where: { role: Role.EXECUTIVE, isActive: true },
        select: { id: true },
      }),
    ]);

    return {
      chucDanhCoMau: new Set(mau.map((m) => m.jobTitleId).filter((x): x is string => !!x)),
      laTruongBoPhan: new Set(phong.map((p) => p.managerId!).filter(Boolean)),
      banGiamDoc: new Set(bgd.map((u) => u.id)),
    };
  }

  /**
   * Người chấm sẽ được gán, hoặc null nếu chưa xác định được.
   *
   * Trưởng bộ phận do BAN GIÁM ĐỐC chấm (HCNS chốt). Tự gán khi công ty
   * có đúng một người vai trò EXECUTIVE; nhiều hơn một thì bắt chọn tay,
   * vì đoán bừa ai trong ban giám đốc là sai.
   */
  private nguoiChamDuKien(
    nguoi: NguoiDungDeLapPhieu,
    boiCanh: BoiCanhKiemTra,
    evaluatorIdChiDinh?: string,
  ): string | null {
    if (evaluatorIdChiDinh) return evaluatorIdChiDinh;

    if (boiCanh.laTruongBoPhan.has(nguoi.id)) {
      const bgd = [...boiCanh.banGiamDoc];
      return bgd.length === 1 ? bgd[0] : null;
    }
    return nguoi.department?.managerId ?? null;
  }

  /**
   * Lý do KHÔNG lập được phiếu. Trả null nếu đủ điều kiện.
   *
   * NÊU HẾT LÝ DO CÙNG LÚC, không dừng ở lý do đầu tiên. Trưởng phòng sửa
   * xong một lỗi lại gặp lỗi kế tiếp là trải nghiệm tệ — với 200 người thì
   * đó là nhiều vòng sửa vô ích.
   */
  private kiemDieuKienLapPhieu(
    nguoi: NguoiDungDeLapPhieu,
    boiCanh: BoiCanhKiemTra,
    evaluatorIdChiDinh?: string,
    phieuRong = false,
  ): string | null {
    // Nghỉ việc thì mọi thứ khác không còn ý nghĩa
    if (!nguoi.isActive) return 'Đã nghỉ việc';

    // HCNS chốt 03/09/2026: hai vai trò này KHÔNG có phiếu KPI.
    // Chặn ở đây thay vì chỉ ẩn khỏi danh sách, để không ai sinh phiếu cho
    // họ bằng đường chỉ định thẳng userId.
    //
    // Ban giám đốc vẫn là NGƯỜI CHẤM của trưởng phòng — chặn ở đây chỉ là
    // "không có phiếu của chính mình", không đụng tới vai trò người chấm.
    if (nguoi.role === Role.ADMIN) {
      return 'Tài khoản quản trị hệ thống không áp KPI';
    }
    if (nguoi.role === Role.EXECUTIVE) {
      return 'Ban giám đốc không bị chấm điểm KPI';
    }

    const lyDo: string[] = [];
    if (!nguoi.department) lyDo.push('Chưa được gán phòng ban');
    if (!nguoi.jobTitle) lyDo.push('Chưa được gán chức danh');

    // Chức danh chưa có mẫu — kiểm ở đây chứ không đợi lúc tra mẫu, để lý
    // do này gộp được với các lý do khác
    if (
      !phieuRong &&
      nguoi.jobTitle &&
      !boiCanh.chucDanhCoMau.has(nguoi.jobTitle.id)
    ) {
      // Gợi ý đường thoát cho MỌI người, không riêng trưởng bộ phận: HCNS
      // chốt 03/09/2026 (câu C3) rằng mẫu chỉ là điểm khởi đầu, trưởng phòng
      // tự soạn KPI cho từng nhân viên. Chức danh chưa có mẫu không còn là
      // ngõ cụt.
      lyDo.push(
        `Chức danh "${nguoi.jobTitle.name}" chưa có mẫu KPI nào được xuất bản` +
          ' — dùng đường sinh phiếu rỗng rồi nhập KPI trực tiếp',
      );
    }

    const laTruong = boiCanh.laTruongBoPhan.has(nguoi.id);
    const nguoiCham = this.nguoiChamDuKien(nguoi, boiCanh, evaluatorIdChiDinh);

    if (laTruong) {
      // Trưởng bộ phận do ban giám đốc chấm — HCNS đã chốt
      if (!nguoiCham) {
        lyDo.push(
          boiCanh.banGiamDoc.size === 0
            ? 'Là trưởng bộ phận, cần ban giám đốc chấm, nhưng công ty chưa có ai vai trò Ban giám đốc'
            : `Là trưởng bộ phận, cần ban giám đốc chấm. Công ty có ${boiCanh.banGiamDoc.size} người ` +
              'thuộc ban giám đốc nên phải chọn rõ ai chấm khi sinh phiếu',
        );
      } else if (!boiCanh.banGiamDoc.has(nguoiCham)) {
        lyDo.push(
          'Là trưởng bộ phận nên chỉ ban giám đốc mới chấm được. ' +
            'Người chấm đang chọn không thuộc ban giám đốc.',
        );
      }
    } else if (nguoi.department && !nguoiCham) {
      lyDo.push(
        `Phòng "${nguoi.department.name}" chưa có trưởng bộ phận — chưa biết ai duyệt KPI`,
      );
    }

    // Không ai tự chấm chính mình. Ký nhận chỉ có nghĩa khi hai bên là hai người.
    if (nguoiCham && nguoiCham === nguoi.id) {
      lyDo.push('Không thể tự chấm chính mình — cần chỉ định người chấm khác');
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

  /**
   * Phiếu rỗng là ngoại lệ có chủ đích, không phải đường tắt.
   *
   * Chỉ mở khi chức danh THẬT SỰ chưa có mẫu — trường hợp bình thường của
   * trưởng bộ phận. Có mẫu mà vẫn sinh rỗng là bỏ qua nội dung đã duyệt.
   */
  /**
   * Ai được sinh phiếu RỖNG rồi tự nhập KPI.
   *
   * HCNS chốt 03/09/2026 (câu C3): **mẫu KPI chỉ là điểm khởi đầu.** Trưởng
   * phòng đưa ra tiêu chí lớn và các tiêu chí con cho từng nhân viên, tự
   * thêm và chỉnh sửa. Vì vậy:
   *
   * - `MANAGER` sinh được phiếu rỗng cho nhân viên phòng mình. Phạm vi
   *   phòng ban đã được `assertPhongTrongPhamVi` chặn ở tầng trên, chỗ này
   *   không kiểm lại.
   * - **Không còn chặn khi chức danh ĐÃ có mẫu.** Trước đây bắt buộc dùng
   *   mẫu nếu chức danh có mẫu; nay trưởng phòng được quyền soạn từ đầu khi
   *   mẫu không hợp với việc thật của tháng đó. Ép dùng mẫu là ép họ quay
   *   về Excel để làm phần mẫu không diễn đạt được.
   *
   * `STAFF` vẫn không sinh được phiếu — không ai tự giao KPI cho mình.
   */
  private assertDuocSinhPhieuRong(actor: AuthenticatedUser): void {
    const duocPhep: Role[] = [Role.ADMIN, Role.HR, Role.EXECUTIVE, Role.MANAGER];
    if (!duocPhep.includes(actor.role)) {
      throw new ForbiddenException(
        'Chỉ quản trị viên, Hành chính nhân sự, ban giám đốc hoặc trưởng ' +
          'phòng mới sinh được phiếu rỗng.',
      );
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
      // 409 chứ không 400 — thống nhất với luồng chấm điểm.
      throw new ConflictException(
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
