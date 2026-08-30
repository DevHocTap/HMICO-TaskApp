import { Module } from '@nestjs/common';
import { KpiTemplateService } from './kpi-template.service.js';
import { KpiTemplateController } from './kpi-template.controller.js';
import { OrgModule } from '../org/org.module.js';

@Module({
  // Cần DepartmentScopeService để lọc mẫu theo phạm vi phòng ban
  imports: [OrgModule],
  providers: [KpiTemplateService],
  controllers: [KpiTemplateController],
  exports: [KpiTemplateService],
})
export class KpiTemplateModule {}
