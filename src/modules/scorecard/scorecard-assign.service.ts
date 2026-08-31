import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignStatus,
  Prisma,
  ScorecardAction,
  type Period,
  type Scorecard,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DepartmentScopeService } from '../org/department-scope.service.js';
import { ScorecardWorkflowService } from './scorecard-workflow.service.js';
import { kiemTraTrongSoPhieu } from './scorecard-validation.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { MAX_SCALE } from '../kpi-template/kpi-scale.constants.js';
import type {
  KetQuaHangLoat,
  NguoiBiBoQua,
  ScorecardItemInput,
} from './dto/scorecard.dto.js';

@Injectable()
export class ScorecardAssignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentScope: DepartmentScopeService,
    private readonly workflow: ScorecardWorkflowService,
  ) {}

  /**
   * Gửi phiếu đi ký.
   *
   * Kiểm trọng số Ở ĐÂY, không phải lúc sinh phiếu: phiếu lệch trọng số vẫn
   * tạo được và nằm ở DRAFT để trưởng phòng sửa, nhưng không được đi tiếp.
   */
  async propose(
    id: string,
    actor: AuthenticatedUser,
    note?: string,
    ipAddress?: string,
  ) {
    const phieu = await this.mustFindTrongPhamVi(id, actor);
    this.assertKyChuaKhoa(phieu.period);
    await this.workflow.assertCoTheGui(phieu, actor);

    const hanhDong = this.workflow.hanhDongGui(phieu, note);
    await this.assertTrongSoDung(id);

    return this.prisma.$transaction((tx) =>
      this.workflow.ghiNhan(
        {
          scorecardId: id,
          action: hanhDong,
          actor,
          comment: note ?? null,
          assignStatus: AssignStatus.PROPOSED,
          ipAddress,
        },
        tx,
      ),
    );
  }

  /** Gửi hàng loạt. Mỗi phiếu một transaction, phiếu hỏng không kéo cả lô. */
  async batchPropose(
    departmentId: string,
    periodId: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<KetQuaHangLoat> {
    await this.assertPhongTrongPhamVi(departmentId, actor);

    const cayCon = await this.departmentScope.getSubtreeIds(departmentId);
    const phieu = await this.prisma.scorecard.findMany({
      where: {
        periodId,
        departmentId: { in: cayCon },
        assignStatus: AssignStatus.DRAFT,
      },
      include: {
        ownerUser: { select: { id: true, employeeCode: true, fullName: true } },
        period: true,
      },
    });

    const boQua: NguoiBiBoQua[] = [];
    let daGui = 0;

    for (const p of phieu) {
      const nguoi = p.ownerUser ?? {
        id: p.id,
        employeeCode: '—',
        fullName: '(phiếu không có chủ sở hữu)',
      };
      try {
        await this.propose(p.id, actor, undefined, ipAddress);
        daGui += 1;
      } catch (error) {
        boQua.push({
          userId: nguoi.id,
          employeeCode: nguoi.employeeCode,
          fullName: nguoi.fullName,
          reason: error instanceof Error ? error.message : 'Lỗi không xác định',
        });
      }
    }

    return { created: daGui, skipped: boQua.length, skippedDetails: boQua, warnings: [] };
  }

  /** Ký nhận. Chỉ chính chủ, không ai ký thay kể cả ADMIN. */
  async accept(id: string, actor: AuthenticatedUser, ipAddress?: string) {
    const phieu = await this.mustFind(id);
    this.assertKyChuaKhoa(phieu.period);
    this.workflow.assertLaChuSoHuu(phieu, actor);
    this.workflow.assertDangChoKy(phieu);

    return this.prisma.$transaction((tx) =>
      this.workflow.ghiNhan(
        {
          scorecardId: id,
          action: ScorecardAction.ACCEPT,
          actor,
          assignStatus: AssignStatus.ACCEPTED,
          ipAddress,
        },
        tx,
      ),
    );
  }

  /** Nêu ý kiến. Bắt buộc có lý do — DTO đã ép tối thiểu 5 ký tự. */
  async dispute(
    id: string,
    reason: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const phieu = await this.mustFind(id);
    this.assertKyChuaKhoa(phieu.period);
    this.workflow.assertLaChuSoHuu(phieu, actor);
    this.workflow.assertDangChoKy(phieu);

    return this.prisma.$transaction((tx) =>
      this.workflow.ghiNhan(
        {
          scorecardId: id,
          action: ScorecardAction.DISPUTE,
          actor,
          comment: reason,
          assignStatus: AssignStatus.DISPUTED,
          ipAddress,
        },
        tx,
      ),
    );
  }

  /**
   * Lưu TOÀN BỘ cây item của phiếu: thêm, sửa, xoá dòng trong một lần.
   *
   * Chỉ sửa được khi phiếu ở DRAFT hoặc DISPUTED, và chưa bắt đầu chấm.
   * Sửa xong phiếu về DRAFT — kể cả đang ở DISPUTED, vì nội dung đã đổi thì
   * ý kiến cũ không còn áp dụng, phải gửi ký lại.
   *
   * XOÁ SẠCH RỒI TẠO LẠI, giống màn soạn mẫu KPI. An toàn ở đây vì
   * `assertCoTheSuaNoiDung` đã bảo đảm `resultStatus = PENDING` — chưa có
   * điểm nào để mất. Nếu sau này cho sửa phiếu đã chấm thì PHẢI đổi sang
   * đối chiếu từng dòng.
   *
   * Kiểm trọng số NGAY tại đây, không đợi lúc gửi ký: sửa cây item là thao
   * tác duy nhất làm lệch trọng số, báo ngay thì người dùng sửa được liền.
   */
  async saveItems(
    id: string,
    items: ScorecardItemInput[],
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const phieu = await this.mustFindTrongPhamVi(id, actor);
    this.assertKyChuaKhoa(phieu.period);
    await this.workflow.assertCoTheGui(phieu, actor);
    this.workflow.assertCoTheSuaNoiDung(phieu);

    if (phieu.assignStatus === AssignStatus.PROPOSED) {
      throw new BadRequestException(
        'Phiếu đang chờ người nhận ký. Đợi họ phản hồi trước khi sửa.',
      );
    }

    this.assertCayHopLe(items);

    const loi = kiemTraTrongSoPhieu(
      items.map((i) => ({
        id: i.key,
        parentId: i.parentKey ?? null,
        name: i.name,
        section: i.section,
        weight: new Prisma.Decimal(i.weight),
      })),
    );
    if (loi.length > 0) {
      throw new BadRequestException({
        message: 'Trọng số của phiếu chưa đúng.',
        errors: loi,
      });
    }

    const soCu = await this.prisma.scorecardItem.count({ where: { scorecardId: id } });

    return this.prisma.$transaction(async (tx) => {
      await tx.scorecardItem.deleteMany({ where: { scorecardId: id } });

      const anhXaId = new Map<string, string>();
      for (const it of items.filter((i) => !i.parentKey)) {
        const tao = await tx.scorecardItem.create({
          data: this.duLieuItem(it, id, null),
        });
        anhXaId.set(it.key, tao.id);
      }
      for (const it of items.filter((i) => i.parentKey)) {
        await tx.scorecardItem.create({
          data: this.duLieuItem(it, id, anhXaId.get(it.parentKey!) ?? null),
        });
      }

      return this.workflow.ghiNhan(
        {
          scorecardId: id,
          action: ScorecardAction.UPDATE_ITEMS,
          actor,
          comment: `Sửa cây item: ${soCu} dòng -> ${items.length} dòng`,
          // Sửa nội dung thì luôn về nháp, phải gửi ký lại
          assignStatus: AssignStatus.DRAFT,
          ipAddress,
        },
        tx,
      );
    });
  }

  /** Cây phải đúng hai cấp và khoá không trùng, nếu không ghi xuống sẽ sai. */
  private assertCayHopLe(items: ScorecardItemInput[]): void {
    const daThay = new Set<string>();
    for (const i of items) {
      if (daThay.has(i.key)) {
        throw new BadRequestException(`Có hai dòng cùng khoá "${i.key}" trong phiếu.`);
      }
      daThay.add(i.key);
    }

    const theoKey = new Map(items.map((i) => [i.key, i]));
    for (const i of items) {
      if (!i.parentKey) continue;
      const cha = theoKey.get(i.parentKey);
      if (!cha) {
        throw new BadRequestException(
          `Dòng "${i.name}" trỏ tới một tiêu chí cha không tồn tại trong phiếu.`,
        );
      }
      if (cha.parentKey) {
        throw new BadRequestException(
          `Phiếu KPI chỉ có hai cấp. Dòng "${i.name}" đang nằm dưới "${cha.name}", ` +
            `mà "${cha.name}" đã là KPI con của một tiêu chí khác.`,
        );
      }
      if (cha.section !== i.section) {
        throw new BadRequestException(
          `KPI con "${i.name}" thuộc mục khác với tiêu chí cha "${cha.name}".`,
        );
      }
    }
  }

  private duLieuItem(
    it: ScorecardItemInput,
    scorecardId: string,
    parentId: string | null,
  ): Prisma.ScorecardItemUncheckedCreateInput {
    return {
      scorecardId,
      parentId,
      // Giữ nguyên nguồn gốc mẫu để tra ngược; dòng thêm tay thì null
      templateItemId: it.templateItemId ?? null,
      section: it.section,
      displayOrder: it.displayOrder,
      name: it.name,
      description: it.description ?? null,
      measurementText: it.measurementText ?? null,
      measureMethod: it.measureMethod ?? null,
      // Thang điểm chụp theo mục, giữ nguyên quy ước của phiếu
      maxScale: MAX_SCALE[it.section],
      weight: new Prisma.Decimal(it.weight),
    };
  }

  // -------------------------------------------------------------- nội bộ

  private async mustFind(id: string) {
    const phieu = await this.prisma.scorecard.findUnique({
      where: { id },
      include: { period: true },
    });
    if (!phieu) throw new NotFoundException('Không tìm thấy phiếu KPI');
    return phieu;
  }

  private async mustFindTrongPhamVi(id: string, user: AuthenticatedUser) {
    const phieu = await this.mustFind(id);
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (!trongPhamVi.includes(phieu.departmentId) && phieu.ownerUserId !== user.id) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên phiếu KPI này');
    }
    return phieu;
  }

  private async assertPhongTrongPhamVi(
    departmentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (!trongPhamVi.includes(departmentId)) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên phòng ban này');
    }
  }

  /** Chỉ nhìn đúng kỳ của phiếu, không đi ngược cây parentId (docs mục 5.6). */
  private assertKyChuaKhoa(ky: Period): void {
    if (ky.isLocked) {
      throw new BadRequestException(`Kỳ ${ky.name} đã khoá sổ, không thao tác được nữa.`);
    }
  }

  /** Tổng phiếu phải đúng 100 mới được gửi đi ký. */
  private async assertTrongSoDung(scorecardId: string): Promise<void> {
    const items = await this.prisma.scorecardItem.findMany({
      where: { scorecardId },
      select: { id: true, parentId: true, name: true, section: true, weight: true },
    });
    const loi = kiemTraTrongSoPhieu(items);
    if (loi.length > 0) {
      throw new BadRequestException({
        message: 'Phiếu chưa gửi đi ký được vì trọng số chưa đúng.',
        errors: loi,
      });
    }
  }
}
