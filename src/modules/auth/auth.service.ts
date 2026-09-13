import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { TokenService, type TokenPair } from './token.service.js';
import { LoginAttemptService } from './login-attempt.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';

/**
 * Hồ sơ người dùng hiện tại.
 *
 * Đây là NGUỒN DUY NHẤT cho thông tin phòng ban/chức danh của chính người
 * dùng (thanh điều hướng, trang cá nhân). Không lấy từ cây phòng ban —
 * STAFF nhận cây rỗng; cũng không lấy từ snapshot trên phiếu KPI — lúc
 * đăng nhập lần đầu chưa có phiếu nào.
 */
export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  /** Mã nhân viên — hiện cạnh tên trên trang "Phiếu đánh giá của tôi" (13/09). */
  employeeCode: string;
  role: User['role'];
  departmentId: string | null;
  departmentName: string | null;
  jobTitleName: string | null;
  level: string | null;
  mustChangePassword: boolean;
}

export interface LoginResult extends TokenPair {
  user: UserProfile;
}

/** Quan hệ cần nạp kèm để dựng được hồ sơ. */
const PROFILE_INCLUDE = {
  department: { select: { name: true } },
  jobTitle: { select: { name: true } },
} as const;

type UserWithProfile = User & {
  department: { name: string } | null;
  jobTitle: { name: string } | null;
};

interface ClientInfo {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly loginAttempts: LoginAttemptService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ghi nhật ký cho thao tác xác thực.
   *
   * `entityType = 'Auth'` chứ không phải `'User'`: đây là sự kiện phiên
   * đăng nhập, không phải thay đổi hồ sơ nhân sự. Trộn chung thì màn nhật
   * ký của một nhân viên sẽ ngập bản ghi đăng nhập và không còn nhìn ra
   * lần đổi vai trò nào.
   *
   * KHÔNG kèm mật khẩu hay token vào `after` — `AuditService.lamSach()` có
   * che theo tên khoá, nhưng chỗ này thì đơn giản là không đưa vào.
   */
  private async ghiNhatKy(
    action: string,
    userId: string | null,
    email: string,
    client: ClientInfo,
    them?: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.log({
      actorId: userId,
      entityType: 'Auth',
      // Không có userId (đăng nhập sai email) thì lấy email làm mốc tra cứu.
      entityId: userId ?? email,
      action,
      after: { email, ...them },
      ipAddress: client.ipAddress ?? null,
    });
  }

  async hashPassword(plain: string): Promise<string> {
    return argon2.hash(plain);
  }

  async login(dto: LoginDto, client: ClientInfo = {}): Promise<LoginResult> {
    const email = dto.email.toLowerCase().trim();

    // Khoá tạm được kiểm cho MỌI email, kể cả email không tồn tại — nếu chỉ
    // khoá email có thật thì thông báo này tiết lộ email nào có thật.
    const conKhoa = this.loginAttempts.getLockRemainingMinutes(email);
    if (conKhoa > 0) {
      throw new HttpException(
        `Tài khoản tạm khoá do nhập sai nhiều lần. Thử lại sau ${conKhoa} phút.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: PROFILE_INCLUDE,
    });

    // Vẫn băm một lần khi không tìm thấy người dùng, để thời gian phản hồi
    // của "sai email" và "sai mật khẩu" không chênh nhau — nếu không, kẻ
    // tấn công dò được email nào có thật.
    if (!user) {
      await argon2.hash(dto.password);
      this.loginAttempts.recordFailure(email);
      await this.ghiNhatKy('LOGIN_FAILED', null, email, client, { lyDo: 'email không tồn tại' });
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    const matched = await argon2.verify(user.passwordHash, dto.password);
    if (!matched) {
      this.loginAttempts.recordFailure(email);
      await this.ghiNhatKy('LOGIN_FAILED', user.id, email, client, { lyDo: 'sai mật khẩu' });
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    // Kiểm tra sau khi đã xác thực mật khẩu: người ngoài không dò được
    // tài khoản nào đang bị khoá.
    if (!user.isActive) {
      await this.ghiNhatKy('LOGIN_FAILED', user.id, email, client, {
        lyDo: 'tài khoản đã vô hiệu hoá',
      });
      throw new UnauthorizedException('Tài khoản đã bị vô hiệu hoá');
    }

    // Mật khẩu đúng thì xoá lịch sử sai, kể cả khi tài khoản bị vô hiệu hoá
    // ở bước trên — người dùng không có lỗi gì để bị tính.
    this.loginAttempts.reset(email);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.tokenService.issuePair(user, client);
    await this.ghiNhatKy('LOGIN', user.id, email, client);
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

  /**
   * Đăng xuất khỏi mọi thiết bị.
   *
   * `ghiNhatKy` bỏ qua khi `boQuaNhatKy` — `changePassword` gọi lại hàm này
   * và đã tự ghi `CHANGE_PASSWORD` rồi; ghi thêm một dòng `LOGOUT_ALL` chỉ
   * làm nhiễu, vì thu hồi phiên là hệ quả tất yếu của đổi mật khẩu.
   */
  async logoutAll(userId: string, boQuaNhatKy = false): Promise<void> {
    await this.tokenService.revokeAllForUser(userId);
    if (boQuaNhatKy) return;
    await this.audit.log({
      actorId: userId,
      entityType: 'Auth',
      entityId: userId,
      action: 'LOGOUT_ALL',
    });
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

    await this.audit.log({
      actorId: userId,
      entityType: 'Auth',
      entityId: userId,
      action: 'CHANGE_PASSWORD',
      after: { email: user.email },
    });

    // Đổi mật khẩu thì thu hồi mọi phiên, kể cả phiên hiện tại — người dùng
    // phải đăng nhập lại bằng mật khẩu mới trên mọi thiết bị.
    await this.logoutAll(userId, true);
  }

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: PROFILE_INCLUDE,
    });
    if (!user) {
      throw new UnauthorizedException('Tài khoản không tồn tại');
    }
    return this.toProfile(user);
  }

  private toProfile(user: UserWithProfile): UserProfile {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      employeeCode: user.employeeCode,
      role: user.role,
      departmentId: user.departmentId,
      departmentName: user.department?.name ?? null,
      jobTitleName: user.jobTitle?.name ?? null,
      level: user.level,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
