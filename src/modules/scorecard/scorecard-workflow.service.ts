import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  AssignStatus,
  type Grade,
  Prisma,
  ResultStatus,
  Role,
  ScorecardAction,
  type Scorecard,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

export interface GhiNhanChuyenTrangThai {
  scorecardId: string;
  action: ScorecardAction;
  actor: AuthenticatedUser;
  comment?: string | null;
  /** Trạng thái giao KPI mới. Bỏ trống nếu hành động không đổi trạng thái. */
  assignStatus?: AssignStatus;
  /** Trạng thái chấm điểm mới. Bỏ trống nếu hành động không đổi trạng thái. */
  resultStatus?: ResultStatus;
  /**
   * Điểm CHỐT, chỉ đi kèm hai hành động submit.
   *
   * Đi qua đây chứ không update riêng một lệnh: điểm chốt và sự kiện chốt
   * điểm phải cùng sống hoặc cùng chết. Ghi rời nhau thì sẽ có phiếu mang
   * điểm mà không có dòng lịch sử nào giải thích ai chốt, lúc nào.
   */
  selfTotalScore?: Prisma.Decimal;
  managerTotalScore?: Prisma.Decimal;
  grade?: Grade | null;
  /** Chỉ dùng khi chốt phiếu của người đã nghỉ việc. */
  noSelfScoreReason?: string | null;
  ipAddress?: string;
}

/**
 * Nơi DUY NHẤT được ghi chuyển trạng thái của phiếu.
 *
 * Mỗi lần chuyển ghi ba thứ, trong CÙNG MỘT TRANSACTION:
 *   1. `ScorecardEvent` — nguồn sự thật, không bao giờ ghi đè
 *   2. Cột cache trên `Scorecard` (proposedAt, acceptedAt, disputedAt...)
 *   3. `AuditLog` — truy vết hệ thống
 *
 * Phiếu KPI là bằng chứng khi tranh cãi lương thưởng. Ghi ba nơi rời nhau
 * thì sẽ có lúc lệch, và khi lệch không biết bên nào đúng. Gộp vào một hàm
 * để không thể quên chỗ nào.
 */
@Injectable()
export class ScorecardWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async ghiNhan(
    input: GhiNhanChuyenTrangThai,
    tx: Prisma.TransactionClient,
  ): Promise<Scorecard> {
    const bayGio = new Date();

    await tx.scorecardEvent.create({
      data: {
        scorecardId: input.scorecardId,
        action: input.action,
        actorId: input.actor.id,
        comment: input.comment ?? null,
      },
    });

    const capNhat = this.cacCotCache(input.action, input.actor.id, input.comment, bayGio);
    if (input.assignStatus) capNhat.assignStatus = input.assignStatus;
    if (input.resultStatus) capNhat.resultStatus = input.resultStatus;
    if (input.selfTotalScore !== undefined) capNhat.selfTotalScore = input.selfTotalScore;
    if (input.managerTotalScore !== undefined) {
      capNhat.managerTotalScore = input.managerTotalScore;
    }
    if (input.grade !== undefined) capNhat.grade = input.grade;
    if (input.noSelfScoreReason !== undefined) {
      capNhat.noSelfScoreReason = input.noSelfScoreReason;
    }

    const phieu = await tx.scorecard.update({
      where: { id: input.scorecardId },
      data: capNhat,
    });

    await this.audit.log(
      {
        actorId: input.actor.id,
        entityType: 'Scorecard',
        entityId: input.scorecardId,
        action: input.action,
        after: {
          assignStatus: phieu.assignStatus,
          resultStatus: phieu.resultStatus,
          comment: input.comment ?? null,
        },
        ipAddress: input.ipAddress,
      },
      tx,
    );

    return phieu;
  }

  /**
   * Cột cache tương ứng từng hành động.
   *
   * Đây chỉ là bản sao cho nhanh của sự kiện MỚI NHẤT. Lịch sử đầy đủ nằm
   * ở `ScorecardEvent` — phiếu bị phản đối hai lần thì lý do lần đầu chỉ
   * còn ở đó.
   */
  private cacCotCache(
    action: ScorecardAction,
    actorId: string,
    comment: string | null | undefined,
    bayGio: Date,
  ): Prisma.ScorecardUncheckedUpdateInput {
    switch (action) {
      case ScorecardAction.PROPOSE:
      case ScorecardAction.RE_PROPOSED_UNCHANGED:
        return { proposedAt: bayGio, proposedById: actorId };
      case ScorecardAction.ACCEPT:
        return { acceptedAt: bayGio };
      case ScorecardAction.DISPUTE:
        return { disputedAt: bayGio, disputeReason: comment ?? null };
      case ScorecardAction.SELF_SCORE:
        return { selfScoredAt: bayGio };
      case ScorecardAction.MANAGER_SCORE:
        return { managerScoredAt: bayGio };
      case ScorecardAction.REJECT:
        // Phiếu bị trả lại nhiều lần là chuyện bình thường. Hai cột này chỉ
        // giữ lần GẦN NHẤT; muốn xem đủ các lần thì đọc ScorecardEvent.
        return { rejectedAt: bayGio, rejectReason: comment ?? null };
      case ScorecardAction.RECEIVE:
        return { receivedAt: bayGio, receivedById: actorId };
      default:
        return {};
    }
  }

  // ------------------------------------------------------------ quy tắc

  /**
   * Ai được gửi phiếu đi ký.
   *
   * `evaluatorId` của phiếu, hoặc ADMIN/HR. Trưởng bộ phận khác phòng
   * không gửi thay được — kiểm phạm vi đã làm ở tầng trên.
   */
  async assertCoTheGui(phieu: Scorecard, actor: AuthenticatedUser): Promise<void> {
    const laNguoiCham = phieu.evaluatorId === actor.id;
    const laQuanTri = actor.role === Role.ADMIN || actor.role === Role.HR;

    // Ban giám đốc chấm và duyệt KPI của TRƯỞNG BỘ PHẬN (HCNS chốt).
    // Với phiếu nhân viên thường thì EXECUTIVE vẫn chỉ được xem.
    const laBgdTrenPhieuTruongBoPhan =
      actor.role === Role.EXECUTIVE && (await this.laPhieuTruongBoPhan(phieu));

    if (!laNguoiCham && !laQuanTri && !laBgdTrenPhieuTruongBoPhan) {
      throw new ForbiddenException(
        actor.role === Role.EXECUTIVE
          ? 'Ban giám đốc chỉ thao tác được trên phiếu của trưởng bộ phận. ' +
            'Phiếu nhân viên thường do trưởng bộ phận của họ phụ trách.'
          : 'Chỉ người chấm được chỉ định của phiếu, hoặc quản trị viên, mới gửi được phiếu đi ký.',
      );
    }
  }

  /** Chủ phiếu có đang là trưởng bộ phận của phòng nào không. */
  async laPhieuTruongBoPhan(phieu: Scorecard): Promise<boolean> {
    if (!phieu.ownerUserId) return false;
    const soPhong = await this.prisma.department.count({
      where: { managerId: phieu.ownerUserId },
    });
    return soPhong > 0;
  }

  /** Chỉ chính chủ ký nhận. Không ai ký thay, kể cả ADMIN. */
  assertLaChuSoHuu(phieu: Scorecard, actor: AuthenticatedUser): void {
    if (phieu.ownerUserId !== actor.id) {
      throw new ForbiddenException(
        'Chỉ người nhận KPI mới ký nhận được phiếu của mình. Không ai ký thay.',
      );
    }
  }

  /**
   * Trạng thái được phép gửi đi ký.
   *
   * DISPUTED cũng gửi lại được — hai bên trao đổi trực tiếp rồi thống nhất
   * giữ nguyên KPI là chuyện bình thường. Nhưng bắt buộc ghi chú, và ghi
   * bằng hành động riêng để phân biệt với lần gửi đầu.
   */
  hanhDongGui(phieu: Scorecard, ghiChu?: string | null): ScorecardAction {
    if (phieu.assignStatus === AssignStatus.DRAFT) return ScorecardAction.PROPOSE;

    if (phieu.assignStatus === AssignStatus.DISPUTED) {
      if (!ghiChu?.trim()) {
        throw new BadRequestException(
          'Phiếu đang có ý kiến của người nhận. Gửi lại nguyên trạng thì bắt buộc ' +
            'ghi chú lý do — ví dụ đã trao đổi trực tiếp và hai bên thống nhất giữ nguyên.',
        );
      }
      return ScorecardAction.RE_PROPOSED_UNCHANGED;
    }

    throw new BadRequestException(
      phieu.assignStatus === AssignStatus.PROPOSED
        ? 'Phiếu đã gửi đi ký rồi, đang chờ người nhận phản hồi.'
        : 'Phiếu đã được ký nhận, không gửi lại được. Muốn đổi thì sửa nội dung phiếu trước.',
    );
  }

  assertDangChoKy(phieu: Scorecard): void {
    if (phieu.assignStatus !== AssignStatus.PROPOSED) {
      throw new BadRequestException(
        phieu.assignStatus === AssignStatus.ACCEPTED
          ? 'Phiếu này đã được ký nhận rồi.'
          : 'Phiếu chưa được gửi đi ký.',
      );
    }
  }

  /**
   * Sửa nội dung phiếu: chỉ khi chưa bắt đầu chấm điểm.
   *
   * Đã chấm rồi mà đổi đề bài thì điểm đã cho không còn nghĩa.
   */
  assertCoTheSuaNoiDung(phieu: Scorecard): void {
    if (phieu.resultStatus !== ResultStatus.PENDING) {
      throw new BadRequestException(
        'Phiếu đã bắt đầu chấm điểm, không sửa được nội dung nữa.',
      );
    }
  }
}
