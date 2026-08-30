import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Client Prisma dùng để ghi log.
 *
 * Nhận cả `PrismaService` lẫn client trong transaction, để service gọi có
 * thể ghi log CÙNG transaction với thao tác nghiệp vụ — thao tác bị rollback
 * thì log cũng biến mất, không để lại dấu vết của việc chưa từng xảy ra.
 */
type PrismaLike = Pick<PrismaService, 'auditLog'> | Prisma.TransactionClient;

export interface AuditEntry {
  /** Ai thực hiện. Null cho thao tác của hệ thống. */
  actorId: string | null;
  /** Tên bảng: 'Department', 'User', 'JobTitle'... */
  entityType: string;
  entityId: string;
  /** Việc gì: 'CREATE', 'UPDATE', 'DEACTIVATE', 'RESET_PASSWORD'... */
  action: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}

/**
 * Khoá bị che khi ghi log.
 *
 * Bản ghi User chứa `passwordHash`; ghi thẳng vào AuditLog là phát tán hash
 * mật khẩu ra một bảng ít ai để ý tới quyền đọc. Refresh token cũng vậy.
 */
const KHOA_NHAY_CAM = /password|token|secret|hash/i;

const GIA_TRI_CHE = '[đã che]';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ghi một dòng nhật ký.
   *
   * KHÔNG ném lỗi ra ngoài khi ghi log thất bại: mất một dòng log không đáng
   * để huỷ cả thao tác nghiệp vụ đã thành công. Nhưng có ghi cảnh báo, vì
   * log hỏng âm thầm còn tệ hơn không có log.
   *
   * Muốn log và thao tác cùng sống chết thì truyền `tx` của transaction —
   * khi đó lỗi sẽ làm rollback cả hai.
   */
  async log(entry: AuditEntry, tx?: PrismaLike): Promise<void> {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({
        data: {
          actorId: entry.actorId,
          entityType: entry.entityType,
          entityId: entry.entityId,
          action: entry.action,
          before: this.lamSach(entry.before),
          after: this.lamSach(entry.after),
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch (error) {
      if (tx) throw error; // Trong transaction thì để lỗi lan ra, rollback cả cụm
      this.logger.error(
        `Không ghi được AuditLog: ${entry.action} ${entry.entityType}/${entry.entityId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Che các trường nhạy cảm trước khi lưu.
   *
   * Chỉ duyệt một tầng: dữ liệu đưa vào đây là bản ghi phẳng từ Prisma,
   * không phải cây lồng nhau. Nếu sau này cần log object lồng nhau thì phải
   * sửa hàm này cho đệ quy.
   */
  private lamSach(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'object') return value as Prisma.InputJsonValue;

    const nguon = value as Record<string, unknown>;
    const ketQua: Record<string, unknown> = {};
    for (const [khoa, giaTri] of Object.entries(nguon)) {
      ketQua[khoa] = KHOA_NHAY_CAM.test(khoa) ? GIA_TRI_CHE : giaTri;
    }
    return ketQua as Prisma.InputJsonValue;
  }
}
