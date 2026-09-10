import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AssignStatus, PeriodType, ResultStatus, Role, type Period } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DepartmentScopeService } from '../org/department-scope.service.js';
import { tinhTinhTrangHanNop } from '../period/period-calendar.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { chuanHoaNhanhCon, congDonTheoCay, type DongPhong } from './cong-don-cay.js';
import type { DongXuat } from './export-excel.service.js';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentScope: DepartmentScopeService,
  ) {}

  /**
   * Tiến độ nộp của từng phòng ban trong MỘT kỳ tháng.
   *
   * SỐ TRUY VẤN CỐ ĐỊNH — 5 câu, không tăng theo số phòng ban:
   *   1. kỳ đánh giá
   *   2. phạm vi phòng ban của người gọi (`getAccessibleDepartmentIds`)
   *   3. danh sách phòng ban
   *   4. groupBy nhân sự theo phòng
   *   5. groupBy phiếu theo (phòng, assignStatus, resultStatus)
   *
   * Đếm từng phòng bằng một câu riêng là 14 truy vấn cho 14 phòng hôm nay,
   * và tăng thẳng theo số phòng khi công ty mở thêm chi nhánh.
   */
  async submissionProgress(periodId: string, user: AuthenticatedUser) {
    const ky = await this.mustFindKyThang(periodId);
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    this.assertCoPhamVi(trongPhamVi, user);

    const phongBan = await this.prisma.department.findMany({
      where: { id: { in: trongPhamVi } },
      select: { id: true, name: true, parentId: true, code: true },
      orderBy: { code: 'asc' },
    });

    const [nhanSu, phieu] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['departmentId'],
        where: { isActive: true, departmentId: { in: trongPhamVi } },
        _count: { _all: true },
      }),
      this.prisma.scorecard.groupBy({
        by: ['departmentId', 'assignStatus', 'resultStatus'],
        where: { periodId: ky.id, departmentId: { in: trongPhamVi } },
        _count: { _all: true },
      }),
    ]);

    const soNhanSu = new Map(nhanSu.map((n) => [n.departmentId ?? '', n._count._all]));

    const thoDai = phongBan.map<DongPhong>((p) => {
      const cua = phieu.filter((x) => x.departmentId === p.id);
      const dem = (loc: (x: (typeof phieu)[number]) => boolean) =>
        cua.filter(loc).reduce((a, x) => a + x._count._all, 0);

      const tongNhanSu = soNhanSu.get(p.id) ?? 0;
      const tongPhieu = dem(() => true);
      const daKyNhan = (x: (typeof phieu)[number]) => x.assignStatus === AssignStatus.ACCEPTED;

      return {
        departmentId: p.id,
        departmentName: p.name,
        parentId: p.parentId,
        tongNhanSu,
        // Người chưa được sinh phiếu. Không bao giờ âm: phiếu của người đã
        // nghỉ việc vẫn còn trong kỳ nhưng họ không còn tính vào nhân sự.
        chuaCoPhieu: Math.max(tongNhanSu - tongPhieu, 0),
        chuaKyNhan: dem((x) => x.assignStatus !== AssignStatus.ACCEPTED),
        choTuCham: dem(
          (x) =>
            daKyNhan(x) &&
            (x.resultStatus === ResultStatus.PENDING ||
              x.resultStatus === ResultStatus.REJECTED),
        ),
        choTruongCham: dem((x) => daKyNhan(x) && x.resultStatus === ResultStatus.SELF_SCORED),
        choTiepNhan: dem((x) => daKyNhan(x) && x.resultStatus === ResultStatus.MANAGER_SCORED),
        daNop: dem((x) => daKyNhan(x) && x.resultStatus === ResultStatus.RECEIVED),
      };
    });

    return {
      period: { id: ky.id, code: ky.code, name: ky.name },
      /**
       * MỐC HẠN CHO VIỆC NỘP CHƯA CHỐT — vẫn chờ HCNS.
       *
       * Kỳ đã có sẵn `submitDeadline` (ngày 30), nhưng nó là hạn TRƯỞNG BỘ
       * PHẬN gửi kết quả, còn bảng này theo dõi tiến độ của cả bốn bước.
       * Gắn đại một cột vào đây là bịa ra con số đếm ngược không ai cam kết.
       *
       * Chốt xong thì đổi `null` thành `ky.submitDeadline` — `tinhTinhTrangHanNop()`
       * đã sẵn sàng, không phải sửa gì thêm.
       */
      ...tinhTinhTrangHanNop(null),
      departments: congDonTheoCay(chuanHoaNhanhCon(thoDai)),
    };
  }

  /**
   * Dữ liệu cho bản tổng hợp Excel: MỘT DÒNG MỖI NGƯỜI.
   *
   * Tập người = nhân sự đang làm việc trong phạm vi + người ĐÃ NGHỈ mà vẫn
   * có phiếu trong kỳ.
   *
   * Vế thứ hai không phải chi tiết vụn: lát cắt 5 cho phép chốt điểm phiếu
   * của người nghỉ giữa kỳ (kèm `noSelfScoreReason`). Chỉ lấy người đang
   * làm việc thì điểm đã chấm của họ biến mất khỏi file — mà file này là
   * căn cứ tính lương tháng đó.
   *
   * Hai truy vấn, không N+1.
   */
  async getExportData(
    periodId: string,
    user: AuthenticatedUser,
  ): Promise<{ ky: Period; dongs: DongXuat[] }> {
    const ky = await this.mustFindKyThang(periodId);
    const trongPhamVi = await this.departmentScope.getAccessibleDepartmentIds(user);
    this.assertCoPhamVi(trongPhamVi, user);

    const [nhanSu, phieu] = await Promise.all([
      this.prisma.user.findMany({
        where: { isActive: true, departmentId: { in: trongPhamVi } },
        select: {
          id: true,
          employeeCode: true,
          fullName: true,
          department: { select: { name: true } },
          jobTitle: { select: { name: true } },
        },
        orderBy: [{ department: { code: 'asc' } }, { employeeCode: 'asc' }],
      }),
      this.prisma.scorecard.findMany({
        where: { periodId: ky.id, departmentId: { in: trongPhamVi } },
        select: {
          ownerUserId: true,
          departmentName: true,
          jobTitleName: true,
          resultStatus: true,
          selfTotalScore: true,
          managerTotalScore: true,
          grade: true,
          managerScoredAt: true,
          receivedAt: true,
          noSelfScoreReason: true,
          evaluator: { select: { fullName: true } },
          ownerUser: { select: { employeeCode: true, fullName: true, isActive: true } },
        },
      }),
    ]);

    const phieuTheoNguoi = new Map(phieu.map((p) => [p.ownerUserId ?? '', p]));
    const dongs: DongXuat[] = [];

    for (const n of nhanSu) {
      const p = phieuTheoNguoi.get(n.id);
      dongs.push({
        employeeCode: n.employeeCode,
        fullName: n.fullName,
        // Tên phòng và chức danh lấy từ PHIẾU nếu có: phiếu chụp lại lúc lập,
        // nên người chuyển phòng giữa năm vẫn hiện đúng phòng của kỳ đó.
        departmentName: p?.departmentName ?? n.department?.name ?? '',
        jobTitleName: p?.jobTitleName ?? n.jobTitle?.name ?? null,
        resultStatus: p?.resultStatus ?? null,
        selfTotalScore: p?.selfTotalScore ?? null,
        managerTotalScore: p?.managerTotalScore ?? null,
        grade: p?.grade ?? null,
        evaluatorName: p?.evaluator?.fullName ?? null,
        managerScoredAt: p?.managerScoredAt ?? null,
        receivedAt: p?.receivedAt ?? null,
        noSelfScoreReason: p?.noSelfScoreReason ?? null,
      });
    }

    // Người đã nghỉ mà còn phiếu trong kỳ — thêm vào cuối, đánh dấu rõ.
    const daCo = new Set(nhanSu.map((n) => n.id));
    for (const p of phieu) {
      if (!p.ownerUserId || daCo.has(p.ownerUserId)) continue;
      dongs.push({
        employeeCode: p.ownerUser?.employeeCode ?? '',
        fullName: `${p.ownerUser?.fullName ?? ''} (đã nghỉ việc)`,
        departmentName: p.departmentName,
        jobTitleName: p.jobTitleName,
        resultStatus: p.resultStatus,
        selfTotalScore: p.selfTotalScore,
        managerTotalScore: p.managerTotalScore,
        grade: p.grade,
        evaluatorName: p.evaluator?.fullName ?? null,
        managerScoredAt: p.managerScoredAt,
        receivedAt: p.receivedAt,
        noSelfScoreReason: p.noSelfScoreReason,
      });
    }

    return { ky, dongs };
  }

  // ------------------------------------------------------------- nội bộ

  /**
   * Kỳ phải tồn tại VÀ phải là kỳ THÁNG.
   *
   * Phiếu KPI chỉ gắn vào kỳ tháng; kỳ quý và kỳ năm chỉ để tổng hợp. Trả
   * bảng rỗng cho kỳ quý sẽ khiến người dùng tin là "quý này chưa ai nộp",
   * còn tự quy đổi sang ba kỳ tháng bên trong là đoán ý người dùng.
   */
  private async mustFindKyThang(periodId: string): Promise<Period> {
    const ky = await this.prisma.period.findUnique({ where: { id: periodId } });
    if (!ky) throw new NotFoundException('Không tìm thấy kỳ đánh giá');
    if (ky.type !== PeriodType.MONTH) {
      throw new BadRequestException(
        `Kỳ "${ky.name}" là kỳ ${ky.type === PeriodType.QUARTER ? 'quý' : 'năm'}. ` +
          'Phiếu KPI chỉ gắn với kỳ tháng, hãy chọn một kỳ tháng.',
      );
    }
    return ky;
  }

  /**
   * STAFF nhận phạm vi RỖNG từ `getAccessibleDepartmentIds` (quy ước của
   * hàm đó), nên phạm vi rỗng ở đây nghĩa là không được xem báo cáo.
   *
   * Chặn bằng thông điệp riêng thay vì trả bảng rỗng: bảng này lộ tình
   * trạng nộp của đồng nghiệp, im lặng trả rỗng thì không ai biết là bị
   * chặn hay thật sự chưa có dữ liệu.
   */
  private assertCoPhamVi(trongPhamVi: string[], user: AuthenticatedUser): void {
    if (trongPhamVi.length === 0) {
      throw new ForbiddenException(
        user.role === Role.STAFF
          ? 'Báo cáo này dành cho quản lý. Phiếu KPI của bạn xem ở mục "Phiếu KPI của tôi".'
          : 'Bạn chưa được gán phòng ban nào nên không xem được báo cáo này.',
      );
    }
  }
}
