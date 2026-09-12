import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PeriodType, type Prisma } from '@prisma/client';
import { kyThang, namThangHienTai } from '../period/period-calendar.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import {
  CAC_NHOM_CAI_DAT,
  CAI_DAT_MAC_DINH,
  kiemTraCaiDat,
  type CaiDatHeThong,
  type MocLichKy,
  type NhomCaiDat,
} from './cai-dat-mac-dinh.js';
import type { UpdateSettingsDto } from './dto/settings.dto.js';

export interface CaiDatKemThoiDiem {
  caiDat: CaiDatHeThong;
  /** Lần sửa gần nhất của từng nhóm; `null` = đang dùng mặc định. */
  capNhat: Record<NhomCaiDat, { updatedAt: Date; updatedByName: string | null } | null>;
}

/**
 * Cài đặt hệ thống — đọc từ bảng `SystemSetting`, GIỮ TRONG BỘ NHỚ.
 *
 * Đọc ở mọi lần chốt điểm, mọi lần đăng nhập sai, mọi lần sinh kỳ; ra
 * database mỗi lần là thừa. Cache nạp lúc khởi động và làm mới ngay sau
 * mỗi lần ghi — đúng với MỘT tiến trình Node (chốt 10/09); chạy nhiều tiến
 * trình thì tiến trình kia thấy giá trị cũ cho tới khi khởi động lại.
 *
 * Dòng thiếu hoặc JSON thiếu trường thì lấp bằng mặc định: sau này thêm
 * trường mới vào một nhóm, dữ liệu cũ vẫn đọc được.
 */
@Injectable()
export class SettingsService implements OnModuleInit {
  private readonly logger = new Logger(SettingsService.name);
  private cache: CaiDatHeThong = CAI_DAT_MAC_DINH;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.napLai();
  }

  /** Bản đang có hiệu lực — đồng bộ, không await, để engine gọi thẳng. */
  lay(): CaiDatHeThong {
    return this.cache;
  }

  async layKemThoiDiem(): Promise<CaiDatKemThoiDiem> {
    const dong = await this.prisma.systemSetting.findMany();
    const nguoi = await this.prisma.user.findMany({
      where: { id: { in: dong.map((d) => d.updatedById).filter((x): x is string => !!x) } },
      select: { id: true, fullName: true },
    });
    const tenNguoi = new Map(nguoi.map((n) => [n.id, n.fullName]));
    const capNhat = Object.fromEntries(
      CAC_NHOM_CAI_DAT.map((k) => {
        const d = dong.find((x) => x.key === k);
        return [
          k,
          d
            ? { updatedAt: d.updatedAt, updatedByName: d.updatedById ? tenNguoi.get(d.updatedById) ?? null : null }
            : null,
        ];
      }),
    ) as CaiDatKemThoiDiem['capNhat'];
    return { caiDat: this.cache, capNhat };
  }

  /**
   * Cập nhật từng nhóm gửi lên. Kiểm quan hệ trên BẢN GHÉP (nhóm mới + nhóm
   * giữ nguyên) rồi mới ghi, mỗi nhóm một dòng `AuditLog` kèm before/after.
   */
  async capNhat(
    dto: UpdateSettingsDto,
    actor: AuthenticatedUser,
    ip?: string | null,
    homNay = new Date(),
  ): Promise<CaiDatHeThong> {
    const nhomGui = CAC_NHOM_CAI_DAT.filter((k) => dto[k] !== undefined);
    if (nhomGui.length === 0) {
      throw new BadRequestException('Không có nhóm cài đặt nào để cập nhật');
    }

    const ghep: CaiDatHeThong = { ...this.cache };
    for (const k of nhomGui) {
      (ghep as Record<NhomCaiDat, unknown>)[k] = dto[k];
    }
    const loi = kiemTraCaiDat(ghep);
    if (loi.length > 0) {
      throw new BadRequestException({ message: loi.join('. '), errors: loi });
    }

    let kyDaApMoc: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      if (nhomGui.includes('lichKy')) {
        kyDaApMoc = await this.apMocVaoKyDangMo(ghep.lichKy, tx, homNay);
      }
      for (const k of nhomGui) {
        const truoc = this.cache[k] as unknown as Prisma.InputJsonValue;
        const sau = ghep[k] as unknown as Prisma.InputJsonValue;
        await tx.systemSetting.upsert({
          where: { key: k },
          create: { key: k, value: sau, updatedById: actor.id },
          update: { value: sau, updatedById: actor.id },
        });
        await this.audit.log(
          {
            actorId: actor.id,
            entityType: 'Setting',
            entityId: k,
            action: 'UPDATE',
            before: truoc,
            // Lịch kỳ: ghi luôn những kỳ vừa bị đổi mốc để tra được sau này
            after: k === 'lichKy' ? { ...(sau as object), kyDaApMoc } : sau,
            ipAddress: ip ?? undefined,
          },
          tx,
        );
      }
    });

    await this.napLai();
    this.logger.log(`${actor.email} đã cập nhật cài đặt: ${nhomGui.join(', ')}`);
    return this.cache;
  }

  /**
   * Đổi lịch thì áp NGAY vào các kỳ THÁNG đang mở: từ tháng hiện tại trở đi,
   * chưa khoá sổ. Kỳ quá khứ và kỳ đã khoá giữ nguyên — người dùng đổi lịch
   * giữa tháng là muốn tháng này chạy theo lịch mới, không phải tháng sau
   * (phản hồi 12/09/2026: "đã chỉnh ngày rồi sao không cập nhật").
   *
   * Mốc tính lại bằng đúng `kyThang()` — cùng hàm sinh kỳ tự động, nên kỳ
   * sinh sau và kỳ áp lại không lệch nhau. Trả về mã các kỳ đã đổi.
   */
  private async apMocVaoKyDangMo(
    moc: MocLichKy,
    tx: Prisma.TransactionClient,
    homNay: Date,
  ): Promise<string[]> {
    const { nam, thang } = namThangHienTai(homNay);
    const dauThangNay = new Date(Date.UTC(nam, thang - 1, 1));
    const cacKy = await tx.period.findMany({
      where: { type: PeriodType.MONTH, isLocked: false, startDate: { gte: dauThangNay } },
      select: { id: true, code: true, startDate: true },
    });
    for (const ky of cacKy) {
      const d = ky.startDate;
      const moi = kyThang(d.getUTCFullYear(), d.getUTCMonth() + 1, moc);
      await tx.period.update({
        where: { id: ky.id },
        data: {
          assignDeadline: moi.assignDeadline,
          selfScoreDeadline: moi.selfScoreDeadline,
          managerScoreDeadline: moi.managerScoreDeadline,
          submitDeadline: moi.submitDeadline,
        },
      });
    }
    return cacKy.map((k) => k.code).sort();
  }

  private async napLai(): Promise<void> {
    const dong = await this.prisma.systemSetting.findMany();
    const moi = { ...CAI_DAT_MAC_DINH };
    for (const k of CAC_NHOM_CAI_DAT) {
      const d = dong.find((x) => x.key === k);
      if (d && d.value && typeof d.value === 'object' && !Array.isArray(d.value)) {
        // Lấp trường thiếu bằng mặc định — thêm trường mới không làm vỡ dữ liệu cũ
        (moi as Record<NhomCaiDat, unknown>)[k] = { ...CAI_DAT_MAC_DINH[k], ...(d.value as object) };
      }
    }
    const loi = kiemTraCaiDat(moi);
    if (loi.length > 0) {
      // Dữ liệu trong bảng hỏng (sửa tay sai) — dùng mặc định và kêu to,
      // không để lịch kỳ hay xếp loại chạy trên số vô lý.
      this.logger.error(`Cài đặt trong database không hợp lệ, dùng mặc định: ${loi.join('; ')}`);
      this.cache = CAI_DAT_MAC_DINH;
      return;
    }
    this.cache = moi;
  }
}
