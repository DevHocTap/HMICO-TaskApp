import { Controller, Get } from '@nestjs/common';
import { OrgService } from './org.service';

@Controller('departments')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Get('tree')
  getTree() {
    return this.orgService.getDepartmentTree();
  }
}