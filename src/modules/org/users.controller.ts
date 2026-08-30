import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service.js';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/user.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  ip?: string;
}

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list(@Query() query: ListUsersQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.usersService.list(query, user);
  }

  @Get(':id')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.getById(id, user);
  }

  // Chỉ ADMIN và HR được sửa nhân sự. MANAGER chỉ xem trong phạm vi mình.
  @Roles(Role.ADMIN, Role.HR)
  @Post()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.usersService.create(dto, user, req.ip);
  }

  @Roles(Role.ADMIN, Role.HR)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.usersService.update(id, dto, user, req.ip);
  }

  /** Trả mật khẩu tạm ĐÚNG MỘT LẦN. Không có cách nào xem lại. */
  @Roles(Role.ADMIN, Role.HR)
  @Patch(':id/reset-password')
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.usersService.resetPassword(id, user, req.ip);
  }

  @Roles(Role.ADMIN, Role.HR)
  @Patch(':id/deactivate')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.usersService.setActive(id, false, user, req.ip);
  }

  @Roles(Role.ADMIN, Role.HR)
  @Patch(':id/activate')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.usersService.setActive(id, true, user, req.ip);
  }
}
