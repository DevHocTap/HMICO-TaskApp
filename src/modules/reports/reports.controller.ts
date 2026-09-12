import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service.js';
import { ExportExcelService } from './export-excel.service.js';
import { HomeSummaryService } from './home-summary.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ReportPeriodQuery, ReportTrendQuery } from './dto/reports.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

/**
 * Báo cáo tổng hợp. CHỈ ĐỌC.
 *
 * `STAFF` bị chặn ở tầng `@Roles`: bảng tiến độ lộ tình trạng nộp của đồng
 * nghiệp. Phạm vi phòng ban của `MANAGER` do `getAccessibleDepartmentIds`
 * áp trong service, không phải ở đây — guard chỉ lọc thô theo vai trò.
 */
@Roles(Role.ADMIN, Role.HR, Role.EXECUTIVE, Role.MANAGER)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly excel: ExportExcelService,
    private readonly tomTatTrangChu: HomeSummaryService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Bộ số cho các thẻ trên trang chủ, theo vai của người gọi.
   *
   * MỞ CHO CẢ STAFF — ghi đè `@Roles` ở cấp class. STAFF chỉ nhận số của
   * chính phiếu mình (`HomeSummaryService.choStaff`), không có gì của
   * đồng nghiệp trong đó.
   */
  @Get('home-summary')
  @Roles(Role.ADMIN, Role.HR, Role.EXECUTIVE, Role.MANAGER, Role.STAFF)
  homeSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.tomTatTrangChu.tomTat(user);
  }

  @Get('submission-progress')
  submissionProgress(
    @Query() query: ReportPeriodQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.submissionProgress(query.periodId, user);
  }

  /**
   * Số liệu tổng hợp: đếm theo trạng thái, phân bố xếp loại, điểm trung
   * bình theo phòng. Chỉ phiếu ĐÃ CHỐT mới vào hai mục sau.
   */
  @Get('dashboard')
  dashboard(@Query() query: ReportPeriodQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.dashboard(query.periodId, user);
  }

  /** Xu hướng theo tháng cho biểu đồ đường — mặc định 6 kỳ, tối đa 24. */
  @Get('trend')
  trend(@Query() query: ReportTrendQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.reports.trend(query.periodId, query.months ?? 6, user);
  }

  /**
   * Bản tổng hợp một kỳ, mỗi người một dòng.
   *
   * GHI AUDITLOG MỖI LẦN XUẤT. Đây là file chứa điểm của cả phòng — căn cứ
   * tính lương — nên phải biết ai đã tải về, kỳ nào, bao nhiêu dòng. Không
   * ghi thì file rời khỏi hệ thống mà không để lại dấu vết nào.
   */
  @Get('export')
  async export(
    @Query() query: ReportPeriodQuery,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: { set: (h: Record<string, string>) => void },
  ): Promise<StreamableFile> {
    const { ky, dongs } = await this.reports.getExportData(query.periodId, user);
    const file = await this.excel.buildWorkbook(ky, dongs);
    const ten = this.excel.fileName(ky);

    await this.audit.log({
      actorId: user.id,
      entityType: 'Report',
      entityId: ky.id,
      action: 'EXPORT',
      after: { periodCode: ky.code, soDong: dongs.length, tenFile: ten },
    });

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${ten}"`,
      'Content-Length': String(file.length),
    });
    return new StreamableFile(file);
  }
}
