import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PeriodType, type Period } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MUI_GIO, cacKyCanBaoDam, type KyCanTao } from './period-calendar.js';
import type {
  CreatePeriodDto,
  ListPeriodsQuery,
  PeriodSummary,
} from './dto/period.dto.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

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
        assignDeadline: ky.assignDeadline,
        selfScoreDeadline: ky.selfScoreDeadline,
        managerScoreDeadline: ky.managerScoreDeadline,
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

  // ==================================================== truy vấn và CRUD

  /**
   * Danh sách kỳ, mới nhất trước.
   *
   * `scorecardCount` lấy bằng MỘT lệnh groupBy cho cả trang. Đếm trong vòng
   * lặp là 12 truy vấn cho một năm, và con số đó tăng theo dữ liệu chứ
   * không đứng yên.
   */
  async list(query: ListPeriodsQuery): Promise<PeriodSummary[]> {
    const ky = await this.prisma.period.findMany({
      where: {
        type: query.type,
        ...(query.year
          ? {
              startDate: {
                gte: new Date(Date.UTC(query.year, 0, 1)),
                lte: new Date(Date.UTC(query.year, 11, 31)),
              },
            }
          : {}),
      },
      orderBy: { startDate: 'desc' },
      include: { createdBy: { select: { fullName: true } } },
    });
    if (ky.length === 0) return [];

    const demTheoKy = await this.prisma.scorecard.groupBy({
      by: ['periodId'],
      where: { periodId: { in: ky.map((k) => k.id) } },
      _count: { _all: true },
    });
    const dem = new Map(demTheoKy.map((d) => [d.periodId, d._count._all]));

    return ky.map((k) => ({
      id: k.id,
      code: k.code,
      name: k.name,
      type: k.type,
      startDate: k.startDate,
      endDate: k.endDate,
      assignDeadline: k.assignDeadline,
      selfScoreDeadline: k.selfScoreDeadline,
      managerScoreDeadline: k.managerScoreDeadline,
      submitDeadline: k.submitDeadline,
      isLocked: k.isLocked,
      createdById: k.createdById,
      createdByName: k.createdBy?.fullName ?? null,
      scorecardCount: dem.get(k.id) ?? 0,
    }));
  }

  /**
   * Tạo kỳ thủ công. Dùng khi HCNS cần kỳ quá khứ mà tác vụ tự sinh cố ý
   * không bù — xem `cacKyCanBaoDam`.
   */
  async create(
    dto: CreatePeriodDto,
    user: AuthenticatedUser,
    ip?: string | null,
  ): Promise<Period> {
    const batDau = this.ngayThuan(dto.startDate);
    const ketThuc = this.ngayThuan(dto.endDate);
    if (batDau > ketThuc) {
      throw new BadRequestException('Ngày bắt đầu phải trước ngày kết thúc');
    }

    this.assertHanHopLe(dto);

    if (dto.parentId) {
      const cha = await this.prisma.period.findUnique({ where: { id: dto.parentId } });
      if (!cha) throw new NotFoundException('Không tìm thấy kỳ cha');
    }

    // Kiểm trước để có thông điệp tiếng Việt rõ ràng; ràng buộc unique của
    // database vẫn là chốt chặn cuối nếu hai người tạo cùng lúc.
    const trung = await this.prisma.period.findFirst({
      where: { OR: [{ code: dto.code }, { name: dto.name }] },
      select: { code: true, name: true },
    });
    if (trung) {
      throw new ConflictException(
        trung.code === dto.code
          ? `Đã có kỳ mang mã "${dto.code}"`
          : `Đã có kỳ mang tên "${dto.name}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const moi = await tx.period.create({
        data: {
          code: dto.code,
          name: dto.name,
          type: dto.type,
          startDate: batDau,
          endDate: ketThuc,
          assignDeadline: this.ngayThuanHoacNull(dto.assignDeadline),
          selfScoreDeadline: this.ngayThuanHoacNull(dto.selfScoreDeadline),
          managerScoreDeadline: this.ngayThuanHoacNull(dto.managerScoreDeadline),
          submitDeadline: this.ngayThuanHoacNull(dto.submitDeadline),
          parentId: dto.parentId ?? null,
          createdById: user.id,
        },
      });
      await this.audit.log(
        {
          actorId: user.id,
          entityType: 'Period',
          entityId: moi.id,
          action: 'CREATE',
          after: { code: moi.code, name: moi.name, type: moi.type },
          ipAddress: ip,
        },
        tx,
      );
      return moi;
    });
  }

  lock(id: string, user: AuthenticatedUser, ip?: string | null): Promise<Period> {
    return this.doiTrangThaiKhoa(id, true, user, ip);
  }

  unlock(id: string, user: AuthenticatedUser, ip?: string | null): Promise<Period> {
    return this.doiTrangThaiKhoa(id, false, user, ip);
  }

  // -------------------------------------------------------------- nội bộ

  /**
   * CHỈ kỳ THÁNG mới khoá được.
   *
   * Khoá kỳ quý hay kỳ năm không chặn được gì: điểm quý là trung bình cộng
   * ba tháng, và khoá kỳ cha KHÔNG lan xuống kỳ con (`quy-tac-nghiep-vu.md`
   * mục 5.6). Để bấm được một nút không có tác dụng là mời người dùng hiểu
   * nhầm rằng sổ đã chốt.
   */
  private async doiTrangThaiKhoa(
    id: string,
    khoa: boolean,
    user: AuthenticatedUser,
    ip?: string | null,
  ): Promise<Period> {
    const ky = await this.prisma.period.findUnique({ where: { id } });
    if (!ky) throw new NotFoundException('Không tìm thấy kỳ đánh giá');

    if (ky.type !== PeriodType.MONTH) {
      throw new BadRequestException(
        `Chỉ khoá được kỳ THÁNG. "${ky.name}" là kỳ tổng hợp — điểm của nó ` +
          'tính từ các kỳ tháng bên trong, và khoá kỳ cha không khoá kỳ con.',
      );
    }
    // Nói rõ TRẠNG THÁI HIỆN TẠI, không báo lỗi chung chung: người bấm nút
    // cần biết kỳ đang ở đâu và làm gì tiếp, chứ không phải biết mình vừa
    // bấm sai.
    if (ky.isLocked === khoa) {
      throw new BadRequestException(
        khoa
          ? `Kỳ "${ky.name}" đã được khoá${this.khoaLuc(ky.lockedAt)}. ` +
            'Sổ của kỳ này đang chốt — muốn sửa điểm thì phải mở kỳ trước.'
          : `Kỳ "${ky.name}" đang mở, không cần mở lại. ` +
            'Điểm của kỳ này vẫn sửa được bình thường.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const sau = await tx.period.update({
        where: { id },
        data: {
          isLocked: khoa,
          lockedAt: khoa ? new Date() : null,
          lockedById: khoa ? user.id : null,
        },
      });
      await this.audit.log(
        {
          actorId: user.id,
          entityType: 'Period',
          entityId: id,
          action: khoa ? 'LOCK' : 'UNLOCK',
          before: { isLocked: ky.isLocked },
          after: { isLocked: sau.isLocked },
          ipAddress: ip,
        },
        tx,
      );
      return sau;
    });
  }

  /** " lúc 14:30 ngày 03/09/2026" — giờ Việt Nam, hoặc chuỗi rỗng nếu không rõ. */
  private khoaLuc(moc: Date | null): string {
    if (!moc) return '';
    const d = new Intl.DateTimeFormat('vi-VN', {
      timeZone: MUI_GIO,
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(moc);
    return ` lúc ${d}`;
  }

  /**
   * Bốn mốc trong tháng chỉ có nghĩa với kỳ THÁNG.
   *
   * Kỳ quý và kỳ năm chỉ để tổng hợp — không ai tự đánh giá theo quý, cũng
   * không ai gửi HCNS kết quả quý.
   */
  private assertHanHopLe(dto: CreatePeriodDto): void {
    if (dto.type === PeriodType.MONTH) return;

    const daDat = (
      [
        ['hạn lên KPI', dto.assignDeadline],
        ['hạn tự đánh giá', dto.selfScoreDeadline],
        ['hạn chấm điểm', dto.managerScoreDeadline],
        ['hạn gửi HCNS', dto.submitDeadline],
      ] as const
    )
      .filter(([, v]) => !!v)
      .map(([ten]) => ten);

    if (daDat.length > 0) {
      throw new BadRequestException(
        `Chỉ kỳ THÁNG mới có ${daDat.join(', ')}. Kỳ quý và kỳ năm chỉ để ` +
          'tổng hợp, không ai nộp kết quả theo quý.',
      );
    }
  }

  private ngayThuanHoacNull(chuoi?: string): Date | null {
    return chuoi ? this.ngayThuan(chuoi) : null;
  }

  /**
   * Chuỗi `YYYY-MM-DD` thành `Date` ngày-thuần, khớp cột `@db.Date`.
   *
   * Tự ghép `Date.UTC` chứ KHÔNG dùng `new Date('2026-10-02')` — hàm dựng
   * của JavaScript đọc chuỗi đó theo UTC nhưng đọc `'2026-10-02T00:00'`
   * theo giờ máy, một khác biệt quá dễ trượt chân.
   */
  private ngayThuan(chuoi: string): Date {
    const [nam, thang, ngay] = chuoi.split('-').map(Number);
    return new Date(Date.UTC(nam, thang - 1, ngay));
  }
}
