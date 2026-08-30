import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type Prisma, type User } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { TokenService } from '../auth/token.service.js';
import { DepartmentScopeService } from './department-scope.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type {
  CreateUserDto,
  ListUsersQuery,
  PaginatedUsers,
  ResetPasswordResponse,
  UpdateUserDto,
  UserResponse,
} from './dto/user.dto.js';

type UserWithExtras = User & {
  department: { name: string } | null;
  jobTitle: { name: string } | null;
  manager: { fullName: string } | null;
};

const INCLUDE_EXTRAS = {
  department: { select: { name: true } },
  jobTitle: { select: { name: true } },
  manager: { select: { fullName: true } },
} as const;

const LIMIT_MAC_DINH = 20;

/** Độ sâu tối đa khi dò vòng lặp quan hệ báo cáo — chặn dữ liệu hỏng gây treo. */
const MAX_DO_SAU_QUAN_LY = 50;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentScope: DepartmentScopeService,
    private readonly tokenService: TokenService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ đọc

  /**
   * Danh sách nhân viên, phân trang, ĐÃ LỌC theo phạm vi.
   *
   * STAFF nhận phạm vi phòng ban rỗng nên chỉ thấy chính mình — điều kiện
   * `OR [phòng trong phạm vi, chính mình]` xử lý luôn cả hai trường hợp.
   */
  async list(query: ListUsersQuery, user: AuthenticatedUser): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const limit = query.limit ?? LIMIT_MAC_DINH;

    const accessibleIds = await this.departmentScope.getAccessibleDepartmentIds(user);

    // Lọc theo phòng ban thì lấy cả phòng con, nhưng chỉ trong phạm vi cho phép
    let departmentIds = accessibleIds;
    if (query.departmentId) {
      const subtree = await this.departmentScope.getSubtreeIds(query.departmentId);
      departmentIds = subtree.filter((id) => accessibleIds.includes(id));
    }

    const where: Prisma.UserWhereInput = {
      AND: [
        { OR: [{ departmentId: { in: departmentIds } }, { id: user.id }] },
        query.role ? { role: query.role } : {},
        query.jobTitleId ? { jobTitleId: query.jobTitleId } : {},
        query.isActive !== undefined ? { isActive: query.isActive } : {},
        query.search
          ? {
              OR: [
                { fullName: { contains: query.search, mode: 'insensitive' } },
                { employeeCode: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: INCLUDE_EXTRAS,
        orderBy: { employeeCode: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: rows.map((r) => this.toResponse(r)), total, page, limit };
  }

  async getById(id: string, user: AuthenticatedUser): Promise<UserResponse> {
    const found = await this.mustFind(id);
    await this.assertCanSee(found, user);
    return this.toResponse(found);
  }

  // ------------------------------------------------------------------ ghi

  async create(
    dto: CreateUserDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<UserResponse & ResetPasswordResponse> {
    this.assertCanAssignRole(dto.role, actor);
    await this.assertEmployeeCodeAvailable(dto.employeeCode);
    await this.assertEmailAvailable(dto.email);
    if (dto.departmentId) await this.assertDepartmentExists(dto.departmentId);
    if (dto.jobTitleId) await this.assertJobTitleExists(dto.jobTitleId);
    if (dto.managerId) await this.mustFind(dto.managerId);

    const temporaryPassword = this.sinhMatKhauTam();

    const created = await this.prisma.user.create({
      data: {
        employeeCode: dto.employeeCode,
        email: dto.email.toLowerCase().trim(),
        fullName: dto.fullName,
        passwordHash: await argon2.hash(temporaryPassword),
        role: dto.role,
        departmentId: dto.departmentId ?? null,
        jobTitleId: dto.jobTitleId ?? null,
        level: dto.level ?? null,
        managerId: dto.managerId ?? null,
        mustChangePassword: true,
      },
      include: INCLUDE_EXTRAS,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'User',
      entityId: created.id,
      action: 'CREATE',
      after: this.toAuditSnapshot(created),
      ipAddress,
    });

    // Mật khẩu tạm chỉ trả về đúng lần này, không lưu lại đâu để xem lại
    return { ...this.toResponse(created), temporaryPassword };
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<UserResponse> {
    const before = await this.mustFind(id);
    this.assertCanModify(before, actor);

    if (dto.role !== undefined && dto.role !== before.role) {
      // Không ai được tự đổi vai trò của chính mình, kể cả ADMIN: một tài
      // khoản bị chiếm sẽ không thể tự nâng quyền.
      if (id === actor.id) {
        throw new ForbiddenException('Không thể tự thay đổi vai trò của chính mình');
      }
      this.assertCanAssignRole(dto.role, actor);
    }

    if (dto.employeeCode && dto.employeeCode !== before.employeeCode) {
      await this.assertEmployeeCodeAvailable(dto.employeeCode);
    }
    if (dto.email && dto.email.toLowerCase().trim() !== before.email) {
      await this.assertEmailAvailable(dto.email);
    }
    if (dto.departmentId) await this.assertDepartmentExists(dto.departmentId);
    if (dto.jobTitleId) await this.assertJobTitleExists(dto.jobTitleId);
    if (dto.managerId !== undefined && dto.managerId !== null) {
      await this.assertNoManagerCycle(id, dto.managerId);
    }
    if (dto.departmentId !== undefined && dto.departmentId !== before.departmentId) {
      // Chuyển người này sang phòng khác sẽ khiến Department.managerId trỏ
      // tới người không còn thuộc phòng đó — phá đúng ràng buộc mà
      // assertManagerBelongsTo đang giữ.
      await this.assertKhongPhaiTruongBoPhan(
        id,
        'Không thể chuyển phòng cho người đang là trưởng bộ phận',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        employeeCode: dto.employeeCode,
        email: dto.email?.toLowerCase().trim(),
        fullName: dto.fullName,
        role: dto.role,
        departmentId: dto.departmentId,
        jobTitleId: dto.jobTitleId,
        level: dto.level,
        managerId: dto.managerId,
      },
      include: INCLUDE_EXTRAS,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'User',
      // Đổi vai trò là thao tác nhạy cảm, tách action riêng để tra cứu nhanh
      entityId: id,
      action:
        dto.role !== undefined && dto.role !== before.role ? 'CHANGE_ROLE' : 'UPDATE',
      before: this.toAuditSnapshot(before),
      after: this.toAuditSnapshot(updated),
      ipAddress,
    });

    return this.toResponse(updated);
  }

  /**
   * Đặt lại mật khẩu, trả về mật khẩu tạm ĐÚNG MỘT LẦN.
   *
   * Thu hồi toàn bộ refresh token: nếu tài khoản đang bị chiếm, đặt lại mật
   * khẩu mà không thu hồi thì kẻ chiếm vẫn giữ được phiên tới 7 ngày.
   */
  async resetPassword(
    id: string,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ResetPasswordResponse> {
    const target = await this.mustFind(id);
    this.assertCanModify(target, actor);

    const temporaryPassword = this.sinhMatKhauTam();

    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await argon2.hash(temporaryPassword),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
      },
    });
    await this.tokenService.revokeAllForUser(id);

    await this.audit.log({
      actorId: actor.id,
      entityType: 'User',
      entityId: id,
      action: 'RESET_PASSWORD',
      // Cố ý KHÔNG ghi before/after: bản ghi User chứa passwordHash, và ở
      // đây không có thông tin nào đáng lưu ngoài chính hành động.
      ipAddress,
    });

    return { temporaryPassword };
  }

  async setActive(
    id: string,
    isActive: boolean,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<UserResponse> {
    const before = await this.mustFind(id);
    this.assertCanModify(before, actor);

    if (id === actor.id && !isActive) {
      throw new ForbiddenException('Không thể tự vô hiệu hoá tài khoản của chính mình');
    }
    if (before.isActive === isActive) {
      throw new BadRequestException(
        isActive ? 'Tài khoản đang hoạt động' : 'Tài khoản đã bị vô hiệu hoá',
      );
    }
    if (!isActive) {
      await this.assertKhongPhaiTruongBoPhan(
        id,
        'Không thể vô hiệu hoá người đang là trưởng bộ phận',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      include: INCLUDE_EXTRAS,
    });

    // Vô hiệu hoá mà không thu hồi token thì người đó vẫn dùng được hệ thống
    // cho tới khi refresh token hết hạn
    if (!isActive) await this.tokenService.revokeAllForUser(id);

    await this.audit.log({
      actorId: actor.id,
      entityType: 'User',
      entityId: id,
      action: isActive ? 'ACTIVATE' : 'DEACTIVATE',
      before: this.toAuditSnapshot(before),
      after: this.toAuditSnapshot(updated),
      ipAddress,
    });

    return this.toResponse(updated);
  }

  // ------------------------------------------------------------- ràng buộc

  private async mustFind(id: string): Promise<UserWithExtras> {
    const found = await this.prisma.user.findUnique({
      where: { id },
      include: INCLUDE_EXTRAS,
    });
    if (!found) throw new NotFoundException('Không tìm thấy nhân viên');
    return found;
  }

  /** Xem được nếu là chính mình, hoặc thuộc phòng trong phạm vi. */
  private async assertCanSee(
    target: UserWithExtras,
    viewer: AuthenticatedUser,
  ): Promise<void> {
    if (target.id === viewer.id) return;

    const accessibleIds = await this.departmentScope.getAccessibleDepartmentIds(viewer);
    if (!target.departmentId || !accessibleIds.includes(target.departmentId)) {
      throw new ForbiddenException('Bạn không có quyền xem nhân viên này');
    }
  }

  /**
   * HR không được đụng vào tài khoản ADMIN.
   *
   * Không có quy tắc này thì HR đặt lại mật khẩu của ADMIN rồi đăng nhập
   * bằng mật khẩu tạm — leo thang đặc quyền chỉ bằng các endpoint hợp lệ.
   */
  private assertCanModify(target: User, actor: AuthenticatedUser): void {
    if (target.role === Role.ADMIN && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên mới thao tác được trên tài khoản quản trị');
    }
  }

  /** Chỉ ADMIN được gán vai trò ADMIN. */
  private assertCanAssignRole(role: Role, actor: AuthenticatedUser): void {
    if (role === Role.ADMIN && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên mới gán được vai trò quản trị');
    }
  }

  /**
   * Chặn thao tác làm một phòng ban mất trưởng bộ phận.
   *
   * Phòng không có trưởng bộ phận thì KPI của phòng đó KHÔNG AI DUYỆT
   * ĐƯỢC — và lỗi chỉ lộ ra vào cuối tháng, khi nhân viên đã nộp kết quả
   * và không kịp xử lý. Bắt chỉ định người thay ngay tại thời điểm thao
   * tác, không để phát hiện muộn.
   */
  private async assertKhongPhaiTruongBoPhan(
    userId: string,
    thongDiep: string,
  ): Promise<void> {
    const cacPhong = await this.prisma.department.findMany({
      where: { managerId: userId, isActive: true },
      select: { name: true },
    });
    if (cacPhong.length === 0) return;

    const ten = cacPhong.map((p) => p.name).join(', ');
    throw new BadRequestException(
      `${thongDiep} của: ${ten}. ` +
        'Hãy chỉ định người thay làm trưởng bộ phận trước.',
    );
  }

  private async assertEmployeeCodeAvailable(employeeCode: string): Promise<void> {
    const trung = await this.prisma.user.findUnique({ where: { employeeCode } });
    if (trung) throw new ConflictException(`Mã nhân viên "${employeeCode}" đã được dùng`);
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const trung = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (trung) throw new ConflictException('Email này đã được dùng');
  }

  private async assertDepartmentExists(departmentId: string): Promise<void> {
    const found = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Không tìm thấy phòng ban');
  }

  private async assertJobTitleExists(jobTitleId: string): Promise<void> {
    const found = await this.prisma.jobTitle.findUnique({
      where: { id: jobTitleId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Không tìm thấy chức danh');
  }

  /**
   * Chặn vòng lặp trong quan hệ báo cáo.
   *
   * A quản lý B, B quản lý A sẽ làm mọi hàm duyệt chuỗi quản lý treo vô hạn.
   * Đi ngược lên từ người quản lý mới: nếu gặp lại chính người đang sửa thì
   * có vòng.
   */
  private async assertNoManagerCycle(userId: string, managerId: string): Promise<void> {
    if (managerId === userId) {
      throw new BadRequestException('Không thể đặt chính người này làm quản lý của họ');
    }
    await this.mustFind(managerId);

    let hienTai: string | null = managerId;
    for (let i = 0; i < MAX_DO_SAU_QUAN_LY && hienTai; i++) {
      if (hienTai === userId) {
        throw new BadRequestException(
          'Quan hệ quản lý bị lặp vòng: người này đang là cấp trên của người được chọn',
        );
      }
      const cha: { managerId: string | null } | null = await this.prisma.user.findUnique({
        where: { id: hienTai },
        select: { managerId: true },
      });
      hienTai = cha?.managerId ?? null;
    }
  }

  // --------------------------------------------------------------- ánh xạ

  /**
   * Mật khẩu tạm: 12 ký tự base64url từ 9 byte ngẫu nhiên.
   *
   * Không tự ghép từ bảng ký tự "dễ đọc" — làm vậy giảm entropy mà lợi ích
   * không đáng, vì mật khẩu này chỉ dùng một lần rồi bắt buộc đổi.
   */
  private sinhMatKhauTam(): string {
    return randomBytes(9).toString('base64url');
  }

  private toResponse(u: UserWithExtras): UserResponse {
    return {
      id: u.id,
      employeeCode: u.employeeCode,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      departmentId: u.departmentId,
      departmentName: u.department?.name ?? null,
      jobTitleId: u.jobTitleId,
      jobTitleName: u.jobTitle?.name ?? null,
      level: u.level,
      managerId: u.managerId,
      managerName: u.manager?.fullName ?? null,
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
      lastLoginAt: u.lastLoginAt,
    };
  }

  /** Bản ghi gọn cho nhật ký. Cố ý KHÔNG có passwordHash. */
  private toAuditSnapshot(u: UserWithExtras): Prisma.InputJsonValue {
    return {
      employeeCode: u.employeeCode,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      departmentId: u.departmentId,
      jobTitleId: u.jobTitleId,
      level: u.level,
      managerId: u.managerId,
      isActive: u.isActive,
    };
  }
}
