import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './common/decorators/public.decorator.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Health check — để giám sát gọi được mà không cần đăng nhập. */
  @Public()
  @Get()
  getHealth() {
    return this.appService.getHealth();
  }
}
