import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PUBLIC_KEY } from '../decorators/public.decorator.js';
import type {
  AccessTokenPayload,
  AuthenticatedUser,
} from '../types/authenticated-user.js';

/**
 * Kiểm tra access token. Đăng ký toàn cục trong AuthModule nên mặc định
 * mọi endpoint đều cần đăng nhập; muốn mở thì gắn @Public().
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: AuthenticatedUser }>();

    const token = this.extractToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Thiếu token đăng nhập');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      // Không ghi nội dung token vào log (.claude/rules/security.md)
      throw new UnauthorizedException('Token không hợp lệ hoặc đã hết hạn');
    }

    request.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      departmentId: payload.departmentId,
    };
    return true;
  }

  private extractToken(authorization?: string): string | null {
    if (!authorization) return null;
    const [scheme, token] = authorization.split(' ');
    return scheme === 'Bearer' && token ? token : null;
  }
}
