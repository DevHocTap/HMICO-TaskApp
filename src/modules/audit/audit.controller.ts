import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuditQueryService } from './audit-query.service.js';
import { ListAuditLogsQuery } from './dto/audit.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

/**
 * Đọc nhật ký thao tác.
 *
 * CHỈ ĐỌC — không có endpoint sửa hay xoá, và sẽ không bao giờ có. Nhật ký
 * sửa được thì không còn là bằng chứng.
 *
 * `HR` và `MANAGER` KHÔNG vào được: nhật ký ghi lại chính thao tác của họ
 * (đặt lại mật khẩu, đổi vai trò, chấm điểm), nên cho họ đọc là để đối
 * tượng bị giám sát tự kiểm tra mình.
 */
@Roles(Role.ADMIN, Role.EXECUTIVE)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly queries: AuditQueryService) {}

  @Get()
  list(@Query() query: ListAuditLogsQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.queries.list(query, user);
  }
}
