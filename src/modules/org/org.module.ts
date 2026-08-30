import { Module } from '@nestjs/common';
import { OrgService } from './org.service.js';
import { OrgController } from './org.controller.js';
import { DepartmentScopeService } from './department-scope.service.js';

@Module({
  providers: [OrgService, DepartmentScopeService],
  controllers: [OrgController],
  // DepartmentScopeService là hàm phân quyền dùng chung — mọi module cần
  // lọc dữ liệu theo phòng ban đều import OrgModule để lấy nó.
  exports: [DepartmentScopeService],
})
export class OrgModule {}
