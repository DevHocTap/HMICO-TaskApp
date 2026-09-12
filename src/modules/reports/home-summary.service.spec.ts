import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { Grade, Prisma, ResultStatus, Role } from '@prisma/client';
import { HomeSummaryService } from './home-summary.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DepartmentScopeService } from '../org/department-scope.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

const D = (n: number | string) => new Prisma.Decimal(n);

const KY = {
  id: 'ky-09',
  code: '2026-09',
  name: 'Tháng 09/2026',
  type: 'MONTH',
  startDate: new Date('2026-09-01'),
  endDate: new Date('2026-09-30'),
};

function nguoiDung(role: Role, departmentId: string | null = 'kt'): AuthenticatedUser {
  return { id: 'u1', email: 'a@hmico.vn', role, departmentId };
}

describe('HomeSummaryService', () => {
  const prisma = {
    period: { findFirst: vi.fn(), findMany: vi.fn() },
    user: { count: vi.fn(), groupBy: vi.fn() },
    department: { findMany: vi.fn() },
    kpiTemplate: { count: vi.fn() },
    auditLog: { count: vi.fn() },
    scorecard: { count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
  };
  const getAccessibleDepartmentIds = vi.fn();
  let service: HomeSummaryService;

  beforeEach(async () => {
    for (const bang of Object.values(prisma)) {
      for (const fn of Object.values(bang)) fn.mockReset();
    }
    getAccessibleDepartmentIds.mockReset().mockResolvedValue(['kt', 'rnd']);
    prisma.period.findFirst.mockResolvedValue(KY);

    const module = await Test.createTestingModule({
      providers: [
        HomeSummaryService,
        { provide: PrismaService, useValue: prisma },
        { provide: DepartmentScopeService, useValue: { getAccessibleDepartmentIds } },
      ],
    }).compile();
    service = module.get(HomeSummaryService);
  });

  describe('ADMIN', () => {
    it('đếm tài khoản, phòng thiếu trưởng (chỉ phòng có người), mẫu, thao tác 24h', async () => {
      prisma.user.count
        .mockResolvedValueOnce(200) // tổng
        .mockResolvedValueOnce(197) // hoạt động
        .mockResolvedValueOnce(3); // chưa đổi mật khẩu
      prisma.department.findMany.mockResolvedValue([
        { id: 'kt', name: 'Phòng Kỹ thuật', managerId: 'm1', _count: { users: 8 } },
        { id: 'kv', name: 'Phòng Kho vận', managerId: null, _count: { users: 9 } },
        { id: 'rong', name: 'Phòng Dự án', managerId: null, _count: { users: 0 } },
      ]);
      prisma.kpiTemplate.count.mockResolvedValueOnce(23).mockResolvedValueOnce(18);
      prisma.auditLog.count.mockResolvedValue(412);

      const ra = await service.tomTat(nguoiDung(Role.ADMIN, null));
      expect(ra).toMatchObject({
        role: 'ADMIN',
        period: { id: 'ky-09', code: '2026-09' },
        taiKhoanHoatDong: 197,
        tongTaiKhoan: 200,
        chuaDoiMatKhau: 3,
        soPhongBan: 3,
        phongThieuTruong: ['Phòng Kho vận'],
        mauDaXuatBan: 18,
        tongMau: 23,
        thaoTac24h: 412,
      });
    });

    it('mốc 24h tính từ thời điểm gọi', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.department.findMany.mockResolvedValue([]);
      prisma.kpiTemplate.count.mockResolvedValue(0);
      prisma.auditLog.count.mockResolvedValue(0);

      await service.tomTat(nguoiDung(Role.ADMIN, null), new Date('2026-09-11T10:00:00Z'));
      expect(prisma.auditLog.count).toHaveBeenCalledWith({
        where: { createdAt: { gte: new Date('2026-09-10T10:00:00Z') } },
      });
    });
  });

  describe('EXECUTIVE', () => {
    it('điểm trung bình trên TOÀN BỘ phiếu đã chốt, phòng dưới 80 vào danh sách chú ý', async () => {
      prisma.scorecard.count.mockResolvedValue(164);
      prisma.scorecard.aggregate.mockResolvedValue({
        _count: { _all: 118 },
        _avg: { managerTotalScore: D('88.2') },
      });
      prisma.scorecard.groupBy
        .mockResolvedValueOnce([
          { grade: Grade.COMPLETED, _count: { _all: 80 } },
          { grade: Grade.EXCEEDED, _count: { _all: 16 } },
          { grade: Grade.NEEDS_IMPROVEMENT, _count: { _all: 20 } },
          { grade: Grade.NOT_ACHIEVED, _count: { _all: 2 } },
        ])
        .mockResolvedValueOnce([
          { departmentId: 'kt', _avg: { managerTotalScore: D('91.2') } },
          { departmentId: 'kv', _avg: { managerTotalScore: D('76.4') } },
          { departmentId: 'kd', _avg: { managerTotalScore: D('78.9') } },
          { departmentId: 'dung80', _avg: { managerTotalScore: D('80') } },
        ]);
      prisma.department.findMany.mockResolvedValue([
        { id: 'kv', name: 'Phòng Kho vận' },
        { id: 'kd', name: 'Phòng Kinh doanh HCM' },
      ]);

      const ra = await service.tomTat(nguoiDung(Role.EXECUTIVE));
      expect(ra).toMatchObject({
        role: 'EXECUTIVE',
        soPhieuTrongKy: 164,
        soPhieuDaChot: 118,
        diemTrungBinh: '88.20',
        soNguoiDat: 96,
        soNguoiCanCaiThien: 22,
        // Thấp nhất lên đầu; đúng 80 KHÔNG bị liệt kê (ngưỡng là "dưới 80")
        phongCanChuY: [
          { departmentName: 'Phòng Kho vận', diemTrungBinh: '76.40' },
          { departmentName: 'Phòng Kinh doanh HCM', diemTrungBinh: '78.90' },
        ],
      });
    });

    it('chưa có kỳ tháng thì trả bộ số rỗng, không truy vấn phiếu', async () => {
      prisma.period.findFirst.mockResolvedValue(null);
      const ra = await service.tomTat(nguoiDung(Role.EXECUTIVE));
      expect(ra).toMatchObject({ period: null, soPhieuTrongKy: 0, diemTrungBinh: null });
      expect(prisma.scorecard.count).not.toHaveBeenCalled();
    });
  });

  describe('HR', () => {
    it('phòng "nộp đủ" khi mọi nhân sự diện KPI đều có phiếu đã chốt', async () => {
      prisma.user.groupBy.mockResolvedValue([
        { departmentId: 'kt', _count: { _all: 8 } },
        { departmentId: 'kv', _count: { _all: 9 } },
        { departmentId: 'kd', _count: { _all: 4 } },
        { departmentId: null, _count: { _all: 1 } }, // chưa gán phòng — không tính là phòng
      ]);
      prisma.scorecard.groupBy
        .mockResolvedValueOnce([
          { resultStatus: ResultStatus.PENDING, _count: { _all: 10 } },
          { resultStatus: ResultStatus.MANAGER_SCORED, _count: { _all: 6 } },
          { resultStatus: ResultStatus.RECEIVED, _count: { _all: 5 } },
        ])
        .mockResolvedValueOnce([
          { departmentId: 'kt', _count: { _all: 8 } },
          { departmentId: 'kv', _count: { _all: 3 } },
        ]);
      prisma.department.findMany.mockResolvedValue([
        { id: 'kv', name: 'Phòng Kho vận' },
        { id: 'kd', name: 'Phòng Kinh doanh HCM' },
      ]);

      const ra = await service.tomTat(nguoiDung(Role.HR));
      expect(ra).toMatchObject({
        role: 'HR',
        soNhanSu: 22,
        soPhieuTrongKy: 21,
        soPhieuDaChot: 11,
        daTiepNhan: 5,
        phongDaNopDu: 1,
        tongPhongCoNhanSu: 3,
        phongConThieu: ['Phòng Kho vận', 'Phòng Kinh doanh HCM'],
      });
    });
  });

  describe('MANAGER', () => {
    it('đếm trong phạm vi phòng mình; "đã tự chấm" gồm cả phiếu đã chốt', async () => {
      getAccessibleDepartmentIds.mockResolvedValue(['kt']);
      prisma.user.count.mockResolvedValue(14);
      prisma.scorecard.count.mockResolvedValueOnce(14).mockResolvedValueOnce(11);
      prisma.scorecard.aggregate.mockResolvedValue({
        _count: { _all: 7 },
        _avg: { managerTotalScore: D('89.6') },
      });

      const ra = await service.tomTat(nguoiDung(Role.MANAGER));
      expect(ra).toMatchObject({
        role: 'MANAGER',
        soNhanSu: 14,
        soPhieuTrongKy: 14,
        daTuCham: 11,
        daChot: 7,
        diemTrungBinh: '89.60',
      });
      // Điều kiện "đã tự chấm" phải gồm SELF_SCORED + hai trạng thái đã chốt
      const goiThuHai = prisma.scorecard.count.mock.calls[1]![0];
      expect(goiThuHai.where.resultStatus.in.sort()).toEqual(
        ['MANAGER_SCORED', 'RECEIVED', 'SELF_SCORED'].sort(),
      );
    });

    it('chưa có phạm vi (chưa gán phòng) thì trả rỗng thay vì ném lỗi', async () => {
      getAccessibleDepartmentIds.mockResolvedValue([]);
      const ra = await service.tomTat(nguoiDung(Role.MANAGER, null));
      expect(ra).toMatchObject({ role: 'MANAGER', soNhanSu: 0, diemTrungBinh: null });
    });
  });

  describe('STAFF', () => {
    const kyTruoc = [
      { id: 'ky-08', name: 'Tháng 08/2026' },
      { id: 'ky-07', name: 'Tháng 07/2026' },
      { id: 'ky-06', name: 'Tháng 06/2026' },
    ];

    it('điểm tháng trước, trung bình các kỳ đã chốt (cũ → mới), tiêu chí lá chưa tự chấm', async () => {
      prisma.period.findMany.mockResolvedValue(kyTruoc);
      prisma.scorecard.findMany.mockResolvedValue([
        { periodId: 'ky-08', resultStatus: ResultStatus.RECEIVED, managerTotalScore: D('92.4'), grade: Grade.COMPLETED },
        { periodId: 'ky-07', resultStatus: ResultStatus.MANAGER_SCORED, managerTotalScore: D('90'), grade: Grade.COMPLETED },
        // Tháng 6 chưa chốt — KHÔNG được tính vào trung bình
        { periodId: 'ky-06', resultStatus: ResultStatus.SELF_SCORED, managerTotalScore: null, grade: null },
      ]);
      prisma.scorecard.findFirst.mockResolvedValue({
        id: 'sc-09',
        items: [{ selfScore: D(8) }, { selfScore: null }, { selfScore: null }, { selfScore: D(9) }],
      });

      const ra = await service.tomTat(nguoiDung(Role.STAFF));
      expect(ra).toEqual({
        role: 'STAFF',
        period: { id: 'ky-09', code: '2026-09', name: 'Tháng 09/2026' },
        thangTruoc: { periodName: 'Tháng 08/2026', diem: '92.40', grade: Grade.COMPLETED },
        trungBinhGanDay: {
          diem: '91.20',
          soPhieu: 2,
          periodNames: ['Tháng 07/2026', 'Tháng 08/2026'],
        },
        tuCham: { scorecardId: 'sc-09', chua: 2, tong: 4 },
      });
    });

    it('chỉ đọc phiếu của CHÍNH MÌNH, không đi qua phạm vi phòng ban', async () => {
      prisma.period.findMany.mockResolvedValue([]);
      prisma.scorecard.findMany.mockResolvedValue([]);
      prisma.scorecard.findFirst.mockResolvedValue(null);

      await service.tomTat(nguoiDung(Role.STAFF));
      expect(getAccessibleDepartmentIds).not.toHaveBeenCalled();
      expect(prisma.scorecard.findFirst.mock.calls[0]![0].where).toMatchObject({ ownerUserId: 'u1' });
    });

    it('tháng trước có kỳ nhưng chưa chốt thì điểm null, không phải 0', async () => {
      prisma.period.findMany.mockResolvedValue([kyTruoc[0]]);
      prisma.scorecard.findMany.mockResolvedValue([
        { periodId: 'ky-08', resultStatus: ResultStatus.SELF_SCORED, managerTotalScore: null, grade: null },
      ]);
      prisma.scorecard.findFirst.mockResolvedValue(null);

      const ra = await service.tomTat(nguoiDung(Role.STAFF));
      expect(ra).toMatchObject({
        thangTruoc: { periodName: 'Tháng 08/2026', diem: null, grade: null },
        trungBinhGanDay: null,
        tuCham: null,
      });
    });
  });
});
