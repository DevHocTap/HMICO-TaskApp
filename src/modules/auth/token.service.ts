import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, createHash } from 'node:crypto';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AppEnv } from '../../config/env.validation.js';
import type { AccessTokenPayload } from '../../common/types/authenticated-user.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

const REFRESH_TOKEN_BYTES = 32;

/**
 * Cấp, xoay vòng và thu hồi token.
 *
 * Refresh token là chuỗi ngẫu nhiên 32 byte, KHÔNG phải JWT — nó chỉ cần
 * tra được trong bảng và thu hồi được. Lưu SHA-256 chứ không lưu thô: rò
 * database thì kẻ tấn công vẫn không dùng được token. Không cần argon2 vì
 * token đã có entropy cao, không phải mật khẩu người tự đặt.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /** Băm để lưu và để tra. Cùng đầu vào luôn ra cùng kết quả. */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshExpiry(): Date {
    const days = this.config.get('JWT_REFRESH_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private async signAccessToken(user: User): Promise<string> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
    };
    return this.jwtService.signAsync(payload);
  }

  /** Cấp cặp token mới cho một lần đăng nhập. */
  async issuePair(user: User, client: ClientInfo = {}): Promise<TokenPair> {
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hash(refreshToken),
        expiresAt: this.refreshExpiry(),
        userAgent: client.userAgent ?? null,
        ipAddress: client.ipAddress ?? null,
      },
    });

    return { accessToken: await this.signAccessToken(user), refreshToken };
  }

  /**
   * Xoay vòng: đổi refresh token cũ lấy cặp mới, thu hồi cái cũ ngay.
   *
   * Giai đoạn 1 chưa phát hiện tái sử dụng token (dùng lại token đã thu hồi
   * thì chỉ bị từ chối, không thu hồi cả chuỗi) — xem docs mục 7.
   */
  async rotate(refreshToken: string, client: ClientInfo = {}): Promise<TokenPair> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hash(refreshToken) },
      include: { user: true },
    });

    if (!existing || existing.revokedAt || existing.expiresAt <= new Date()) {
      throw new UnauthorizedException('Phiên đăng nhập không còn hiệu lực');
    }
    if (!existing.user.isActive) {
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hoá');
    }

    const nextToken = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

    // Một giao dịch: tạo token mới rồi thu hồi token cũ và trỏ sang cái mới.
    // Tách ra hai lệnh rời sẽ có khoảnh khắc cả hai cùng sống.
    await this.prisma.$transaction(async (tx) => {
      const next = await tx.refreshToken.create({
        data: {
          userId: existing.userId,
          tokenHash: this.hash(nextToken),
          expiresAt: this.refreshExpiry(),
          userAgent: client.userAgent ?? null,
          ipAddress: client.ipAddress ?? null,
        },
      });
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedById: next.id },
      });
    });

    return {
      accessToken: await this.signAccessToken(existing.user),
      refreshToken: nextToken,
    };
  }

  /** Đăng xuất một phiên. Token không tồn tại thì im lặng bỏ qua. */
  async revoke(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Thu hồi toàn bộ phiên: dùng khi đổi mật khẩu hoặc vô hiệu hoá tài khoản. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
