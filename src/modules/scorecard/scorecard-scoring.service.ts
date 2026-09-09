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
  Prisma,
  ResultStatus,
  Role,
  ScorecardAction,
  type Period,
  type Scorecard,
  type ScorecardItem,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DepartmentScopeService } from '../org/department-scope.service.js';
import { ScorecardWorkflowService } from './scorecard-workflow.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { ScoreInput } from './dto/scoring.dto.js';
import {
  chotDiem,
  LoiChamDiem,
  tinhDiem,
  tranDiemCuaDong,
  type CotCham,
  type DongCham,
  type KetQuaCham,
} from './scoring/scoring-engine.js';

/** Phiếu kèm đúng những quan hệ mọi thao tác chấm điểm đều cần. */
type PhieuDayDu = Scorecard & {
  period: Period;
  items: ScorecardItem[];
  ownerUser: { id: string; fullName: string; isActive: boolean } | null;
};

/**
 * Chấm điểm phiếu KPI — luồng 2 (cuối kỳ).
 *
 * TÁCH RIÊNG khỏi `ScorecardAssignService` (luồng giao KPI đầu kỳ) vì hai
 * luồng chạy độc lập trên cùng một phiếu, và trộn vào một file thì không
 * còn nhìn ra trạng thái nào thuộc luồng nào.
 *
 * Mọi phép tính điểm gọi engine ở `scoring/scoring-engine.ts`. Service này
 * KHÔNG tự cộng điểm, không tự so trần, không tự xếp loại — làm vậy là có
 * hai chỗ tính cùng một con số.
 */
@Injectable()
export class ScorecardScoringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentScope: DepartmentScopeService,
    private readonly workflow: ScorecardWorkflowService,
  ) {}

  // ------------------------------------------------------------------ đọc

  /** Cây tiêu chí kèm hai cột điểm và điểm TÍNH THỬ của cả hai cột. */
  async getScoring(id: string, user: AuthenticatedUser) {
    const phieu = await this.mustFind(id);
    await this.assertCoTheXem(phieu, user);

    const dongs = this.dongCham(phieu.items);
    // Điểm tính thử KHÔNG được để lỗi dữ liệu làm hỏng cả màn hình: phiếu
    // cũ có thể còn dòng vi phạm ràng buộc mới thêm về sau.
    const tuCham = this.tinhThu(dongs, 'self');
    const quanLy = this.tinhThu(dongs, 'manager');

    const laChuSoHuu = phieu.ownerUserId === user.id;
    const laNguoiCham = phieu.evaluatorId === user.id;
    const daKhoa = phieu.period.isLocked;
    const daKyNhan = phieu.assignStatus === AssignStatus.ACCEPTED;

    return {
      scorecard: {
        id: phieu.id,
        ownerUserId: phieu.ownerUserId,
        ownerName: phieu.ownerUser?.fullName ?? null,
        ownerIsActive: phieu.ownerUser?.isActive ?? true,
        departmentName: phieu.departmentName,
        jobTitleName: phieu.jobTitleName,
        periodId: phieu.periodId,
        periodName: phieu.period.name,
        periodIsLocked: daKhoa,
        evaluatorId: phieu.evaluatorId,
        assignStatus: phieu.assignStatus,
        resultStatus: phieu.resultStatus,
        selfScoredAt: phieu.selfScoredAt,
        managerScoredAt: phieu.managerScoredAt,
        rejectedAt: phieu.rejectedAt,
        rejectReason: phieu.rejectReason,
        receivedAt: phieu.receivedAt,
        noSelfScoreReason: phieu.noSelfScoreReason,
        // Điểm ĐÃ CHỐT, khác với điểm tính thử bên dưới
        selfTotalScore: phieu.selfTotalScore?.toString() ?? null,
        managerTotalScore: phieu.managerTotalScore?.toString() ?? null,
        grade: phieu.grade,
      },
      items: phieu.items
        .slice()
        .sort((a, b) => a.section.localeCompare(b.section) || a.displayOrder - b.displayOrder)
        .map((it) => ({
          id: it.id,
          parentId: it.parentId,
          section: it.section,
          displayOrder: it.displayOrder,
          name: it.name,
          description: it.description,
          measurementText: it.measurementText,
          measureMethod: it.measureMethod,
          targetValue: it.targetValue?.toString() ?? null,
          maxScale: it.maxScale,
          weight: it.weight.toString(),
          tranDiem: tranDiemCuaDong(it.section, it.maxScale).toString(),
          selfScore: it.selfScore?.toString() ?? null,
          selfComment: it.selfComment,
          managerScore: it.managerScore?.toString() ?? null,
          managerComment: it.managerComment,
          // Điểm và đóng góp TÍNH ĐỘNG — tiêu chí cha không lưu điểm.
          selfComputed: this.dongTinhThu(tuCham, it.id),
          managerComputed: this.dongTinhThu(quanLy, it.id),
        })),
      selfPreview: this.tomTat(tuCham),
      managerPreview: this.tomTat(quanLy),
      /**
       * Gợi ý cho giao diện biết nên hiện nút nào. ẨN NÚT KHÔNG PHẢI LÀ BẢO
       * MẬT — mọi endpoint bên dưới vẫn tự kiểm lại từ đầu.
       */
      permissions: {
        canEditSelfScores:
          laChuSoHuu &&
          daKyNhan &&
          !daKhoa &&
          (phieu.resultStatus === ResultStatus.PENDING ||
            phieu.resultStatus === ResultStatus.REJECTED),
        canEditManagerScores:
          laNguoiCham &&
          daKyNhan &&
          !daKhoa &&
          phieu.resultStatus !== ResultStatus.RECEIVED &&
          phieu.resultStatus !== ResultStatus.MANAGER_SCORED,
        canReject: laNguoiCham && !daKhoa && phieu.resultStatus === ResultStatus.SELF_SCORED,
        // Chỉ HCNS tiếp nhận. ADMIN cố ý KHÔNG có quyền này — xem
        // docs/no-ky-thuat.md mục Lát cắt 5.
        canReceive: user.role === Role.HR && phieu.resultStatus === ResultStatus.MANAGER_SCORED,
      },
    };
  }

  // ------------------------------------------------------------- cột tự chấm

  /** Lưu nháp cột tự chấm. KHÔNG sinh `ScorecardEvent` — nháp không phải sự kiện. */
  async saveSelfScores(id: string, scores: ScoreInput[], user: AuthenticatedUser) {
    const phieu = await this.mustFind(id);
    this.workflow.assertLaChuSoHuu(phieu, user);
    this.assertGhiDiemDuoc(phieu);
    this.assertTrangThaiChoTuCham(phieu);

    await this.luuDiem(phieu, scores, 'self');
    return this.getScoring(id, user);
  }

  /** Nhân viên nộp cột tự chấm. `PENDING`/`REJECTED` → `SELF_SCORED`. */
  async selfSubmit(id: string, user: AuthenticatedUser, ipAddress?: string) {
    const phieu = await this.mustFind(id);
    this.workflow.assertLaChuSoHuu(phieu, user);
    this.assertGhiDiemDuoc(phieu);
    this.assertTrangThaiChoTuCham(phieu);

    const { tongDiem } = this.chot(phieu.items, 'self');

    await this.prisma.$transaction((tx) =>
      this.workflow.ghiNhan(
        {
          scorecardId: id,
          action: ScorecardAction.SELF_SCORE,
          actor: user,
          resultStatus: ResultStatus.SELF_SCORED,
          selfTotalScore: tongDiem,
          ipAddress,
        },
        tx,
      ),
    );
    return this.getScoring(id, user);
  }

  // --------------------------------------------------- cột trưởng bộ phận

  /** Lưu nháp cột trưởng bộ phận. */
  async saveManagerScores(id: string, scores: ScoreInput[], user: AuthenticatedUser) {
    const phieu = await this.mustFind(id);
    await this.assertLaNguoiCham(phieu, user);
    this.assertGhiDiemDuoc(phieu);
    this.assertChuaChotDiem(phieu);

    await this.luuDiem(phieu, scores, 'manager');
    return this.getScoring(id, user);
  }

  /**
   * Trưởng bộ phận chốt điểm. `SELF_SCORED` → `MANAGER_SCORED`.
   *
   * Đây là chỗ DUY NHẤT ghi `managerTotalScore` và `grade`.
   */
  async managerSubmit(
    id: string,
    user: AuthenticatedUser,
    noSelfScoreReason?: string,
    ipAddress?: string,
  ) {
    const phieu = await this.mustFind(id);
    await this.assertLaNguoiCham(phieu, user);
    this.assertGhiDiemDuoc(phieu);

    const lyDoNghiViec = this.kiemDuongNghiViec(phieu, noSelfScoreReason);

    const { tongDiem, xepLoai } = this.chot(phieu.items, 'manager');

    await this.prisma.$transaction((tx) =>
      this.workflow.ghiNhan(
        {
          scorecardId: id,
          action: ScorecardAction.MANAGER_SCORE,
          actor: user,
          resultStatus: ResultStatus.MANAGER_SCORED,
          managerTotalScore: tongDiem,
          grade: xepLoai,
          noSelfScoreReason: lyDoNghiViec,
          ipAddress,
        },
        tx,
      ),
    );
    return this.getScoring(id, user);
  }

  /**
   * Trả phiếu về cho nhân viên tự chấm lại. `SELF_SCORED` → `REJECTED`.
   *
   * Vòng `REJECTED → SELF_SCORED` lặp bao nhiêu lần cũng được; mỗi lần một
   * dòng `ScorecardEvent` riêng.
   */
  async reject(id: string, reason: string, user: AuthenticatedUser, ipAddress?: string) {
    const phieu = await this.mustFind(id);
    await this.assertLaNguoiCham(phieu, user);
    this.assertGhiDiemDuoc(phieu);

    if (phieu.resultStatus !== ResultStatus.SELF_SCORED) {
      throw new ConflictException(
        'Chỉ trả lại được phiếu nhân viên đã tự chấm xong và nộp lên.',
      );
    }

    await this.prisma.$transaction((tx) =>
      this.workflow.ghiNhan(
        {
          scorecardId: id,
          action: ScorecardAction.REJECT,
          actor: user,
          comment: reason,
          resultStatus: ResultStatus.REJECTED,
          ipAddress,
        },
        tx,
      ),
    );
    return this.getScoring(id, user);
  }

  /** HCNS tiếp nhận phiếu đã chốt điểm. `MANAGER_SCORED` → `RECEIVED`. */
  async receive(id: string, user: AuthenticatedUser, ipAddress?: string) {
    const phieu = await this.mustFind(id);

    if (phieu.resultStatus !== ResultStatus.MANAGER_SCORED) {
      throw new ConflictException(
        'Chỉ tiếp nhận được phiếu trưởng bộ phận đã chốt điểm.',
      );
    }

    await this.prisma.$transaction((tx) =>
      this.workflow.ghiNhan(
        {
          scorecardId: id,
          action: ScorecardAction.RECEIVE,
          actor: user,
          resultStatus: ResultStatus.RECEIVED,
          ipAddress,
        },
        tx,
      ),
    );
    return this.getScoring(id, user);
  }

  // ------------------------------------------------------------ ghi điểm

  /**
   * Ghi điểm của MỘT cột.
   *
   * CẬP NHẬT MỘT PHẦN: chỉ đụng vào những dòng có trong payload. Dòng không
   * gửi lên giữ nguyên điểm cũ — người chấm 40 tiêu chí trong ba buổi thì
   * mỗi lần lưu chỉ gửi phần vừa gõ.
   */
  private async luuDiem(
    phieu: PhieuDayDu,
    scores: ScoreInput[],
    cot: CotCham,
  ): Promise<void> {
    const theoId = new Map(phieu.items.map((it) => [it.id, it]));
    const coCon = new Set(
      phieu.items.map((it) => it.parentId).filter((x): x is string => x !== null),
    );

    const capNhat = scores.map((s) => {
      const item = theoId.get(s.itemId);
      if (!item) {
        throw new BadRequestException(`Tiêu chí ${s.itemId} không thuộc phiếu này.`);
      }
      if (coCon.has(item.id)) {
        throw new BadRequestException(
          `Tiêu chí "${item.name}" có KPI con nên không nhập điểm trực tiếp; ` +
            'điểm tính từ các KPI con.',
        );
      }

      const diem = s.score === null || s.score === undefined ? null : new Prisma.Decimal(s.score);
      if (diem !== null) {
        // Dùng lại trần của engine, không viết lại phép so ở service.
        const tran = tranDiemCuaDong(item.section, item.maxScale);
        if (diem.greaterThan(tran)) {
          throw new BadRequestException(
            `Điểm của "${item.name}" là ${diem.toString()}, vượt trần ${tran.toString()} ` +
              `của mục ${item.section === KpiSection.COMPLIANCE ? 'chấp hành nội quy' : 'BSC công việc'}.`,
          );
        }
      }

      // Ghi chú HIỆU LỰC sau khi áp payload: `undefined` là giữ nguyên ghi
      // chú đã lưu, nên chấm vượt thang từ lần trước không bị bắt nhập lại.
      const ghiChuCu = cot === 'self' ? item.selfComment : item.managerComment;
      const ghiChu = s.comment === undefined ? ghiChuCu : (s.comment?.trim() || null);

      if (diem !== null && diem.greaterThan(item.maxScale) && !ghiChu) {
        throw new BadRequestException(
          `Điểm của "${item.name}" vượt thang ${item.maxScale} nên bắt buộc ghi chú lý do.`,
        );
      }

      return cot === 'self'
        ? { id: item.id, data: { selfScore: diem, selfComment: ghiChu } }
        : { id: item.id, data: { managerScore: diem, managerComment: ghiChu } };
    });

    // Một transaction cho cả lô: lưu nửa chừng thì màn hình và database lệch
    // nhau mà người dùng không biết dòng nào đã vào.
    await this.prisma.$transaction(
      capNhat.map((c) => this.prisma.scorecardItem.update({ where: { id: c.id }, data: c.data })),
    );
  }

  // ------------------------------------------------------------- quy tắc

  /**
   * Ba điều kiện chung của MỌI thao tác ghi điểm, kể cả lưu nháp.
   *
   * Trả 409 chứ không 400: yêu cầu không sai, chỉ là phiếu đang ở trạng thái
   * không nhận được — client thử lại sau khi mở kỳ thì vẫn dùng nguyên
   * payload cũ.
   */
  private assertGhiDiemDuoc(phieu: PhieuDayDu): void {
    if (phieu.assignStatus !== AssignStatus.ACCEPTED) {
      throw new ConflictException(
        'Phiếu chưa được ký nhận nên chưa chấm điểm được. ' +
          'Nhân viên phải ký nhận KPI đầu kỳ trước.',
      );
    }
    // CHỈ nhìn đúng kỳ của phiếu, KHÔNG đi ngược lên parentId: khoá kỳ quý
    // để chốt sổ quý không được kéo theo khoá cả ba kỳ tháng bên trong.
    if (phieu.period.isLocked) {
      throw new ConflictException(`Kỳ ${phieu.period.name} đã khoá sổ, không chấm điểm được nữa.`);
    }
  }

  /** Cột tự chấm chỉ mở ở PENDING và REJECTED. */
  private assertTrangThaiChoTuCham(phieu: PhieuDayDu): void {
    const mo =
      phieu.resultStatus === ResultStatus.PENDING ||
      phieu.resultStatus === ResultStatus.REJECTED;
    if (!mo) {
      throw new ConflictException(
        phieu.resultStatus === ResultStatus.SELF_SCORED
          ? 'Bạn đã nộp phiếu tự chấm rồi, đang chờ trưởng bộ phận chấm.'
          : 'Phiếu đã chốt điểm, không sửa cột tự chấm được nữa.',
      );
    }
  }

  /** Điểm đã chốt thì khoá lại — sửa sau khi chốt là sửa căn cứ tính lương. */
  private assertChuaChotDiem(phieu: PhieuDayDu): void {
    if (
      phieu.resultStatus === ResultStatus.MANAGER_SCORED ||
      phieu.resultStatus === ResultStatus.RECEIVED
    ) {
      throw new ConflictException('Phiếu đã chốt điểm, không sửa được nữa.');
    }
  }

  /**
   * Điều kiện trạng thái của `manager-submit`, kèm ngoại lệ người nghỉ việc.
   *
   * Trả về giá trị cần ghi vào `noSelfScoreReason` (hoặc `undefined` nếu
   * không phải ca nghỉ việc).
   */
  private kiemDuongNghiViec(phieu: PhieuDayDu, lyDo?: string): string | undefined {
    if (phieu.resultStatus === ResultStatus.SELF_SCORED) return undefined;

    this.assertChuaChotDiem(phieu);

    // Người đã nghỉ việc không tự chấm được nữa. Đây là đường DUY NHẤT chốt
    // phiếu mà cột tự chấm còn trống — và bắt buộc ghi lý do, để về sau còn
    // biết vì sao phiếu này chỉ có một cột.
    if (phieu.ownerUser && !phieu.ownerUser.isActive) {
      if (!lyDo?.trim()) {
        throw new BadRequestException(
          `${phieu.ownerUser.fullName} đã nghỉ việc và chưa tự chấm. ` +
            'Muốn chốt phiếu thì bắt buộc ghi lý do không có điểm tự chấm.',
        );
      }
      return lyDo.trim();
    }

    throw new ConflictException(
      'Nhân viên chưa nộp phiếu tự chấm. Chỉ chốt được sau khi nhân viên tự chấm xong.',
    );
  }

  /** Chốt điểm qua engine, đổi lỗi nghiệp vụ sang lỗi HTTP. */
  private chot(items: ScorecardItem[], cot: CotCham) {
    try {
      return chotDiem(this.dongCham(items), cot);
    } catch (e) {
      throw this.doiLoi(e, cot);
    }
  }

  private doiLoi(e: unknown, cot: CotCham): Error {
    if (!(e instanceof LoiChamDiem)) return e as Error;
    if (e.ma === 'CHUA_CHAM_DU') {
      return new BadRequestException({
        message:
          cot === 'self'
            ? 'Còn tiêu chí chưa tự chấm. Vui lòng chấm đủ trước khi nộp.'
            : 'Còn tiêu chí chưa chấm. Vui lòng chấm đủ trước khi chốt điểm.',
        code: e.ma,
        itemIds: e.itemIds ?? [],
      });
    }
    return new BadRequestException({ message: e.message, code: e.ma, itemId: e.itemId });
  }

  // --------------------------------------------------------- phân quyền

  /**
   * Ai được XEM phiếu: chủ phiếu, hoặc người có phòng ban của phiếu trong
   * phạm vi của mình.
   *
   * `getAccessibleDepartmentIds` là hàm phân quyền DUY NHẤT của dự án —
   * không viết lại phép lọc phòng ban ở đây.
   */
  private async assertCoTheXem(phieu: PhieuDayDu, user: AuthenticatedUser): Promise<void> {
    if (phieu.ownerUserId === user.id) return;
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (!trongPhamVi.includes(phieu.departmentId)) {
      throw new ForbiddenException('Bạn không có quyền xem phiếu KPI này');
    }
  }

  /**
   * Ai được CHẤM: đúng người được chốt ở `evaluatorId`, và phòng ban của
   * phiếu phải nằm trong phạm vi của người đó.
   *
   * Hai lớp chứ không một: `evaluatorId` chốt từ đầu kỳ có thể đã lạc hậu
   * (người chấm chuyển phòng, thôi làm trưởng bộ phận), lúc đó phạm vi mới
   * là thứ đúng.
   *
   * ADMIN và HR KHÔNG chấm thay, kể cả khi thấy được phiếu: chấm thay là
   * làm hỏng dấu vết ai chấm, mà điểm là căn cứ tính lương.
   */
  private async assertLaNguoiCham(phieu: PhieuDayDu, user: AuthenticatedUser): Promise<void> {
    if (phieu.evaluatorId !== user.id) {
      throw new ForbiddenException(
        'Chỉ người chấm được chỉ định trên phiếu mới chấm điểm được. Không ai chấm thay.',
      );
    }
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (!trongPhamVi.includes(phieu.departmentId)) {
      throw new ForbiddenException('Bạn không có quyền thao tác trên phòng ban này');
    }
  }

  // ------------------------------------------------------------- nội bộ

  private async mustFind(id: string): Promise<PhieuDayDu> {
    const phieu = await this.prisma.scorecard.findUnique({
      where: { id },
      include: {
        period: true,
        items: true,
        ownerUser: { select: { id: true, fullName: true, isActive: true } },
      },
    });
    if (!phieu) throw new NotFoundException('Không tìm thấy phiếu KPI');
    return phieu;
  }

  private dongCham(items: ScorecardItem[]): DongCham[] {
    return items.map((it) => ({
      id: it.id,
      parentId: it.parentId,
      name: it.name,
      section: it.section,
      maxScale: it.maxScale,
      weight: it.weight,
      selfScore: it.selfScore,
      managerScore: it.managerScore,
    }));
  }

  /**
   * Điểm tính thử cho màn hình. Dữ liệu hỏng thì trả `null` chứ không ném:
   * người dùng vẫn phải mở được phiếu để sửa chỗ hỏng.
   */
  private tinhThu(dongs: DongCham[], cot: CotCham): KetQuaCham | null {
    try {
      return tinhDiem(dongs, cot);
    } catch {
      return null;
    }
  }

  private dongTinhThu(kq: KetQuaCham | null, itemId: string) {
    const dong = kq?.dong.find((d) => d.itemId === itemId);
    return {
      diem: dong?.diem?.toString() ?? null,
      dongGop: dong?.dongGop?.toString() ?? null,
    };
  }

  private tomTat(kq: KetQuaCham | null) {
    if (!kq) return null;
    return {
      tongDiem: kq.tongDiem.toString(),
      xepLoai: kq.xepLoai,
      daChamDu: kq.daChamDu,
      thieuDiem: kq.thieuDiem,
    };
  }
}
