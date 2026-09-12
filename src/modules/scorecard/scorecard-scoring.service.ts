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
import { SettingsService } from '../settings/settings.service.js';
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
    private readonly settings: SettingsService,
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
        canReject:
          !daKhoa &&
          ((laNguoiCham && phieu.resultStatus === ResultStatus.SELF_SCORED) ||
            (this.settings.lay().chamDiem.choPhepTraLaiPhieuDaChot &&
              ((laNguoiCham && phieu.resultStatus === ResultStatus.MANAGER_SCORED) ||
                ((laNguoiCham || user.role === Role.HR || user.role === Role.ADMIN) &&
                  phieu.resultStatus === ResultStatus.RECEIVED)))),
        canReceive:
          (user.role === Role.HR || user.role === Role.ADMIN) &&
          phieu.resultStatus === ResultStatus.MANAGER_SCORED,
      },
    };
  }

  // ------------------------------------------------------------- cột tự chấm

  /** Lưu nháp cột tự chấm. KHÔNG sinh `ScorecardEvent` — nháp không phải sự kiện. */
  async saveSelfScores(id: string, scores: ScoreInput[], user: AuthenticatedUser) {
    const phieu = await this.mustFind(id);
    this.workflow.assertLaChuSoHuu(phieu, user);
    this.assertGhiDiemDuoc(phieu, 'self');

    await this.luuDiem(phieu, scores, 'self');
    return this.getScoring(id, user);
  }

  /** Nhân viên nộp cột tự chấm. `PENDING`/`REJECTED` → `SELF_SCORED`. */
  async selfSubmit(id: string, user: AuthenticatedUser, ipAddress?: string) {
    const phieu = await this.mustFind(id);
    this.workflow.assertLaChuSoHuu(phieu, user);
    this.assertGhiDiemDuoc(phieu, 'self');

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
    this.assertGhiDiemDuoc(phieu, 'manager');

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
    this.assertGhiDiemDuoc(phieu, 'manager');

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
    const choPhepTraLaiDaChot = this.settings.lay().chamDiem.choPhepTraLaiPhieuDaChot;

    // Cài đặt "cho phép trả lại phiếu đã chốt" (11/09/2026): mở thêm hai cửa
    // MANAGER_SCORED (người chấm rút lại điểm đã chốt) và RECEIVED (HCNS /
    // ADMIN trả phiếu mình đã tiếp nhận). Vẫn kiểm kỳ khoá và phiếu chưa ký
    // nhận như mọi cửa khác; điểm cũ không bị xoá, chỉ đổi trạng thái và ghi
    // một dòng ScorecardEvent kèm lý do.
    const daChot =
      phieu.resultStatus === ResultStatus.MANAGER_SCORED ||
      phieu.resultStatus === ResultStatus.RECEIVED;
    const laHcnsHoacAdmin = user.role === Role.HR || user.role === Role.ADMIN;

    if (daChot && choPhepTraLaiDaChot) {
      if (phieu.resultStatus === ResultStatus.RECEIVED) {
        if (!laHcnsHoacAdmin) await this.assertLaNguoiCham(phieu, user);
      } else {
        await this.assertLaNguoiCham(phieu, user);
      }
      this.assertPhieuMoDeSua(phieu);
    } else {
      if (laHcnsHoacAdmin) {
        throw new ForbiddenException(
          'Hành chính chỉ trả lại được phiếu đã tiếp nhận, và chỉ khi Cài đặt hệ thống cho phép.',
        );
      }
      await this.assertLaNguoiCham(phieu, user);
      this.assertGhiDiemDuoc(phieu, 'reject');
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

    // Item lạ: gom HẾT rồi mới báo, không ném ở dòng đầu tiên gặp phải.
    // Người dùng cần thấy đủ danh sách để biết payload sai chỗ nào.
    //
    // `theoId` chỉ chứa item của ĐÚNG phiếu này (truy vấn lọc theo
    // `scorecardId`), nên phép tra ở đây chính là chốt chặn "itemId phải
    // thuộc phiếu :id". Thiếu nó thì một người có quyền trên phiếu của mình
    // sẽ ghi được điểm lên phiếu bất kỳ ai khác chỉ bằng cách đổi itemId.
    const itemLa = scores.filter((s) => !theoId.has(s.itemId)).map((s) => s.itemId);
    if (itemLa.length > 0) {
      throw new BadRequestException({
        message: `${itemLa.length} tiêu chí trong yêu cầu không thuộc phiếu KPI này.`,
        code: 'ITEM_KHONG_THUOC_PHIEU',
        itemIds: itemLa,
      });
    }

    const capNhat = scores.map((s) => {
      const item = theoId.get(s.itemId)!;
      if (coCon.has(item.id)) {
        throw new BadRequestException(
          `Tiêu chí "${item.name}" có KPI con nên không nhập điểm trực tiếp; ` +
            'điểm tính từ các KPI con.',
        );
      }

      // Cập nhật MỘT PHẦN xuống tận từng trường:
      //   thiếu `score`      -> giữ nguyên điểm cũ
      //   `score: null`      -> xoá điểm
      // Gộp hai ca này lại thì payload chỉ sửa ghi chú sẽ lặng lẽ xoá mất điểm.
      //
      // Phân biệt bằng `undefined` chứ KHÔNG bằng `hasOwnProperty`: dự án
      // biên dịch ở `target: ES2023` nên `useDefineForClassFields` bật, và
      // class-transformer dựng DTO với ĐỦ mọi field đã khai — field không có
      // trong JSON vẫn tồn tại trên object với giá trị `undefined`.
      // `hasOwnProperty` vì vậy luôn trả true và không phân biệt được gì.
      const coGuiDiem = s.score !== undefined;
      const coGuiGhiChu = s.comment !== undefined;

      const diemCu = cot === 'self' ? item.selfScore : item.managerScore;
      const diem = coGuiDiem ? (s.score === null ? null : new Prisma.Decimal(s.score)) : diemCu;

      if (coGuiDiem && diem !== null) {
        // Dùng lại trần của engine, không viết lại phép so ở service.
        const tran = tranDiemCuaDong(item.section, item.maxScale);
        if (diem.greaterThan(tran)) {
          throw new BadRequestException(
            `Điểm của "${item.name}" là ${diem.toString()}, vượt trần ${tran.toString()} ` +
              `của mục ${item.section === KpiSection.COMPLIANCE ? 'chấp hành nội quy' : 'BSC công việc'}.`,
          );
        }
      }

      const ghiChuCu = cot === 'self' ? item.selfComment : item.managerComment;
      const ghiChu = coGuiGhiChu ? (s.comment?.trim() || null) : ghiChuCu;

      // So trên giá trị HIỆU LỰC sau khi áp payload, không so trên payload.
      // Xoá ghi chú trong khi điểm vẫn vượt thang cũng phải bị chặn — nếu
      // không, chấm 12 kèm lý do rồi xoá lý do đi là lách được ràng buộc.
      if (diem !== null && diem.greaterThan(item.maxScale) && !ghiChu) {
        throw new BadRequestException(
          `Điểm của "${item.name}" là ${diem.toString()}, vượt thang ${item.maxScale} ` +
            'nên bắt buộc có ghi chú lý do.',
        );
      }

      const data: Prisma.ScorecardItemUncheckedUpdateInput = {};
      if (coGuiDiem) {
        if (cot === 'self') data.selfScore = diem;
        else data.managerScore = diem;
      }
      if (coGuiGhiChu) {
        if (cot === 'self') data.selfComment = ghiChu;
        else data.managerComment = ghiChu;
      }
      return { id: item.id, data };
    });

    // Một transaction cho cả lô: lưu nửa chừng thì màn hình và database lệch
    // nhau mà người dùng không biết dòng nào đã vào.
    await this.prisma.$transaction(
      capNhat
        .filter((c) => Object.keys(c.data).length > 0)
        .map((c) => this.prisma.scorecardItem.update({ where: { id: c.id }, data: c.data })),
    );
  }

  // ------------------------------------------------------------- quy tắc

  /**
   * Điều kiện của MỌI thao tác ghi điểm, kể cả lưu nháp.
   *
   * Trả 409 chứ không 400: yêu cầu không sai, chỉ là phiếu đang ở trạng thái
   * không nhận được — client thử lại sau khi mở kỳ thì vẫn dùng nguyên
   * payload cũ.
   *
   * `cong` là cửa đang gõ, vì mỗi cửa mở ở một trạng thái khác nhau:
   *
   * | cửa       | mở khi                                                    |
   * |-----------|-----------------------------------------------------------|
   * | `self`    | PENDING, REJECTED                                         |
   * | `manager` | SELF_SCORED — hoặc PENDING/REJECTED nếu chủ phiếu đã nghỉ |
   * | `reject`  | SELF_SCORED                                               |
   *
   * SAU `RECEIVED` KHÔNG CÒN CỬA NÀO. Muốn chấm lại phiếu đã chốt thì phải
   * đi qua `reject` để quay về SELF_SCORED — có dòng ScorecardEvent, có
   * người chịu trách nhiệm. Ghi đè im lặng lên điểm đã chốt là sửa căn cứ
   * tính lương mà không để lại dấu vết.
   */
  /** Hai chốt chặn áp cho MỌI cửa ghi: phiếu đã ký nhận và kỳ chưa khoá sổ. */
  private assertPhieuMoDeSua(phieu: PhieuDayDu): void {
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

  private assertGhiDiemDuoc(phieu: PhieuDayDu, cong: 'self' | 'manager' | 'reject'): void {
    this.assertPhieuMoDeSua(phieu);
    if (phieu.resultStatus === ResultStatus.RECEIVED) {
      throw new ConflictException(
        'Phiếu đã được HCNS tiếp nhận, không sửa điểm được nữa.',
      );
    }

    if (cong === 'self') {
      const mo =
        phieu.resultStatus === ResultStatus.PENDING ||
        phieu.resultStatus === ResultStatus.REJECTED;
      if (!mo) {
        throw new ConflictException(
          phieu.resultStatus === ResultStatus.SELF_SCORED
            ? 'Bạn đã nộp phiếu tự chấm rồi, đang chờ trưởng bộ phận chấm. ' +
              'Muốn sửa thì đề nghị trưởng bộ phận trả phiếu lại.'
            : 'Phiếu đã chốt điểm, không sửa cột tự chấm được nữa.',
        );
      }
      return;
    }

    if (phieu.resultStatus === ResultStatus.SELF_SCORED) return;

    // Ngoại lệ DUY NHẤT: người đã nghỉ việc không tự chấm được nữa, nên cột
    // trưởng bộ phận phải mở ngay từ PENDING. Lý do bắt buộc ghi ở
    // `kiemDuongNghiViec()` lúc chốt.
    const laCuaNguoiDaNghi =
      cong === 'manager' &&
      phieu.ownerUser !== null &&
      !phieu.ownerUser.isActive &&
      (phieu.resultStatus === ResultStatus.PENDING ||
        phieu.resultStatus === ResultStatus.REJECTED);
    if (laCuaNguoiDaNghi) return;

    throw new ConflictException(
      phieu.resultStatus === ResultStatus.MANAGER_SCORED
        ? 'Phiếu đã chốt điểm. Muốn chấm lại thì phải trả phiếu về cho nhân viên trước.'
        : 'Nhân viên chưa nộp phiếu tự chấm. Chỉ chấm được sau khi nhân viên tự chấm xong.',
    );
  }

  /**
   * Lý do cần ghi vào `noSelfScoreReason` khi chốt, hoặc `undefined` nếu
   * đây là ca bình thường.
   *
   * Tới được đây nghĩa là `assertGhiDiemDuoc` đã cho qua, nên trạng thái chỉ
   * còn hai khả năng: SELF_SCORED (bình thường), hoặc chủ phiếu đã nghỉ việc.
   */
  private kiemDuongNghiViec(phieu: PhieuDayDu, lyDo?: string): string | undefined {
    if (phieu.resultStatus === ResultStatus.SELF_SCORED) return undefined;

    if (!lyDo?.trim()) {
      throw new BadRequestException(
        `${phieu.ownerUser?.fullName ?? 'Nhân viên'} đã nghỉ việc và chưa tự chấm. ` +
          'Muốn chốt phiếu thì bắt buộc ghi lý do không có điểm tự chấm.',
      );
    }
    return lyDo.trim();
  }

  /** Chốt điểm qua engine, đổi lỗi nghiệp vụ sang lỗi HTTP. */
  private chot(items: ScorecardItem[], cot: CotCham) {
    try {
      return chotDiem(this.dongCham(items), cot, this.settings.lay().nguongXepLoai);
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
      return tinhDiem(dongs, cot, this.settings.lay().nguongXepLoai);
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
