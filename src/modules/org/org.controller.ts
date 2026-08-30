import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { OrgService } from './org.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

@Controller('departments')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get('tree')
  getTree() {
    return this.orgService.getDepartmentTree();
  }

  @Get(':id')
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.orgService.getDepartmentById(id, user);
  }
}
