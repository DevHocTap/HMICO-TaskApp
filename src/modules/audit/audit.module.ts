import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/**
 * @Global vì gần như mọi module nghiệp vụ đều phải ghi nhật ký. Bắt từng
 * module import lại chỉ tạo cơ hội quên.
 */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
