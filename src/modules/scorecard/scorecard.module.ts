import { Module } from '@nestjs/common';
import { ScorecardService } from './scorecard.service.js';
import { ScorecardQueryService } from './scorecard-query.service.js';
import { ScorecardAssignService } from './scorecard-assign.service.js';
import { ScorecardWorkflowService } from './scorecard-workflow.service.js';
import { ScorecardController } from './scorecard.controller.js';
import { OrgModule } from '../org/org.module.js';

@Module({
  // Cần DepartmentScopeService để lọc phiếu theo phạm vi phòng ban
  imports: [OrgModule],
  providers: [
    ScorecardService,
    ScorecardQueryService,
    ScorecardAssignService,
    ScorecardWorkflowService,
  ],
  controllers: [ScorecardController],
  exports: [ScorecardService],
})
export class ScorecardModule {}
