import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JobTitlesService } from './job-titles.service.js';
import {
  CreateJobTitleDto,
  ListJobTitlesQuery,
  UpdateJobTitleDto,
} from './dto/job-title.dto.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  ip?: string;
}

@Controller('job-titles')
export class JobTitlesController {
  constructor(private readonly jobTitlesService: JobTitlesService) {}

  @Get()
  list(@Query() query: ListJobTitlesQuery, @CurrentUser() user: AuthenticatedUser) {
    return this.jobTitlesService.list(query, user);
  }

  @Roles(Role.ADMIN, Role.HR)
  @Post()
  create(
    @Body() dto: CreateJobTitleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.jobTitlesService.create(dto, user, req.ip);
  }

  @Roles(Role.ADMIN, Role.HR)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobTitleDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.jobTitlesService.update(id, dto, user, req.ip);
  }

  @Roles(Role.ADMIN, Role.HR)
  @Delete(':id')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestInfo,
  ) {
    return this.jobTitlesService.deactivate(id, user, req.ip);
  }
}
