import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignStatus,
  ScorecardAction,
  type Period,
  type Scorecard,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DepartmentScopeService } from '../org/department-scope.service.js';
import { ScorecardWorkflowService } from './scorecard-workflow.service.js';
import { kiemTraTrongSoPhieu } from './scorecard-validation.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { KetQuaHangLoat, NguoiBiBoQua } from './dto/scorecard.dto.js';

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
    this.workflow.assertCoTheGui(phieu, actor);

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
   * Sửa trọng số các dòng của phiếu.
   *
   * Chỉ sửa được khi phiếu ở DRAFT hoặc DISPUTED, và chưa bắt đầu chấm.
   * Sửa xong phiếu về DRAFT — kể cả đang ở DISPUTED, vì nội dung đã đổi thì
   * ý kiến cũ không còn áp dụng, phải gửi ký lại.
   */
  async updateItemWeights(
    id: string,
    capNhat: Array<{ itemId: string; weight: number }>,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ) {
    const phieu = await this.mustFindTrongPhamVi(id, actor);
    this.assertKyChuaKhoa(phieu.period);
    this.workflow.assertCoTheGui(phieu, actor);
    this.workflow.assertCoTheSuaNoiDung(phieu);

    if (phieu.assignStatus === AssignStatus.PROPOSED) {
      throw new BadRequestException(
        'Phiếu đang chờ người nhận ký. Đợi họ phản hồi trước khi sửa.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      for (const { itemId, weight } of capNhat) {
        const thuoc = await tx.scorecardItem.findFirst({
          where: { id: itemId, scorecardId: id },
          select: { id: true },
        });
        if (!thuoc) {
          throw new BadRequestException('Có dòng không thuộc phiếu này.');
        }
        await tx.scorecardItem.update({ where: { id: itemId }, data: { weight } });
      }

      return this.workflow.ghiNhan(
        {
          scorecardId: id,
          action: ScorecardAction.UPDATE_ITEMS,
          actor,
          comment: `Sửa trọng số ${capNhat.length} dòng`,
          // Sửa nội dung thì luôn về nháp, phải gửi ký lại
          assignStatus: AssignStatus.DRAFT,
          ipAddress,
        },
        tx,
      );
    });
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
