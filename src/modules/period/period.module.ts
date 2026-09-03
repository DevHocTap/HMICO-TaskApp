import { Module } from '@nestjs/common';
import { PeriodService } from './period.service.js';
import { PeriodScheduler } from './period.scheduler.js';
import { PeriodController } from './period.controller.js';

@Module({
  controllers: [PeriodController],
  providers: [PeriodService, PeriodScheduler],
  exports: [PeriodService],
})
export class PeriodModule {}
