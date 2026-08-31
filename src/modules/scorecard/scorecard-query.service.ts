import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignStatus,
  Prisma,
  Role,
  TemplateStatus,
  type Scorecard,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DepartmentScopeService } from '../org/department-scope.service.js';
import { tongTrongSoCap1 } from './scorecard-validation.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type {
  ListScorecardsQuery,
  PaginatedScorecards,
  ScorecardSummary,
  ViecCanXuLy,
} from './dto/scorecard.dto.js';

const LIMIT_MAC_DINH = 50;

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
        period: { select: { code: true, name: true, submitDeadline: true, isLocked: true } },
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
    const kyHienTai = await this.kyGanNhat();
    const conLai = this.soNgayConLai(kyHienTai?.submitDeadline ?? null);

    // --- Ai cũng có thể có phiếu chờ ký ---
    const choKy = await this.prisma.scorecard.count({
      where: { ownerUserId: user.id, assignStatus: AssignStatus.PROPOSED },
    });
    if (choKy > 0) {
      viec.push({
        type: 'CHO_KY_NHAN',
        message:
          `Bạn có ${choKy} phiếu KPI chờ ký nhận` +
          (kyHienTai ? ` (${kyHienTai.name})` : ''),
        count: choKy,
        link: '/kpi/my',
        daysUntilDeadline: conLai,
      });
    }

    // --- Người chấm: phiếu chưa gửi đi ký ---
    const chuaGui = await this.prisma.scorecard.count({
      where: { evaluatorId: user.id, assignStatus: AssignStatus.DRAFT },
    });
    if (chuaGui > 0) {
      viec.push({
        type: 'CHUA_GUI_KY',
        message: `${chuaGui} phiếu KPI chưa gửi cho nhân viên ký nhận`,
        count: chuaGui,
        link: '/kpi/assign',
        daysUntilDeadline: conLai,
      });
    }

    const coYKien = await this.prisma.scorecard.count({
      where: { evaluatorId: user.id, assignStatus: AssignStatus.DISPUTED },
    });
    if (coYKien > 0) {
      viec.push({
        type: 'CO_Y_KIEN',
        message: `${coYKien} phiếu KPI bị nhân viên nêu ý kiến, chờ bạn xử lý`,
        count: coYKien,
        link: '/kpi/assign',
        daysUntilDeadline: conLai,
      });
    }

    // --- Quản lý và HR: người chưa được giao KPI trong kỳ hiện tại ---
    if (kyHienTai && user.role !== Role.STAFF) {
      const chuaGiao = await this.demNguoiChuaCoPhieu(kyHienTai.id, user);
      if (chuaGiao > 0) {
        viec.push({
          type: 'CHUA_GIAO_KPI',
          message: `${chuaGiao} nhân viên chưa được giao KPI ${kyHienTai.name}`,
          count: chuaGiao,
          link: '/kpi/assign',
          daysUntilDeadline: conLai,
        });
      }
    }

    return viec;
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
      where: { departmentId, isActive: true },
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

    const chucDanhThieuMau = [
      ...new Map(
        nhanVien
          .filter((u) => u.jobTitle && !coMau.has(u.jobTitle.id))
          .map((u) => [u.jobTitle!.id, { id: u.jobTitle!.id, name: u.jobTitle!.name }]),
      ).values(),
    ];

    const sanSang =
      phong.managerId !== null &&
      thieuChucDanh.length === 0 &&
      chucDanhThieuMau.length === 0 &&
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
      jobTitlesWithoutPublishedTemplate: chucDanhThieuMau,
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

  /** Kỳ tháng gần nhất còn hiệu lực, dùng làm mốc mặc định cho trang chủ. */
  private async kyGanNhat() {
    return this.prisma.period.findFirst({
      where: { type: 'MONTH' },
      orderBy: { startDate: 'desc' },
      select: { id: true, name: true, submitDeadline: true },
    });
  }

  private soNgayConLai(hanNop: Date | null): number | null {
    if (!hanNop) return null;
    const MOT_NGAY = 24 * 60 * 60 * 1000;
    return Math.ceil((hanNop.getTime() - Date.now()) / MOT_NGAY);
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
        isActive: true,
        id: { notIn: daCo.map((s) => s.ownerUserId!).filter(Boolean) },
      },
    });
  }
}
