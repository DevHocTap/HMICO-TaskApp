import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Put, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProfileService } from './profile.service.js';
import { UpdateEmployeeProfileDto, UpdateMyProfileDto } from './dto/profile.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  ip?: string;
}

/**
 * Hồ sơ nhân sự. `me/profile` đặt TRƯỚC `:id/profile` — NestJS khớp theo
 * thứ tự khai báo, để sau thì "me" bị ParseUUIDPipe từ chối.
 */
@Controller('users')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get('me/profile')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.profile.getMine(user);
  }

  @Patch('me/profile')
  updateMine(
    @Body() dto: UpdateMyProfileDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.profile.updateMine(dto, user, req.ip);
  }

  @Get(':id/profile')
  getByUserId(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.profile.getByUserId(id, user);
  }

  @Roles(Role.ADMIN, Role.HR)
  @Put(':id/profile')
  updateByHr(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeProfileDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.profile.updateByHr(id, dto, user, req.ip);
  }
}
