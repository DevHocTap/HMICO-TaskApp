import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service.js';
import { ReportPeriodQuery } from './dto/reports.dto.js';
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
  constructor(private readonly reports: ReportsService) {}

  @Get('submission-progress')
  submissionProgress(
    @Query() query: ReportPeriodQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reports.submissionProgress(query.periodId, user);
  }
}
