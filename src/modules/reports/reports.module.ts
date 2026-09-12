import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { ExportExcelService } from './export-excel.service.js';
import { HomeSummaryService } from './home-summary.service.js';
import { ReportsController } from './reports.controller.js';
import { OrgModule } from '../org/org.module.js';

@Module({
  // Cần DepartmentScopeService để lọc theo phạm vi phòng ban
  imports: [OrgModule],
  providers: [ReportsService, ExportExcelService, HomeSummaryService],
  controllers: [ReportsController],
})
export class ReportsModule {}
