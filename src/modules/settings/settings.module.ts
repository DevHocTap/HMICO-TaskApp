import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { SettingsController } from './settings.controller.js';
import { AuditModule } from '../audit/audit.module.js';

/**
 * @Global vì auth, org, period, scorecard đều đọc cài đặt — import lẻ ở
 * từng module chỉ thêm bốn dòng giống nhau.
 */
@Global()
@Module({
  imports: [AuditModule],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
