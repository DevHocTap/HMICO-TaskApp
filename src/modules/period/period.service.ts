import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { cacKyCanBaoDam, type KyCanTao } from './period-calendar.js';

export interface KetQuaBaoDamKy {
  daTao: string[];
  daCoSan: string[];
}

@Injectable()
export class PeriodService {
  private readonly logger = new Logger(PeriodService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Bảo đảm kỳ tháng hiện tại và tháng kế tiếp đã tồn tại, kèm kỳ quý và
   * kỳ năm chứa chúng.
   *
   * Chạy ở HAI nơi: tác vụ định kỳ hằng ngày, và lúc máy chủ khởi động.
   * Gộp làm một hàm vì cả hai cần đúng một việc — máy chủ tắt đúng lúc cron
   * chạy thì lần bật lên sau sẽ bù ngay, không phải đợi hôm sau.
   *
   * IDEMPOTENT: khoá theo `code`, chạy lại bao nhiêu lần cũng chỉ ra một kỳ.
   * Nhờ vậy chạy nhiều tiến trình cũng không sinh kỳ trùng — khác hẳn
   * `RateLimitGuard`, thứ đếm trong bộ nhớ nên hỏng khi nhiều tiến trình.
   *
   * KHÔNG bù ngược quá khứ — xem `cacKyCanBaoDam`.
   */
  async ensurePeriodsExist(bayGio: Date = new Date()): Promise<KetQuaBaoDamKy> {
    const canCo = cacKyCanBaoDam(bayGio);
    const daTao: string[] = [];
    const daCoSan: string[] = [];

    for (const ky of canCo) {
      const ketQua = await this.taoNeuChuaCo(ky);
      (ketQua ? daTao : daCoSan).push(ky.code);
    }

    if (daTao.length > 0) {
      this.logger.log(`Đã tự tạo ${daTao.length} kỳ đánh giá: ${daTao.join(', ')}`);
    }
    return { daTao, daCoSan };
  }

  /** Trả về true nếu vừa tạo, false nếu đã có sẵn. */
  private async taoNeuChuaCo(ky: KyCanTao): Promise<boolean> {
    const daCo = await this.prisma.period.findUnique({
      where: { code: ky.code },
      select: { id: true },
    });
    if (daCo) return false;

    const parentId = ky.parentCode
      ? (
          await this.prisma.period.findUnique({
            where: { code: ky.parentCode },
            select: { id: true },
          })
        )?.id ?? null
      : null;

    const taoMoi = await this.prisma.period.create({
      data: {
        code: ky.code,
        name: ky.name,
        type: ky.type,
        startDate: ky.startDate,
        endDate: ky.endDate,
        submitDeadline: ky.submitDeadline,
        parentId,
        // createdById = null nghĩa là hệ thống tự tạo, không phải người tạo
        createdById: null,
      },
    });

    await this.audit.log({
      actorId: null,
      entityType: 'Period',
      entityId: taoMoi.id,
      action: 'AUTO_CREATE',
      after: { code: ky.code, name: ky.name, type: ky.type },
    });

    return true;
  }
}
