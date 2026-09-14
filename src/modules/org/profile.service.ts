import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, type EmployeeProfile } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DepartmentScopeService } from './department-scope.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type {
  ProfileResponse,
  UpdateEmployeeProfileDto,
  UpdateMyProfileDto,
} from './dto/profile.dto.js';

const VAI_TRO_GHI_HO_SO: Role[] = [Role.ADMIN, Role.HR];

const INCLUDE_TAI_KHOAN = {
  department: { select: { name: true } },
  jobTitle: { select: { name: true } },
  manager: { select: { fullName: true } },
  profile: true,
} as const;

/** Cột DATE của Prisma trả Date lúc 00:00 UTC — chỉ lấy phần YYYY-MM-DD. */
const ngay = (d: Date | null | undefined): string | null =>
  d ? d.toISOString().slice(0, 10) : null;
/** Chuỗi YYYY-MM-DD → Date cho cột DATE; `null` giữ nguyên để xoá. */
const toDate = (s: string | null | undefined): Date | null | undefined =>
  s === undefined ? undefined : s === null ? null : new Date(s);

/**
 * Hồ sơ nhân sự — tách khỏi `UsersService` (tài khoản) có chủ ý: giai đoạn 2
 * chấm công sẽ mở rộng ở đây. Không chứa gì về KPI.
 */
@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly departmentScope: DepartmentScopeService,
    private readonly audit: AuditService,
  ) {}

  /** Hồ sơ của chính mình. */
  async getMine(user: AuthenticatedUser): Promise<ProfileResponse> {
    return this.getByUserId(user.id, user);
  }

  /** Hồ sơ của một người — cùng phạm vi xem với `GET /users/:id`. */
  async getByUserId(userId: string, viewer: AuthenticatedUser): Promise<ProfileResponse> {
    const found = await this.prisma.user.findUnique({
      where: { id: userId },
      include: INCLUDE_TAI_KHOAN,
    });
    if (!found) throw new NotFoundException('Không tìm thấy nhân viên');

    if (found.id !== viewer.id) {
      const pham_vi = await this.departmentScope.getAccessibleDepartmentIds(viewer);
      if (!found.departmentId || !pham_vi.includes(found.departmentId)) {
        throw new ForbiddenException('Bạn không có quyền xem hồ sơ này');
      }
    }

    const laHr = VAI_TRO_GHI_HO_SO.includes(viewer.role);
    const p = found.profile;
    return {
      userId: found.id,
      employeeCode: found.employeeCode,
      email: found.email,
      fullName: found.fullName,
      departmentName: found.department?.name ?? null,
      jobTitleName: found.jobTitle?.name ?? null,
      level: found.level,
      managerName: found.manager?.fullName ?? null,
      phone: p?.phone ?? null,
      personalEmail: p?.personalEmail ?? null,
      address: p?.address ?? null,
      dateOfBirth: ngay(p?.dateOfBirth),
      gender: p?.gender ?? null,
      emergencyContact: p?.emergencyContact ?? null,
      hireDate: ngay(p?.hireDate),
      terminationDate: ngay(p?.terminationDate),
      // CCCD: chủ hồ sơ và HR thấy đủ; trưởng phòng xem người trong phòng
      // thì che — họ không cần số này để giao KPI.
      nationalId: found.id === viewer.id || laHr ? (p?.nationalId ?? null) : cheCccd(p?.nationalId),
      canEditHrFields: laHr,
    };
  }

  /** Nhân viên tự sửa — DTO đã giới hạn đúng các trường được phép. */
  async updateMine(
    dto: UpdateMyProfileDto,
    user: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ProfileResponse> {
    return this.ghi(user.id, dto, user, 'UPDATE_MY_PROFILE', ipAddress);
  }

  /** HR / ADMIN sửa cả phần quản lý (ngày vào làm, ngày nghỉ, CCCD). */
  async updateByHr(
    userId: string,
    dto: UpdateEmployeeProfileDto,
    actor: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<ProfileResponse> {
    if (!VAI_TRO_GHI_HO_SO.includes(actor.role)) {
      throw new ForbiddenException('Chỉ HCNS hoặc quản trị viên sửa được phần hồ sơ này');
    }
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) throw new NotFoundException('Không tìm thấy nhân viên');
    // Cùng luật với UsersService: HR không đụng tài khoản ADMIN
    if (target.role === Role.ADMIN && actor.role !== Role.ADMIN) {
      throw new ForbiddenException('Chỉ quản trị viên mới thao tác được trên tài khoản quản trị');
    }
    return this.ghi(userId, dto, actor, 'UPDATE_PROFILE', ipAddress);
  }

  private async ghi(
    userId: string,
    dto: UpdateEmployeeProfileDto,
    actor: AuthenticatedUser,
    action: 'UPDATE_MY_PROFILE' | 'UPDATE_PROFILE',
    ipAddress?: string,
  ): Promise<ProfileResponse> {
    const before = await this.prisma.employeeProfile.findUnique({ where: { userId } });
    const data = {
      phone: dto.phone?.trim(),
      personalEmail: dto.personalEmail === null ? null : dto.personalEmail?.toLowerCase().trim(),
      address: dto.address,
      dateOfBirth: toDate(dto.dateOfBirth),
      gender: dto.gender,
      emergencyContact: dto.emergencyContact,
      hireDate: toDate(dto.hireDate),
      terminationDate: toDate(dto.terminationDate),
      nationalId: dto.nationalId,
    };
    const after = await this.prisma.employeeProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });

    await this.audit.log({
      actorId: actor.id,
      entityType: 'User',
      entityId: userId,
      action,
      before: before ? this.snapshot(before) : null,
      after: this.snapshot(after),
      ipAddress,
    });

    return this.getByUserId(userId, actor);
  }

  /** Ảnh chụp cho nhật ký — CCCD che bớt, nhật ký ADMIN đọc được nhưng không cần số đầy đủ. */
  private snapshot(p: EmployeeProfile) {
    return {
      phone: p.phone,
      personalEmail: p.personalEmail,
      address: p.address,
      dateOfBirth: ngay(p.dateOfBirth),
      gender: p.gender,
      emergencyContact: p.emergencyContact,
      hireDate: ngay(p.hireDate),
      terminationDate: ngay(p.terminationDate),
      nationalId: cheCccd(p.nationalId),
    };
  }
}

function cheCccd(so: string | null | undefined): string | null {
  if (!so) return null;
  return `${'*'.repeat(Math.max(0, so.length - 4))}${so.slice(-4)}`;
}
