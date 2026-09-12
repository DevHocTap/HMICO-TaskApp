import { Injectable } from '@nestjs/common';
import {
  Grade,
  PeriodType,
  Prisma,
  ResultStatus,
  Role,
  TemplateStatus,
  type Period,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DepartmentScopeService } from '../org/department-scope.service.js';
import { NGUOI_CO_KPI } from '../scorecard/nguoi-co-kpi.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

/**
 * Phòng có điểm trung bình DƯỚI mốc này thì ban giám đốc cần để mắt.
 * 80 = ngưỡng dưới của xếp loại "Hoàn thành" (quy-tac-nghiep-vu.md mục 4),
 * chốt 11/09/2026.
 */
export const NGUONG_PHONG_CAN_CHU_Y = 80;

/** Phiếu đã có điểm của trưởng bộ phận — chỉ những phiếu này mới có số. */
const DA_CHOT: ResultStatus[] = [ResultStatus.MANAGER_SCORED, ResultStatus.RECEIVED];

/** Phiếu mà nhân viên đã nộp tự chấm ít nhất một lần và chưa bị trả lại. */
const DA_TU_CHAM: ResultStatus[] = [
  ResultStatus.SELF_SCORED,
  ResultStatus.MANAGER_SCORED,
  ResultStatus.RECEIVED,
];

interface KyTomTat {
  id: string;
  code: string;
  name: string;
}

export interface TomTatAdmin {
  role: 'ADMIN';
  period: KyTomTat | null;
  taiKhoanHoatDong: number;
  tongTaiKhoan: number;
  chuaDoiMatKhau: number;
  soPhongBan: number;
  phongThieuTruong: string[];
  mauDaXuatBan: number;
  tongMau: number;
  thaoTac24h: number;
}

export interface TomTatExecutive {
  role: 'EXECUTIVE';
  period: KyTomTat | null;
  soPhieuTrongKy: number;
  soPhieuDaChot: number;
  /** Trung bình trên TOÀN BỘ phiếu đã chốt trong phạm vi, không phải trung bình của các phòng. */
  diemTrungBinh: string | null;
  soNguoiDat: number;
  soNguoiCanCaiThien: number;
  phongCanChuY: { departmentName: string; diemTrungBinh: string }[];
}

export interface TomTatHr {
  role: 'HR';
  period: KyTomTat | null;
  soNhanSu: number;
  soPhieuTrongKy: number;
  soPhieuDaChot: number;
  daTiepNhan: number;
  phongDaNopDu: number;
  tongPhongCoNhanSu: number;
  phongConThieu: string[];
}

export interface TomTatManager {
  role: 'MANAGER';
  period: KyTomTat | null;
  soNhanSu: number;
  soPhieuTrongKy: number;
  daTuCham: number;
  daChot: number;
  diemTrungBinh: string | null;
}

export interface TomTatStaff {
  role: 'STAFF';
  period: KyTomTat | null;
  /** Phiếu kỳ THÁNG TRƯỚC; `diem` null khi chưa chốt hoặc không có phiếu. */
  thangTruoc: { periodName: string; diem: string | null; grade: Grade | null } | null;
  /** Trung bình các phiếu đã chốt của tối đa 3 kỳ gần nhất TRƯỚC kỳ hiện tại. */
  trungBinhGanDay: { diem: string; soPhieu: number; periodNames: string[] } | null;
  /** Tiêu chí lá chưa có điểm tự chấm trên phiếu kỳ hiện tại. */
  tuCham: { chua: number; tong: number; scorecardId: string } | null;
}

export type TomTatTrangChu =
  | TomTatAdmin
  | TomTatExecutive
  | TomTatHr
  | TomTatManager
  | TomTatStaff;

/**
 * Bộ số cho các thẻ trên trang chủ, theo VAI của người gọi.
 *
 * MỘT endpoint thay vì năm sáu endpoint đếm lẻ: trang chủ mở mỗi ngày nhiều
 * lần, mỗi vai chỉ cần đúng bộ số của mình, và một script curl kiểm được
 * cả năm bộ. Kỳ luôn là kỳ THÁNG chứa hôm nay — trang chủ nói về "bây giờ",
 * không có bộ chọn kỳ; muốn xem kỳ khác thì sang màn Tổng hợp KPI.
 *
 * Phạm vi phòng ban đi qua `getAccessibleDepartmentIds` như mọi báo cáo.
 * STAFF chỉ đọc phiếu của CHÍNH MÌNH (`ownerUserId`), không đụng phạm vi.
 */
@Injectable()
export class HomeSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentScope: DepartmentScopeService,
  ) {}

  async tomTat(user: AuthenticatedUser, homNay = new Date()): Promise<TomTatTrangChu> {
    const ky = await this.kyChuaNgay(homNay);
    switch (user.role) {
      case Role.ADMIN:
        return this.choAdmin(ky, homNay);
      case Role.EXECUTIVE:
        return this.choExecutive(ky, user);
      case Role.HR:
        return this.choHr(ky, user);
      case Role.MANAGER:
        return this.choManager(ky, user);
      default:
        return this.choStaff(ky, user);
    }
  }

  // ------------------------------------------------------------- ADMIN

  private async choAdmin(ky: Period | null, homNay: Date): Promise<TomTatAdmin> {
    const truoc24h = new Date(homNay.getTime() - 24 * 60 * 60 * 1000);

    const [tongTaiKhoan, taiKhoanHoatDong, chuaDoiMatKhau, phongBan, tongMau, mauDaXuatBan, thaoTac24h] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.user.count({ where: { isActive: true } }),
        this.prisma.user.count({ where: { isActive: true, mustChangePassword: true } }),
        this.prisma.department.findMany({
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            managerId: true,
            _count: { select: { users: { where: NGUOI_CO_KPI } } },
          },
          orderBy: { code: 'asc' },
        }),
        this.prisma.kpiTemplate.count({ where: { isActive: true } }),
        this.prisma.kpiTemplate.count({
          where: { isActive: true, status: TemplateStatus.PUBLISHED },
        }),
        this.prisma.auditLog.count({ where: { createdAt: { gte: truoc24h } } }),
      ]);

    return {
      role: 'ADMIN',
      period: this.tomTatKy(ky),
      taiKhoanHoatDong,
      tongTaiKhoan,
      chuaDoiMatKhau,
      soPhongBan: phongBan.length,
      // Chỉ phòng ĐANG CÓ nhân sự thuộc diện KPI mà thiếu trưởng: những
      // người đó không sinh được phiếu. Đơn vị rỗng người thì chưa cần
      // trưởng — cùng cách tách với readinessToanCongTy().
      phongThieuTruong: phongBan
        .filter((p) => p.managerId === null && p._count.users > 0)
        .map((p) => p.name),
      mauDaXuatBan,
      tongMau,
      thaoTac24h,
    };
  }

  // --------------------------------------------------------- EXECUTIVE

  private async choExecutive(
    ky: Period | null,
    user: AuthenticatedUser,
  ): Promise<TomTatExecutive> {
    const rong: TomTatExecutive = {
      role: 'EXECUTIVE',
      period: this.tomTatKy(ky),
      soPhieuTrongKy: 0,
      soPhieuDaChot: 0,
      diemTrungBinh: null,
      soNguoiDat: 0,
      soNguoiCanCaiThien: 0,
      phongCanChuY: [],
    };
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (!ky || trongPhamVi.length === 0) return rong;

    const trongKy = { periodId: ky.id, departmentId: { in: trongPhamVi } };
    const daChot = { ...trongKy, resultStatus: { in: DA_CHOT } };

    const [soPhieuTrongKy, tongHop, theoXepLoai, theoPhong] = await Promise.all([
      this.prisma.scorecard.count({ where: trongKy }),
      this.prisma.scorecard.aggregate({
        where: daChot,
        _count: { _all: true },
        _avg: { managerTotalScore: true },
      }),
      this.prisma.scorecard.groupBy({ by: ['grade'], where: daChot, _count: { _all: true } }),
      this.prisma.scorecard.groupBy({
        by: ['departmentId'],
        where: daChot,
        _avg: { managerTotalScore: true },
      }),
    ]);

    const dem = (loai: Grade[]) =>
      theoXepLoai
        .filter((x) => x.grade !== null && loai.includes(x.grade))
        .reduce((a, x) => a + x._count._all, 0);

    const phongDuoiNguong = theoPhong.filter(
      (x) => x._avg.managerTotalScore !== null && x._avg.managerTotalScore.lt(NGUONG_PHONG_CAN_CHU_Y),
    );
    const tenPhong = await this.tenPhongBan(phongDuoiNguong.map((x) => x.departmentId));

    return {
      ...rong,
      soPhieuTrongKy,
      soPhieuDaChot: tongHop._count._all,
      diemTrungBinh: this.lamTron(tongHop._avg.managerTotalScore),
      soNguoiDat: dem([Grade.COMPLETED, Grade.EXCEEDED]),
      soNguoiCanCaiThien: dem([Grade.NOT_ACHIEVED, Grade.NEEDS_IMPROVEMENT]),
      phongCanChuY: phongDuoiNguong
        .map((x) => ({
          departmentName: tenPhong.get(x.departmentId) ?? '',
          diemTrungBinh: x._avg.managerTotalScore!.toFixed(2),
        }))
        .sort((a, b) => Number(a.diemTrungBinh) - Number(b.diemTrungBinh)),
    };
  }

  // ---------------------------------------------------------------- HR

  private async choHr(ky: Period | null, user: AuthenticatedUser): Promise<TomTatHr> {
    const rong: TomTatHr = {
      role: 'HR',
      period: this.tomTatKy(ky),
      soNhanSu: 0,
      soPhieuTrongKy: 0,
      soPhieuDaChot: 0,
      daTiepNhan: 0,
      phongDaNopDu: 0,
      tongPhongCoNhanSu: 0,
      phongConThieu: [],
    };
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (trongPhamVi.length === 0) return rong;

    const [nhanSuTheoPhong, theoTrangThai, chotTheoPhong] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['departmentId'],
        where: { ...NGUOI_CO_KPI, departmentId: { in: trongPhamVi } },
        _count: { _all: true },
      }),
      ky
        ? this.prisma.scorecard.groupBy({
            by: ['resultStatus'],
            where: { periodId: ky.id, departmentId: { in: trongPhamVi } },
            _count: { _all: true },
          })
        : Promise.resolve([]),
      ky
        ? this.prisma.scorecard.groupBy({
            by: ['departmentId'],
            where: {
              periodId: ky.id,
              departmentId: { in: trongPhamVi },
              resultStatus: { in: DA_CHOT },
            },
            _count: { _all: true },
          })
        : Promise.resolve([]),
    ]);

    const demTrangThai = (loai: ResultStatus[]) =>
      theoTrangThai.filter((x) => loai.includes(x.resultStatus)).reduce((a, x) => a + x._count._all, 0);

    // "Nộp đủ" = mọi nhân sự thuộc diện KPI của phòng đều có phiếu đã chốt.
    // Chỉ xét phòng ĐANG CÓ nhân sự; đơn vị rỗng không có gì để nộp.
    const chotCua = new Map(chotTheoPhong.map((x) => [x.departmentId, x._count._all]));
    const phongCoNhanSu = nhanSuTheoPhong.filter((x) => x.departmentId !== null);
    const conThieu = phongCoNhanSu.filter(
      (x) => (chotCua.get(x.departmentId!) ?? 0) < x._count._all,
    );
    const tenPhong = await this.tenPhongBan(conThieu.map((x) => x.departmentId!));

    return {
      ...rong,
      soNhanSu: nhanSuTheoPhong.reduce((a, x) => a + x._count._all, 0),
      soPhieuTrongKy: demTrangThai(Object.values(ResultStatus)),
      soPhieuDaChot: demTrangThai(DA_CHOT),
      daTiepNhan: demTrangThai([ResultStatus.RECEIVED]),
      phongDaNopDu: phongCoNhanSu.length - conThieu.length,
      tongPhongCoNhanSu: phongCoNhanSu.length,
      phongConThieu: conThieu
        .map((x) => tenPhong.get(x.departmentId!) ?? '')
        .sort((a, b) => a.localeCompare(b, 'vi')),
    };
  }

  // ----------------------------------------------------------- MANAGER

  private async choManager(ky: Period | null, user: AuthenticatedUser): Promise<TomTatManager> {
    const rong: TomTatManager = {
      role: 'MANAGER',
      period: this.tomTatKy(ky),
      soNhanSu: 0,
      soPhieuTrongKy: 0,
      daTuCham: 0,
      daChot: 0,
      diemTrungBinh: null,
    };
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    if (trongPhamVi.length === 0) return rong;

    const soNhanSu = await this.prisma.user.count({
      where: { ...NGUOI_CO_KPI, departmentId: { in: trongPhamVi } },
    });
    if (!ky) return { ...rong, soNhanSu };

    const trongKy = { periodId: ky.id, departmentId: { in: trongPhamVi } };
    const [soPhieuTrongKy, daTuCham, chot] = await Promise.all([
      this.prisma.scorecard.count({ where: trongKy }),
      this.prisma.scorecard.count({ where: { ...trongKy, resultStatus: { in: DA_TU_CHAM } } }),
      this.prisma.scorecard.aggregate({
        where: { ...trongKy, resultStatus: { in: DA_CHOT } },
        _count: { _all: true },
        _avg: { managerTotalScore: true },
      }),
    ]);

    return {
      ...rong,
      soNhanSu,
      soPhieuTrongKy,
      daTuCham,
      daChot: chot._count._all,
      diemTrungBinh: this.lamTron(chot._avg.managerTotalScore),
    };
  }

  // ------------------------------------------------------------- STAFF

  private async choStaff(ky: Period | null, user: AuthenticatedUser): Promise<TomTatStaff> {
    const rong: TomTatStaff = {
      role: 'STAFF',
      period: this.tomTatKy(ky),
      thangTruoc: null,
      trungBinhGanDay: null,
      tuCham: null,
    };
    if (!ky) return rong;

    // Ba kỳ tháng gần nhất TRƯỚC kỳ hiện tại, mới nhất trước.
    const kyTruoc = await this.prisma.period.findMany({
      where: { type: PeriodType.MONTH, endDate: { lt: ky.startDate } },
      orderBy: { startDate: 'desc' },
      take: 3,
      select: { id: true, name: true },
    });

    const [phieuCu, phieuHienTai] = await Promise.all([
      this.prisma.scorecard.findMany({
        where: {
          ownerUserId: user.id,
          periodId: { in: kyTruoc.map((k) => k.id) },
        },
        select: { periodId: true, resultStatus: true, managerTotalScore: true, grade: true },
      }),
      this.prisma.scorecard.findFirst({
        where: { ownerUserId: user.id, periodId: ky.id },
        select: {
          id: true,
          items: {
            // Chỉ tiêu chí LÁ mới nhập điểm; tiêu chí có con tính từ con.
            where: { children: { none: {} } },
            select: { selfScore: true },
          },
        },
      }),
    ]);

    const phieuTheoKy = new Map(phieuCu.map((p) => [p.periodId, p]));
    const daChot = (p: { resultStatus: ResultStatus }) => DA_CHOT.includes(p.resultStatus);

    const kyGanNhat = kyTruoc[0];
    const phieuThangTruoc = kyGanNhat ? phieuTheoKy.get(kyGanNhat.id) : undefined;

    const phieuCoDiem = kyTruoc
      .map((k) => ({ k, p: phieuTheoKy.get(k.id) }))
      .filter((x): x is { k: (typeof kyTruoc)[number]; p: NonNullable<typeof x.p> } =>
        !!x.p && daChot(x.p) && x.p.managerTotalScore !== null,
      );
    const tongDiem = phieuCoDiem.reduce(
      (a, x) => a.plus(x.p.managerTotalScore!),
      new Prisma.Decimal(0),
    );

    return {
      ...rong,
      thangTruoc: kyGanNhat
        ? {
            periodName: kyGanNhat.name,
            diem:
              phieuThangTruoc && daChot(phieuThangTruoc)
                ? this.lamTron(phieuThangTruoc.managerTotalScore)
                : null,
            grade: phieuThangTruoc && daChot(phieuThangTruoc) ? phieuThangTruoc.grade : null,
          }
        : null,
      trungBinhGanDay:
        phieuCoDiem.length > 0
          ? {
              diem: tongDiem.div(phieuCoDiem.length).toFixed(2),
              soPhieu: phieuCoDiem.length,
              // Cũ → mới, để giao diện in "07 → 08 → 09"
              periodNames: phieuCoDiem.map((x) => x.k.name).reverse(),
            }
          : null,
      tuCham: phieuHienTai
        ? {
            scorecardId: phieuHienTai.id,
            tong: phieuHienTai.items.length,
            chua: phieuHienTai.items.filter((i) => i.selfScore === null).length,
          }
        : null,
    };
  }

  // ------------------------------------------------------------ nội bộ

  /** Kỳ THÁNG chứa ngày đã cho; `null` khi chưa được sinh. */
  private kyChuaNgay(ngay: Date): Promise<Period | null> {
    return this.prisma.period.findFirst({
      where: { type: PeriodType.MONTH, startDate: { lte: ngay }, endDate: { gte: ngay } },
    });
  }

  private tomTatKy(ky: Period | null): KyTomTat | null {
    return ky ? { id: ky.id, code: ky.code, name: ky.name } : null;
  }

  private async tenPhongBan(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const ds = await this.prisma.department.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    return new Map(ds.map((d) => [d.id, d.name]));
  }

  /** `null` chứ KHÔNG phải 0: "chưa ai chấm" khác "trung bình 0 điểm". */
  private lamTron(d: Prisma.Decimal | null): string | null {
    return d === null || d === undefined ? null : d.toFixed(2);
  }
}
