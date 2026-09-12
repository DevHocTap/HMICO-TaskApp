import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditQueryService } from './audit-query.service.js';
import { AuditExcelService } from './audit-excel.service.js';
import { AuditController } from './audit.controller.js';

/**
 * @Global vì gần như mọi module nghiệp vụ đều phải ghi nhật ký. Bắt từng
 * module import lại chỉ tạo cơ hội quên.
 */
@Global()
@Module({
  providers: [AuditService, AuditQueryService, AuditExcelService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
