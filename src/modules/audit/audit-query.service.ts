import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { ListAuditLogsQuery } from './dto/audit.dto.js';

/**
 * Loại bản ghi ban giám đốc được xem.
 *
 * HCNS chốt 10/09: ban giám đốc chỉ xem **ai đã sửa điểm, nộp báo cáo,
 * duyệt** — tức toàn bộ vòng đời phiếu KPI. Nhật ký nhân sự (tạo/sửa/vô
 * hiệu hoá tài khoản, đổi vai trò, đặt lại mật khẩu) và nhật ký đăng nhập
 * KHÔNG nằm trong đó: chúng là chuyện quản trị hệ thống, và ai đăng nhập
 * lúc mấy giờ là thông tin cá nhân, không phải dữ liệu điều hành.
 *
 * ADMIN xem tất cả.
 */
const BGD_XEM_DUOC = ['Scorecard'];

const TRANG_MAC_DINH = 20;

@Injectable()
export class AuditQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListAuditLogsQuery, user: AuthenticatedUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? TRANG_MAC_DINH;

    const where = this.dieuKien(query, user);

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          actor: { select: { id: true, fullName: true, employeeCode: true, email: true } },
        },
      }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        ipAddress: r.ipAddress,
        before: r.before,
        after: r.after,
        actor: r.actor
          ? {
              id: r.actor.id,
              fullName: r.actor.fullName,
              employeeCode: r.actor.employeeCode,
              email: r.actor.email,
            }
          : null,
      })),
      total,
      page,
      limit,
      /** Loại bản ghi người này được xem — giao diện dùng để dựng ô lọc. */
      entityTypes: this.loaiXemDuoc(user),
    };
  }

  private dieuKien(
    query: ListAuditLogsQuery,
    user: AuthenticatedUser,
  ): Prisma.AuditLogWhereInput {
    const dieuKien: Prisma.AuditLogWhereInput = {
      entityId: query.entityId,
      actorId: query.actorId,
      action: query.action,
      createdAt: this.khoangNgay(query),
    };

    const choPhep = this.loaiXemDuoc(user);
    if (choPhep === null) {
      // ADMIN: không giới hạn loại. Lọc theo yêu cầu của người dùng nếu có.
      dieuKien.entityType = query.entityType;
      return dieuKien;
    }

    // Người khác: giao cắt giữa thứ họ xin và thứ họ được xem. Xin một loại
    // ngoài danh sách thì trả rỗng, KHÔNG âm thầm nới ra cả danh sách.
    dieuKien.entityType =
      query.entityType && choPhep.includes(query.entityType)
        ? query.entityType
        : query.entityType
          ? '(khong-duoc-xem)'
          : { in: choPhep };
    return dieuKien;
  }

  /** `null` nghĩa là xem được mọi loại. */
  private loaiXemDuoc(user: AuthenticatedUser): string[] | null {
    return user.role === Role.ADMIN ? null : BGD_XEM_DUOC;
  }

  /**
   * Khoảng ngày, tính CẢ ngày `to`.
   *
   * `to` người dùng gõ là một NGÀY, không phải mốc thời gian. So thẳng
   * `createdAt <= 2026-09-10` sẽ hiểu là 00:00 và bỏ mất cả ngày hôm đó —
   * lọc "tới hôm nay" ra rỗng, người dùng tưởng không có bản ghi nào.
   */
  private khoangNgay(query: ListAuditLogsQuery): Prisma.DateTimeFilter | undefined {
    if (!query.from && !query.to) return undefined;
    const loc: Prisma.DateTimeFilter = {};
    if (query.from) loc.gte = new Date(query.from);
    if (query.to) {
      const den = new Date(query.to);
      den.setUTCHours(23, 59, 59, 999);
      loc.lte = den;
    }
    return loc;
  }
}
