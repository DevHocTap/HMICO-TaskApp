import { Module } from '@nestjs/common';
import { PeriodService } from './period.service.js';
import { PeriodScheduler } from './period.scheduler.js';

@Module({
  providers: [PeriodService, PeriodScheduler],
  exports: [PeriodService],
})
export class PeriodModule {}
