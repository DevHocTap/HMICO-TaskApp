import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PeriodService } from './period.service.js';
import { CreatePeriodDto, ListPeriodsQuery } from './dto/period.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  ip?: string;
}

/**
 * Kỳ đánh giá là dữ liệu TOÀN CÔNG TY, không thuộc phòng ban nào, nên không
 * đi qua `getAccessibleDepartmentIds`. Đọc mở cho ba vai trò quản trị;
 * MANAGER và STAFF không cần — họ chọn kỳ từ chính màn hình phiếu KPI.
 */
const VAI_TRO_DOC = [Role.ADMIN, Role.HR, Role.EXECUTIVE] as const;

@Controller('periods')
export class PeriodController {
  constructor(private readonly service: PeriodService) {}

  @Roles(...VAI_TRO_DOC)
  @Get()
  list(@Query() query: ListPeriodsQuery) {
    return this.service.list(query);
  }

  /**
   * Ba thao tác dưới đây CHỈ ADMIN.
   *
   * EXECUTIVE cố ý chỉ đọc: `quy-tac-nghiep-vu.md` mục 5.6 hiện ghi khoá kỳ
   * là quyền ADMIN. Đang có câu hỏi chờ HCNS về việc chuyển quyền chốt sổ
   * sang ban giám đốc — xem `docs/no-ky-thuat.md`. Chưa chốt thì chưa mở.
   */
  @Roles(Role.ADMIN)
  @Post()
  create(
    @Body() dto: CreatePeriodDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.create(dto, user, req.ip);
  }

  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':id/lock')
  lock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.lock(id, user, req.ip);
  }

  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':id/unlock')
  unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.service.unlock(id, user, req.ip);
  }
}
