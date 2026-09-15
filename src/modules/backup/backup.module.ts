import { Module } from '@nestjs/common';
import { BackupService } from './backup.service.js';
import { BackupScheduler } from './backup.scheduler.js';
import { BackupController } from './backup.controller.js';

@Module({
  providers: [BackupService, BackupScheduler],
  controllers: [BackupController],
})
export class BackupModule {}
