import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { TokenService, type TokenPair } from './token.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';

export interface LoginResult extends TokenPair {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: User['role'];
    departmentId: string | null;
    mustChangePassword: boolean;
  };
}

interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  async login(dto: LoginDto, client: ClientInfo = {}): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    // Vẫn băm một lần khi không tìm thấy người dùng, để thời gian phản hồi
    // của "sai email" và "sai mật khẩu" không chênh nhau — nếu không, kẻ
    // tấn công dò được email nào có thật.
    if (!user) {
      await argon2.hash(dto.password);
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const matched = await argon2.verify(user.passwordHash, dto.password);
    if (!matched) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    // Kiểm tra sau khi đã xác thực mật khẩu: người ngoài không dò được
    // tài khoản nào đang bị khoá.
    if (!user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hoá');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.tokenService.issuePair(user, client);
    return { ...tokens, user: this.toProfile(user) };
  }

  async refresh(refreshToken: string, client: ClientInfo = {}): Promise<TokenPair> {
    return this.tokenService.rotate(refreshToken, client);
  }

  /**
   * Đăng xuất một phiên. Nhận `unknown` vì controller cố ý không ràng buộc
   * kiểu đầu vào (xem LogoutDto) — mọi giá trị đều phải dẫn tới 204.
   */
  async logout(refreshToken: unknown): Promise<void> {
    if (typeof refreshToken !== 'string' || refreshToken.length === 0) return;
    await this.tokenService.revoke(refreshToken);
  }

  /** Đăng xuất khỏi mọi thiết bị. */
  async logoutAll(userId: string): Promise<void> {
    await this.tokenService.revokeAllForUser(userId);
  }

  /**
   * Đổi mật khẩu. Dùng cho cả lần đăng nhập đầu (mustChangePassword) lẫn
   * đổi thông thường. Đổi xong thu hồi mọi phiên, kể cả phiên hiện tại —
   * người dùng phải đăng nhập lại bằng mật khẩu mới.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }

    const matched = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!matched) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('Mật khẩu mới phải khác mật khẩu hiện tại');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await this.hashPassword(dto.newPassword),
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });

    // Đổi mật khẩu thì thu hồi mọi phiên, kể cả phiên hiện tại — người dùng
    // phải đăng nhập lại bằng mật khẩu mới trên mọi thiết bị.
    await this.logoutAll(userId);
  }

  async getProfile(userId: string): Promise<LoginResult['user']> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }
    return this.toProfile(user);
  }

  private toProfile(user: User): LoginResult['user'] {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      departmentId: user.departmentId,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
