import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignStatus,
  ResultStatus,
  Prisma,
  Role,
  TemplateStatus,
  type Scorecard,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DepartmentScopeService } from '../org/department-scope.service.js';
import {
  homNayDangNgay,
  tinhTinhTrangHanNop,
} from '../period/period-calendar.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type {
  AssignmentBoardQuery,
  AssignmentBoardRow,
  ListScorecardsQuery,
  PaginatedScorecards,
  ViecCanXuLy,
} from './dto/scorecard.dto.js';
import { PhamViGiaoKpi } from './dto/scorecard.dto.js';

const LIMIT_MAC_DINH = 50;

import { NGUOI_CO_KPI, VAI_TRO_KHONG_AP_KPI } from './nguoi-co-kpi.js';

/**
 * Hạn của việc ĐẦU KỲ là `Period.assignDeadline` — ngày 25 THÁNG TRƯỚC.
 *
 * HCNS chốt 03/09/2026 (câu A2, khẳng định lại 04/09): ngày 25 hàng tháng
 * trưởng phòng lên KPI cho tháng sau. Toàn bộ nhóm việc đầu kỳ — giao KPI,
 * gửi ký, ký nhận, xử lý ý kiến — phục vụ đúng một cái mốc đó: sang ngày
 * đầu tháng thì KPI của tháng phải chốt xong.
 *
 * Bản trước gắn hạn NỘP KẾT QUẢ (ngày 02 tháng kế tiếp, lịch cũ đã bỏ) cho
 * nhóm này, rồi phải tháo ra vì nó bịa một hạn HCNS chưa đặt. Nay đã có hạn
 * thật thì dùng hạn thật.
 *
 * LÁT CẮT 5 (chấm điểm) dùng mốc KHÁC — `selfScoreDeadline` (25),
 * `managerScoreDeadline` (29), `submitDeadline` (30). Đừng dùng
 * `assignDeadline` cho việc cuối kỳ.
 *
 * MỘT CHỖ TÔI SUY, chưa hỏi lại HCNS: `CHO_KY_NHAN` (nhân viên ký nhận)
 * cũng lấy `assignDeadline`. HCNS chỉ nói ngày 25 là hạn TRƯỞNG PHÒNG lên
 * KPI, không nói hạn nhân viên ký. Coi chữ ký là phần cuối của việc "lên
 * KPI" là cách đọc hợp lý nhất, nhưng vẫn là suy diễn — xem
 * `docs/no-ky-thuat.md`.
 */
const KHONG_CO_HAN = { daysUntilDeadline: null, isOverdue: false } as const;

/**
 * Hạn SỚM NHẤT trong danh sách, bỏ qua kỳ không có hạn.
 *
 * Một việc gộp nhiều phiếu ở nhiều kỳ thì chỉ hiện được MỘT con số đếm
 * ngược. Lấy cái gấp nhất: hiện hạn muộn nhất là ru ngủ người dùng về đúng
 * cái phiếu đã quá hạn.
 *
 * Trả `null` khi không phiếu nào có hạn — kỳ quý và kỳ năm để `NULL` cả bốn
 * mốc (mục 5.5), và phiếu chỉ gắn vào kỳ tháng nên ca này gần như không xảy
 * ra; vẫn phải xử lý vì cột là nullable.
 */
function hanSomNhat(cac: readonly (Date | null)[]): Date | null {
  const co = cac.filter((d): d is Date => d !== null);
  if (co.length === 0) return null;
  return co.reduce((a, b) => (b < a ? b : a));
}

@Injectable()
export class ScorecardQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentScope: DepartmentScopeService,
  ) {}

  /**
   * Danh sách phiếu, phân trang, đã lọc theo phạm vi.
   *
   * Tổng trọng số và số item lấy bằng MỘT lệnh groupBy cho cả trang, không
   * nạp cây item của từng phiếu. Với 200 phiếu một kỳ, nạp cây từng phiếu
   * là 200 truy vấn và vài nghìn dòng chỉ để hiện một con số.
   */
  async list(
    query: ListScorecardsQuery,
    user: AuthenticatedUser,
  ): Promise<PaginatedScorecards> {
    const page = query.page ?? 1;
    const limit = query.limit ?? LIMIT_MAC_DINH;
    const where = await this.dieuKienPhamVi(query, user);

    const [rows, total] = await Promise.all([
      this.prisma.scorecard.findMany({
        where,
        include: {
          ownerUser: { select: { fullName: true, employeeCode: true } },
          evaluator: { select: { fullName: true } },
          period: { select: { code: true } },
        },
        orderBy: [{ departmentName: 'asc' }, { jobTitleName: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.scorecard.count({ where }),
    ]);

    const thongKe = await this.thongKeItem(rows.map((r) => r.id));

    return {
      data: rows.map((r) => ({
        id: r.id,
        ownerUserId: r.ownerUserId,
        ownerName: r.ownerUser?.fullName ?? null,
        employeeCode: r.ownerUser?.employeeCode ?? null,
        periodId: r.periodId,
        periodCode: r.period.code,
        departmentId: r.departmentId,
        departmentName: r.departmentName,
        jobTitleName: r.jobTitleName,
        evaluatorId: r.evaluatorId,
        evaluatorName: r.evaluator?.fullName ?? null,
        assignStatus: r.assignStatus,
        resultStatus: r.resultStatus,
        proposedAt: r.proposedAt,
        acceptedAt: r.acceptedAt,
        disputedAt: r.disputedAt,
        disputeReason: r.disputeReason,
        // Điểm ĐÃ CHỐT của hai cột — để thẻ "cần xử lý gấp" hiện điểm tự chấm
        // và độ lệch mà không phải mở từng phiếu
        selfTotalScore: r.selfTotalScore,
        managerTotalScore: r.managerTotalScore,
        grade: r.grade,
        selfScoredAt: r.selfScoredAt,
        managerScoredAt: r.managerScoredAt,
        totalWeight: thongKe.get(r.id)?.tongTrongSo ?? '0',
        itemCount: thongKe.get(r.id)?.soItem ?? 0,
      })),
      total,
      page,
      limit,
    };
  }

  /** Tổng trọng số cấp 1 và số item của nhiều phiếu, bằng hai lệnh gộp. */
  private async thongKeItem(
    scorecardIds: string[],
  ): Promise<Map<string, { tongTrongSo: string; soItem: number }>> {
    if (scorecardIds.length === 0) return new Map();

    const [cap1, tatCa] = await Promise.all([
      // Chỉ tiêu chí cấp 1 mới cộng vào tổng phiếu
      this.prisma.scorecardItem.groupBy({
        by: ['scorecardId'],
        where: { scorecardId: { in: scorecardIds }, parentId: null },
        _sum: { weight: true },
      }),
      this.prisma.scorecardItem.groupBy({
        by: ['scorecardId'],
        where: { scorecardId: { in: scorecardIds } },
        _count: { _all: true },
      }),
    ]);

    const soItem = new Map(tatCa.map((g) => [g.scorecardId, g._count._all]));
    return new Map(
      cap1.map((g) => [
        g.scorecardId,
        {
          tongTrongSo: (g._sum.weight ?? new Prisma.Decimal(0)).toString(),
          soItem: soItem.get(g.scorecardId) ?? 0,
        },
      ]),
    );
  }

  async getById(id: string, user: AuthenticatedUser) {
    const phieu = await this.prisma.scorecard.findUnique({
      where: { id },
      include: {
        ownerUser: { select: { fullName: true, employeeCode: true } },
        evaluator: { select: { fullName: true } },
        period: {
          select: { code: true, name: true, assignDeadline: true, submitDeadline: true, isLocked: true },
        },
        items: { orderBy: [{ section: 'asc' }, { displayOrder: 'asc' }] },
        events: {
          orderBy: { createdAt: 'desc' },
          include: { actor: { select: { fullName: true } } },
        },
      },
    });
    if (!phieu) throw new NotFoundException('Không tìm thấy phiếu KPI');
    await this.assertCoTheXem(phieu, user);
    return phieu;
  }

  async myScorecards(periodId: string | undefined, user: AuthenticatedUser) {
    return this.prisma.scorecard.findMany({
      where: { ownerUserId: user.id, ...(periodId ? { periodId } : {}) },
      include: { period: { select: { code: true, name: true, submitDeadline: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Việc đang chờ chính người này xử lý.
   *
   * Trả về danh sách VIỆC, không phải danh sách phiếu: trang chủ cần câu
   * chữ hiển thị được ngay và đường dẫn tới chỗ xử lý, chứ không phải dữ
   * liệu thô để tự suy diễn.
   *
   * Đây là thứ thay cho hệ thống thông báo — không bảng thông báo, không
   * chuông đếm, không đánh dấu đã đọc.
   */
  async pendingMyAction(user: AuthenticatedUser): Promise<ViecCanXuLy[]> {
    const viec: ViecCanXuLy[] = [];
    const ky = await this.kyHienTai();
    // Hạn cho việc "chưa ai được giao KPI trong kỳ này" — việc đó gắn với
    // CHÍNH kỳ hiện tại chứ không có phiếu nào để tra ngược. Không có kỳ nào
    // chứa hôm nay thì không có hạn: thà không hiện còn hơn hiện số bịa.
    const hanGiaoKpiKyNay = ky ? tinhTinhTrangHanNop(ky.assignDeadline) : KHONG_CO_HAN;

    // --- Ai cũng có thể có phiếu chờ ký ---
    //
    // Tên kỳ VÀ hạn đều lấy từ Period của CHÍNH PHIẾU ĐÓ, không lấy từ kỳ
    // hiện tại. Phiếu tháng 8 chưa ký mà sang tháng 9 mới mở trang chủ là
    // chuyện thường: đo theo kỳ hiện tại thì nhãn báo sai tháng, và việc đã
    // trễ cả tháng lại hiện "còn N ngày". Cách này cũng không phụ thuộc
    // `kyHienTai()` nên không bao giờ ra "(undefined)" hay "()".
    const phieuChoKy = await this.prisma.scorecard.findMany({
      where: { ownerUserId: user.id, assignStatus: AssignStatus.PROPOSED },
      select: { period: { select: { name: true, assignDeadline: true } } },
    });
    if (phieuChoKy.length > 0) {
      const tenKy = [...new Set(phieuChoKy.map((p) => p.period.name))];
      const nhan = tenKy.length === 1 ? tenKy[0] : `${tenKy.length} kỳ`;
      viec.push({
        type: 'CHO_KY_NHAN',
        message: `Bạn có ${phieuChoKy.length} phiếu KPI chờ ký nhận (${nhan})`,
        count: phieuChoKy.length,
        link: '/kpi/my',
        ...tinhTinhTrangHanNop(hanSomNhat(phieuChoKy.map((p) => p.period.assignDeadline))),
      });
    }

    // --- Người chấm: phiếu chưa gửi đi ký ---
    const phieuChuaGui = await this.prisma.scorecard.findMany({
      where: { evaluatorId: user.id, assignStatus: AssignStatus.DRAFT },
      select: { period: { select: { assignDeadline: true } } },
    });
    if (phieuChuaGui.length > 0) {
      viec.push({
        type: 'CHUA_GUI_KY',
        message: `${phieuChuaGui.length} phiếu KPI chưa gửi cho nhân viên ký nhận`,
        count: phieuChuaGui.length,
        link: '/kpi/assign',
        ...tinhTinhTrangHanNop(hanSomNhat(phieuChuaGui.map((p) => p.period.assignDeadline))),
      });
    }

    const phieuCoYKien = await this.prisma.scorecard.findMany({
      where: { evaluatorId: user.id, assignStatus: AssignStatus.DISPUTED },
      select: { period: { select: { assignDeadline: true } } },
    });
    if (phieuCoYKien.length > 0) {
      viec.push({
        type: 'CO_Y_KIEN',
        message: `${phieuCoYKien.length} phiếu KPI bị nhân viên nêu ý kiến, chờ bạn xử lý`,
        count: phieuCoYKien.length,
        link: '/kpi/assign',
        ...tinhTinhTrangHanNop(hanSomNhat(phieuCoYKien.map((p) => p.period.assignDeadline))),
      });
    }

    // --- Ban giám đốc: phiếu của trưởng bộ phận ---
    if (user.role === Role.EXECUTIVE && ky) {
      const idTruongBoPhan = (
        await this.prisma.department.findMany({
          where: { managerId: { not: null }, isActive: true },
          select: { managerId: true },
        })
      ).map((d) => d.managerId!);

      if (idTruongBoPhan.length > 0) {
        const chuaGuiKy = await this.prisma.scorecard.count({
          where: {
            periodId: ky.id,
            ownerUserId: { in: idTruongBoPhan },
            assignStatus: AssignStatus.DRAFT,
          },
        });
        if (chuaGuiKy > 0) {
          viec.push({
            type: 'BGD_CHUA_GUI_KY',
            message: `${chuaGuiKy} phiếu KPI của trưởng bộ phận chưa gửi ký nhận`,
            count: chuaGuiKy,
            link: '/kpi/assign',
            ...hanGiaoKpiKyNay,
          });
        }

        const daCoPhieu = (
          await this.prisma.scorecard.findMany({
            where: { periodId: ky.id, ownerUserId: { in: idTruongBoPhan } },
            select: { ownerUserId: true },
          })
        ).map((s) => s.ownerUserId);
        const chuaCoPhieu = idTruongBoPhan.filter((id) => !daCoPhieu.includes(id)).length;
        if (chuaCoPhieu > 0) {
          viec.push({
            type: 'BGD_CHUA_GIAO_KPI',
            message: `${chuaCoPhieu} trưởng bộ phận chưa có phiếu KPI ${ky.name}`,
            count: chuaCoPhieu,
            link: '/kpi/assign',
            ...hanGiaoKpiKyNay,
          });
        }
      }
    }

    // --- Chấm điểm cuối kỳ ---
    //
    // Hạn lấy từ đúng ba cột đã chốt ở mục 5.5, KHÔNG bịa thêm mốc nào:
    //
    //   tự chấm            -> selfScoreDeadline    (ngày 25)
    //   trưởng bộ phận chấm -> managerScoreDeadline (ngày 29)
    //   HCNS tiếp nhận      -> submitDeadline       (ngày 30)
    //
    // HẠN LẤY TỪ KỲ CỦA CHÍNH PHIẾU, không phải kỳ chứa hôm nay. Phiếu
    // tháng 8 chưa chấm mà sang tháng 9 mới mở trang chủ là chuyện thường;
    // đo theo kỳ hiện tại thì việc quá hạn cả tháng lại hiện "còn 15 ngày".
    //
    // Nhiều phiếu ở nhiều kỳ thì lấy hạn SỚM NHẤT — cái gấp nhất là cái
    // người dùng cần thấy.
    const phieuChoTuCham = await this.prisma.scorecard.findMany({
      where: {
        ownerUserId: user.id,
        assignStatus: AssignStatus.ACCEPTED,
        resultStatus: { in: [ResultStatus.PENDING, ResultStatus.REJECTED] },
      },
      select: {
        id: true,
        resultStatus: true,
        period: { select: { name: true, selfScoreDeadline: true } },
      },
    });
    if (phieuChoTuCham.length > 0) {
      const biTraLai = phieuChoTuCham.filter(
        (p) => p.resultStatus === ResultStatus.REJECTED,
      ).length;
      const tenKy = [...new Set(phieuChoTuCham.map((p) => p.period.name))];
      const nhan = tenKy.length === 1 ? tenKy[0] : `${tenKy.length} kỳ`;
      viec.push({
        type: 'CHO_TU_CHAM',
        message:
          biTraLai > 0
            ? `Bạn có ${phieuChoTuCham.length} phiếu KPI cần tự chấm (${nhan}), trong đó ${biTraLai} phiếu bị trả lại`
            : `Bạn có ${phieuChoTuCham.length} phiếu KPI cần tự chấm (${nhan})`,
        count: phieuChoTuCham.length,
        // Một phiếu thì vào thẳng, nhiều phiếu thì về danh sách để tự chọn.
        link:
          phieuChoTuCham.length === 1
            ? `/kpi/scorecards/${phieuChoTuCham[0].id}/scoring`
            : '/kpi/my',
        ...tinhTinhTrangHanNop(
          hanSomNhat(phieuChoTuCham.map((p) => p.period.selfScoreDeadline)),
        ),
      });
    }

    const phieuChoToiCham = await this.prisma.scorecard.findMany({
      where: {
        evaluatorId: user.id,
        assignStatus: AssignStatus.ACCEPTED,
        resultStatus: ResultStatus.SELF_SCORED,
      },
      select: { period: { select: { managerScoreDeadline: true } } },
    });
    if (phieuChoToiCham.length > 0) {
      viec.push({
        type: 'CHO_TOI_CHAM',
        message: `${phieuChoToiCham.length} phiếu KPI nhân viên đã tự chấm, chờ bạn cho điểm`,
        count: phieuChoToiCham.length,
        link: '/kpi/assign',
        ...tinhTinhTrangHanNop(
          hanSomNhat(phieuChoToiCham.map((p) => p.period.managerScoreDeadline)),
        ),
      });
    }

    if (user.role === Role.HR || user.role === Role.ADMIN) {
      // Ngày 30 là hạn TRƯỞNG BỘ PHẬN gửi kết quả về HCNS (mục 5.5). Trong
      // hệ thống không có thao tác "gửi" riêng — chốt điểm xong là phiếu nằm
      // chờ HCNS bấm tiếp nhận. Nên đây là hạn để MỌI phiếu đã về tới HCNS,
      // và HCNS chính là người cần nhìn thấy nó sắp hết.
      const phieuChoTiepNhan = await this.prisma.scorecard.findMany({
        where: { resultStatus: ResultStatus.MANAGER_SCORED },
        select: { period: { select: { submitDeadline: true } } },
      });
      if (phieuChoTiepNhan.length > 0) {
        viec.push({
          type: 'CHO_TIEP_NHAN',
          message: `${phieuChoTiepNhan.length} phiếu KPI đã chốt điểm, chờ HCNS tiếp nhận`,
          count: phieuChoTiepNhan.length,
          link: '/kpi/assign',
          ...tinhTinhTrangHanNop(
            hanSomNhat(phieuChoTiepNhan.map((p) => p.period.submitDeadline)),
          ),
        });
      }
    }

    // --- Quản lý và HR: người chưa được giao KPI trong kỳ hiện tại ---
    if (ky && user.role !== Role.STAFF && user.role !== Role.EXECUTIVE) {
      const chuaGiao = await this.demNguoiChuaCoPhieu(ky.id, user);
      if (chuaGiao > 0) {
        viec.push({
          type: 'CHUA_GIAO_KPI',
          message: `${chuaGiao} nhân viên chưa được giao KPI ${ky.name}`,
          count: chuaGiao,
          link: '/kpi/assign',
          ...hanGiaoKpiKyNay,
        });
      }
    }

    return viec;
  }

  // ------------------------------------------------ bảng giao KPI

  /**
   * Bảng giao KPI: MỘT dòng cho MỖI nhân viên, kể cả người CHƯA có phiếu.
   *
   * Endpoint RIÊNG, cố ý không nhập vào `GET /scorecards`. Cái đó là "danh
   * sách phiếu"; trả về người không có phiếu là cái tên nói dối, và nhiều
   * chỗ khác đang dựa vào ngữ nghĩa cũ.
   *
   * SỐ CÂU SQL CỐ ĐỊNH, không tăng theo số nhân viên:
   *   1. phạm vi phòng ban   2. cây con (chỉ khi lọc phòng)
   *   3. phòng ban để lấy tên và trưởng bộ phận
   *   4. nhân viên           5. phiếu đã có
   *   6. groupBy tổng trọng số cho CẢ trang
   *
   * Không nạp cây item của từng phiếu: với 200 người thì đó là 200 truy vấn
   * và vài nghìn dòng chỉ để hiện một con số.
   */
  async assignmentBoard(
    query: AssignmentBoardQuery,
    user: AuthenticatedUser,
  ): Promise<AssignmentBoardRow[]> {
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (trongPhamVi.length === 0) return [];

    let phongCanXem = trongPhamVi;
    if (query.departmentId) {
      // Kiểm thẳng trên danh sách vừa lấy, KHÔNG gọi assertPhongTrongPhamVi:
      // hàm đó nạp lại phạm vi lần nữa, tốn thêm một truy vấn cho cùng một
      // câu trả lời.
      if (!trongPhamVi.includes(query.departmentId)) {
        throw new ForbiddenException('Bạn không có quyền xem dữ liệu phòng ban này');
      }
      const cayCon = await this.departmentScope.getSubtreeIds(query.departmentId);
      phongCanXem = cayCon.filter((id) => trongPhamVi.includes(id));
    }

    const phongBan = await this.prisma.department.findMany({
      where: { id: { in: phongCanXem } },
      select: { id: true, name: true, managerId: true },
    });
    const tenPhong = new Map(phongBan.map((p) => [p.id, p.name]));
    const laTruongBoPhan = new Set(
      phongBan.map((p) => p.managerId).filter((x): x is string => !!x),
    );

    // Ban giám đốc không lọc phòng thì mặc định xem TRƯỞNG BỘ PHẬN toàn công
    // ty — đó là nhóm họ chịu trách nhiệm giao KPI (mục 5.0). Vai trò khác
    // muốn lọc như vậy thì truyền scope=managers.
    const chiTruongBoPhan =
      query.scope === PhamViGiaoKpi.MANAGERS ||
      (query.scope === undefined &&
        user.role === Role.EXECUTIVE &&
        !query.departmentId);

    const nhanVien = await this.prisma.user.findMany({
      where: {
        departmentId: { in: phongCanXem },
        ...NGUOI_CO_KPI,
        ...(chiTruongBoPhan ? { id: { in: [...laTruongBoPhan] } } : {}),
      },
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        departmentId: true,
        jobTitle: { select: { name: true } },
      },
    });
    if (nhanVien.length === 0) return [];

    const phieu = await this.prisma.scorecard.findMany({
      where: {
        periodId: query.periodId,
        ownerUserId: { in: nhanVien.map((u) => u.id) },
      },
      select: {
        id: true,
        ownerUserId: true,
        assignStatus: true,
        resultStatus: true,
        selfTotalScore: true,
        managerTotalScore: true,
        acceptedAt: true,
        evaluatorId: true,
        evaluator: { select: { fullName: true } },
      },
    });
    const phieuCua = new Map(phieu.map((p) => [p.ownerUserId!, p]));

    const tongTrongSo = await this.prisma.scorecardItem.groupBy({
      by: ['scorecardId'],
      where: { scorecardId: { in: phieu.map((p) => p.id) }, parentId: null },
      _sum: { weight: true },
    });
    const tongCua = new Map(
      tongTrongSo.map((t) => [t.scorecardId, t._sum.weight?.toString() ?? '0']),
    );

    const dong: AssignmentBoardRow[] = nhanVien.map((u) => {
      const p = phieuCua.get(u.id);
      return {
        userId: u.id,
        employeeCode: u.employeeCode,
        ownerName: u.fullName,
        jobTitleName: u.jobTitle?.name ?? null,
        departmentName: tenPhong.get(u.departmentId!) ?? '',
        isDepartmentManager: laTruongBoPhan.has(u.id),
        scorecardId: p?.id ?? null,
        assignStatus: p?.assignStatus ?? null,
        totalWeight: p ? (tongCua.get(p.id) ?? '0') : null,
        acceptedAt: p?.acceptedAt ?? null,
        evaluatorName: p?.evaluator?.fullName ?? null,
        resultStatus: p?.resultStatus ?? null,
        selfTotalScore: p?.selfTotalScore ?? null,
        managerTotalScore: p?.managerTotalScore ?? null,
        evaluatorId: p?.evaluatorId ?? null,
      };
    });

    // Người CHƯA có phiếu lên đầu: đó là việc còn phải làm, và màn hình này
    // tồn tại để chỉ ra đúng nhóm đó.
    const soSanh = new Intl.Collator('vi').compare;
    return dong.sort(
      (a, b) =>
        Number(!!a.scorecardId) - Number(!!b.scorecardId) ||
        soSanh(a.departmentName, b.departmentName) ||
        soSanh(a.ownerName, b.ownerName),
    );
  }

  // ------------------------------------------------- kiểm tra sẵn sàng

  /**
   * Ba thứ chặn việc giao KPI, gom về một chỗ để xử lý trước khi vào kỳ mới.
   *
   * Trưởng phòng bấm "Sinh phiếu" rồi mới biết thiếu dữ liệu là muộn; endpoint
   * này cho biết trước, và nói rõ thiếu ở đâu.
   */
  async readiness(departmentId: string, user: AuthenticatedUser) {
    await this.assertPhongTrongPhamVi(departmentId, user);

    const phong = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true, name: true, managerId: true },
    });
    if (!phong) throw new NotFoundException('Không tìm thấy phòng ban');

    const nhanVien = await this.prisma.user.findMany({
      where: { departmentId, ...NGUOI_CO_KPI },
      include: { jobTitle: { select: { id: true, name: true } } },
      orderBy: { employeeCode: 'asc' },
    });

    const chucDanhDangDung = [
      ...new Set(nhanVien.map((u) => u.jobTitle?.id).filter((x): x is string => !!x)),
    ];
    const coMau = new Set(
      (
        await this.prisma.kpiTemplate.findMany({
          where: {
            jobTitleId: { in: chucDanhDangDung },
            status: TemplateStatus.PUBLISHED,
            isActive: true,
            isSystem: false,
          },
          select: { jobTitleId: true },
        })
      ).map((t) => t.jobTitleId),
    );

    const mauHeThong = await this.prisma.kpiTemplate.findUnique({
      where: { code: 'SYS-COMPLIANCE' },
      select: { id: true },
    });

    const thieuChucDanh = nhanVien
      .filter((u) => !u.jobTitle)
      .map((u) => ({ userId: u.id, employeeCode: u.employeeCode, fullName: u.fullName }));

    // Trưởng bộ phận không tự chấm mình được. Không chỉ ra ở đây thì trưởng
    // phòng bấm "Sinh phiếu" xong mới biết phiếu của chính mình bị bỏ qua.
    const tuChamChinhMinh = nhanVien
      .filter((u) => phong.managerId !== null && u.id === phong.managerId)
      .map((u) => ({
        userId: u.id,
        employeeCode: u.employeeCode,
        fullName: u.fullName,
        reason:
          'Đang là trưởng bộ phận của chính phòng này, không tự chấm mình được. ' +
          'Cần chỉ định người chấm khác khi sinh phiếu.',
      }));

    const chucDanhThieuMau = [
      ...new Map(
        nhanVien
          .filter((u) => u.jobTitle && !coMau.has(u.jobTitle.id))
          .map((u) => [u.jobTitle!.id, { id: u.jobTitle!.id, name: u.jobTitle!.name }]),
      ).values(),
    ];

    // "Chức danh chưa có mẫu" là CẢNH BÁO, không phải lỗi chặn.
    // Với trưởng bộ phận thì không có mẫu là trạng thái BÌNH THƯỜNG — ban
    // giám đốc nhập KPI trực tiếp qua đường sinh phiếu rỗng.
    const sanSang =
      phong.managerId !== null &&
      thieuChucDanh.length === 0 &&
      mauHeThong !== null;

    return {
      departmentId: phong.id,
      departmentName: phong.name,
      ready: sanSang,
      totalEmployees: nhanVien.length,
      /** Phòng chưa có trưởng bộ phận thì chưa biết ai duyệt KPI. */
      missingDepartmentManager: phong.managerId === null,
      missingSystemTemplate: mauHeThong === null,
      employeesWithoutJobTitle: thieuChucDanh,
      /** Cảnh báo, không chặn: dùng đường sinh phiếu rỗng cho các chức danh này. */
      jobTitlesWithoutPublishedTemplate: chucDanhThieuMau.map((t) => ({
        ...t,
        suggestion:
          'Chưa có mẫu KPI xuất bản. Với chức danh quản lý, hiện dùng đường ' +
          'sinh phiếu rỗng (emptyTemplate) rồi nhập KPI trực tiếp — cách này ' +
          'HCNS mới xác nhận cho trưởng bộ phận, tổ trưởng còn chờ trả lời.',
      })),
      /** Người không thể tự chấm mình — cần chỉ định người chấm khác. */
      employeesNeedingExternalEvaluator: tuChamChinhMinh,
    };
  }

  /**
   * Kiểm tra sẵn sàng TOÀN CÔNG TY, gộp theo từng loại thiếu sót.
   *
   * Đây là dữ liệu để gửi HCNS một lần: việc nhập liệu là của người khác và
   * mất vài ngày, nên phải đưa họ danh sách đầy đủ chứ không phải bắt dò
   * từng phòng.
   */
  async readinessToanCongTy(user: AuthenticatedUser) {
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);

    const [phongBan, nhanVien, mauDaXuatBan, mauHeThong] = await Promise.all([
      this.prisma.department.findMany({
        where: { id: { in: trongPhamVi }, isActive: true },
        select: { id: true, code: true, name: true, managerId: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { departmentId: { in: trongPhamVi }, ...NGUOI_CO_KPI },
        include: {
          jobTitle: { select: { id: true, code: true, name: true } },
          department: { select: { code: true, name: true } },
        },
        orderBy: { employeeCode: 'asc' },
      }),
      this.prisma.kpiTemplate.findMany({
        where: { status: TemplateStatus.PUBLISHED, isActive: true, isSystem: false },
        select: { jobTitleId: true },
      }),
      this.prisma.kpiTemplate.findUnique({
        where: { code: 'SYS-COMPLIANCE' },
        select: { id: true },
      }),
    ]);

    const coMau = new Set(mauDaXuatBan.map((m) => m.jobTitleId));
    const laTruongBoPhan = new Set(
      phongBan.map((p) => p.managerId).filter((x): x is string => !!x),
    );
    const soBanGiamDoc = await this.prisma.user.count({
      where: { role: 'EXECUTIVE', isActive: true },
    });

    // Tách hai loại. Trộn chung thì người đọc không biết dòng nào cần sửa:
    // đơn vị tổ chức rỗng người chưa cần trưởng, còn phòng đang có nhân sự
    // mà thiếu trưởng thì những người đó KHÔNG sinh được phiếu.
    const chuaCoTruong = phongBan.filter((p) => p.managerId === null);
    const nguoiCuaPhong = (id: string) =>
      nhanVien.filter((u) => u.departmentId === id);

    const phongThieuTruong = chuaCoTruong
      .filter((p) => nguoiCuaPhong(p.id).length > 0)
      .map((p) => ({
        code: p.code,
        name: p.name,
        headcount: nguoiCuaPhong(p.id).length,
        blockedEmployees: nguoiCuaPhong(p.id).map((u) => ({
          employeeCode: u.employeeCode,
          fullName: u.fullName,
          role: u.role,
        })),
      }));

    const donViRong = chuaCoTruong
      .filter((p) => nguoiCuaPhong(p.id).length === 0)
      .map((p) => ({ code: p.code, name: p.name }));

    const nguoiThieuChucDanh = nhanVien
      .filter((u) => !u.jobTitle)
      .map((u) => ({
        employeeCode: u.employeeCode,
        fullName: u.fullName,
        department: u.department?.name ?? '(chưa có phòng)',
      }));

    const chucDanhThieuMau = [
      ...new Map(
        nhanVien
          .filter((u) => u.jobTitle && !coMau.has(u.jobTitle.id))
          .map((u) => [
            u.jobTitle!.id,
            {
              code: u.jobTitle!.code,
              name: u.jobTitle!.name,
              // Chức danh mà người giữ nó đang là trưởng bộ phận thì thiếu
              // mẫu là bình thường — ban giám đốc nhập KPI trực tiếp
              isManagerRole: laTruongBoPhan.has(u.id),
              headcount: nhanVien.filter((x) => x.jobTitle?.id === u.jobTitle!.id).length,
            },
          ]),
      ).values(),
    ];

    const truongBoPhan = nhanVien
      .filter((u) => laTruongBoPhan.has(u.id))
      .map((u) => ({
        employeeCode: u.employeeCode,
        fullName: u.fullName,
        department: u.department?.name ?? '',
        jobTitle: u.jobTitle?.name ?? '(chưa có chức danh)',
        hasPublishedTemplate: u.jobTitle ? coMau.has(u.jobTitle.id) : false,
      }));

    return {
      totalDepartments: phongBan.length,
      totalEmployees: nhanVien.length,
      missingSystemTemplate: mauHeThong === null,

      /**
       * CHẶN THẬT: phòng đang có nhân sự nhưng chưa có trưởng bộ phận.
       * Những người trong đó không sinh được phiếu KPI.
       */
      departmentsWithoutManager: phongThieuTruong,
      /**
       * BÌNH THƯỜNG, không cần sửa: đơn vị tổ chức chưa có nhân sự nào.
       * Chưa có người thì chưa cần trưởng bộ phận.
       */
      emptyOrgUnits: donViRong,
      /** Chặn: người chưa được gán chức danh. */
      employeesWithoutJobTitle: nguoiThieuChucDanh,
      /** Cảnh báo: chức danh chưa có mẫu KPI xuất bản. */
      jobTitlesWithoutPublishedTemplate: chucDanhThieuMau,

      /** Trưởng bộ phận và tình trạng mẫu của họ — do ban giám đốc chấm. */
      departmentManagers: truongBoPhan,
      executiveCount: soBanGiamDoc,
      /**
       * Có đúng một người thuộc ban giám đốc thì hệ thống tự gán làm người
       * chấm cho trưởng bộ phận; nhiều hơn một thì phải chọn tay khi sinh phiếu.
       */
      executiveAutoAssignable: soBanGiamDoc === 1,
    };
  }

  // -------------------------------------------------------------- nội bộ

  private async dieuKienPhamVi(
    query: ListScorecardsQuery,
    user: AuthenticatedUser,
  ): Promise<Prisma.ScorecardWhereInput> {
    const coBan: Prisma.ScorecardWhereInput = {
      periodId: query.periodId,
      ownerUserId: query.ownerUserId,
      assignStatus: query.assignStatus,
      resultStatus: query.resultStatus,
      evaluatorId: query.evaluatorId,
    };

    if (query.departmentId) {
      const cayCon = await this.departmentScope.getSubtreeIds(query.departmentId);
      coBan.departmentId = { in: cayCon };
    }

    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    // STAFF nhận phạm vi rỗng nên chỉ thấy phiếu của chính mình
    return {
      AND: [
        coBan,
        { OR: [{ departmentId: { in: trongPhamVi } }, { ownerUserId: user.id }] },
      ],
    };
  }

  private async assertCoTheXem(phieu: Scorecard, user: AuthenticatedUser): Promise<void> {
    if (phieu.ownerUserId === user.id) return;
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (!trongPhamVi.includes(phieu.departmentId)) {
      throw new ForbiddenException('Bạn không có quyền xem phiếu KPI này');
    }
  }

  private async assertPhongTrongPhamVi(
    departmentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (!trongPhamVi.includes(departmentId)) {
      throw new ForbiddenException('Bạn không có quyền xem dữ liệu phòng ban này');
    }
  }

  /**
   * Kỳ THÁNG chứa ngày hôm nay (theo giờ Việt Nam), dùng làm mốc mặc định
   * cho trang chủ.
   *
   * KHÔNG lấy kỳ có `startDate` muộn nhất: tác vụ tự sinh luôn tạo trước
   * tháng kế tiếp, nên "kỳ mới nhất" là tháng SAU chứ không phải tháng
   * đang chạy — mọi nhãn và mọi phép đếm ngược sẽ lệch nguyên một tháng.
   *
   * Không có kỳ nào chứa hôm nay thì trả `null`, không lấy đại kỳ khác.
   */
  private async kyHienTai() {
    const homNay = homNayDangNgay();
    return this.prisma.period.findFirst({
      where: {
        type: 'MONTH',
        startDate: { lte: homNay },
        endDate: { gte: homNay },
      },
      select: { id: true, name: true, assignDeadline: true },
    });
  }

  private async demNguoiChuaCoPhieu(
    periodId: string,
    user: AuthenticatedUser,
  ): Promise<number> {
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (trongPhamVi.length === 0) return 0;

    const daCo = await this.prisma.scorecard.findMany({
      where: { periodId, departmentId: { in: trongPhamVi } },
      select: { ownerUserId: true },
    });
    return this.prisma.user.count({
      where: {
        departmentId: { in: trongPhamVi },
        ...NGUOI_CO_KPI,
        id: { notIn: daCo.map((s) => s.ownerUserId!).filter(Boolean) },
      },
    });
  }
}
