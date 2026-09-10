import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshDto } from './dto/refresh.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LogoutDto } from './dto/logout.dto.js';
import { RateLimit } from '../../common/decorators/rate-limit.decorator.js';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

interface RequestInfo {
  headers: Record<string, string | undefined>;
  ip?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Đăng nhập. BA lớp chống dò mật khẩu, mỗi lớp chặn một kiểu tấn công:
   *
   *   1. 5 lần/phút theo (IP, email) — dò mật khẩu MỘT tài khoản từ một máy
   *   2. 120 lần/phút theo IP        — một máy hoá điên, hoặc script quét
   *   3. khoá tạm theo email         — dò một tài khoản từ NHIỀU máy
   *                                    (xem LoginAttemptService)
   *
   * VÌ SAO LỚP 1 KHOÁ THEO CẢ EMAIL: 200 nhân sự sau NAT dùng chung một IP
   * công cộng. Khoá 5 lần/phút theo IP thuần thì sáng thứ Hai người thứ sáu
   * đăng nhập đã bị chặn — và kẻ tấn công chỉ cần ngồi gõ sai để khoá cả
   * công ty.
   *
   * VÌ SAO LỚP 2 RỘNG TỚI 120: nó KHÔNG phải lớp chống dò mật khẩu, lớp 1
   * và 3 mới là. Nó chỉ chặn một máy gọi điên loạn. 200 người đăng nhập rải
   * trong 5–10 phút đầu ca là 20–40 lần/phút, đỉnh gấp đôi; 120 là dư gấp
   * ba mà vẫn chặn được script.
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit(
    {
      limit: 5,
      windowMs: 60_000,
      theo: 'ip+email',
      envVar: 'LOGIN_RATE_LIMIT_PER_MINUTE',
    },
    {
      limit: 120,
      windowMs: 60_000,
      theo: 'ip',
      envVar: 'LOGIN_RATE_LIMIT_IP_PER_MINUTE',
    },
  )
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: RequestInfo) {
    return this.authService.login(dto, this.clientInfo(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto, @Req() req: RequestInfo) {
    return this.authService.refresh(dto.refreshToken, this.clientInfo(req));
  }

  /**
   * Đăng xuất một phiên.
   *
   * VÌ SAO @Public(): refresh token tự nó đã là bằng chứng — ai cầm được
   * nó thì cũng đang cầm phiên đó. Quan trọng hơn, người dùng phải đăng
   * xuất được cả khi access token đã hết hạn (15 phút là rất ngắn); bắt
   * buộc access token hợp lệ sẽ khiến phiên hết hạn không bao giờ thu hồi
   * được, refresh token cứ nằm đó tới 7 ngày.
   *
   * VÌ SAO LUÔN 204: trả 404 cho token không tồn tại và 204 cho token thật
   * sẽ biến endpoint thành công cụ dò token. Mọi trường hợp — thiếu token,
   * sai định dạng, đã hết hạn, đã thu hồi — đều trả 204 giống hệt nhau.
   */
  @Public()
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60_000 })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.authService.logout(dto.refreshToken);
  }

  /**
   * Đăng xuất khỏi mọi thiết bị. Khác `logout`, endpoint này BẮT BUỘC
   * access token hợp lệ: thu hồi toàn bộ phiên là thao tác nặng, chỉ chính
   * chủ đang đăng nhập mới được làm.
   */
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logoutAll(user.id);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.authService.changePassword(user.id, dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user.id);
  }

  private clientInfo(req: RequestInfo) {
    return {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    };
  }
}
