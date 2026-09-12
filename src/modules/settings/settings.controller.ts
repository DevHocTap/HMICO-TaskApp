import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SettingsService } from './settings.service.js';
import { UpdateSettingsDto } from './dto/settings.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  ip?: string;
}

/**
 * Cài đặt hệ thống. Mọi vai ĐỌC được (nhân viên cần biết hạn tự chấm, ngưỡng
 * xếp loại); chỉ ADMIN và HR GHI — chốt 11/09/2026.
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.layKemThoiDiem();
  }

  @Put()
  @Roles(Role.ADMIN, Role.HR)
  update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.settings.capNhat(dto, user, req.ip);
  }
}
