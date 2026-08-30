import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { DepartmentsService } from './departments.service.js';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from './dto/department.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  ip?: string;
}

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get('tree')
  getTree(@CurrentUser() user: AuthenticatedUser) {
    return this.departmentsService.getDepartmentTree(user);
  }

  @Get(':id')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.departmentsService.getDepartmentById(id, user);
  }

  // Chỉ ADMIN và HR được sửa cơ cấu tổ chức. MANAGER chỉ xem.
  @Roles(Role.ADMIN, Role.HR)
  @Post()
  create(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.departmentsService.create(dto, user, req.ip);
  }

  @Roles(Role.ADMIN, Role.HR)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.departmentsService.update(id, dto, user, req.ip);
  }

  /** Vô hiệu hoá, không xoá cứng. Dữ liệu KPI sau này còn tham chiếu tới. */
  @Roles(Role.ADMIN, Role.HR)
  @Delete(':id')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.departmentsService.deactivate(id, user, req.ip);
  }
}
