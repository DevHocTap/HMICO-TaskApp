import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PeriodService } from './period.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { MUI_GIO } from './period-calendar.js';

/**
 * Tự sinh kỳ đánh giá.
 *
 * Tài liệu ghi ADMIN khoá/mở kỳ nhưng không nói ai TẠO kỳ. Tạo tay 12 lần
 * một năm, quên đúng một lần là chặn cả công ty vào hạn nộp mùng 02.
 *
 * Chạy hai nơi, cùng một hàm:
 *   - 01:00 hằng ngày, giờ Việt Nam
 *   - mỗi lần máy chủ khởi động
 *
 * Máy chủ tắt đúng lúc 01:00 thì lần bật lên sau bù ngay, không đợi hôm sau.
 */
@Injectable()
export class PeriodScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PeriodScheduler.name);

  constructor(
    private readonly periodService: PeriodService,
    private readonly settings: SettingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.chay('lúc khởi động');
  }

  @Cron('0 1 * * *', { name: 'tu-sinh-ky', timeZone: MUI_GIO })
  async chayHangNgay(): Promise<void> {
    await this.chay('theo lịch hằng ngày');
  }

  private async chay(boiCanh: string): Promise<void> {
    // Tắt trong Cài đặt thì không sinh; HCNS tạo kỳ tay ở màn Kỳ đánh giá.
    if (!this.settings.lay().kyDanhGia.tuSinhHangThang) {
      this.logger.log(`Bỏ qua tự sinh kỳ (${boiCanh}): đã tắt trong Cài đặt hệ thống`);
      return;
    }
    try {
      const { daTao } = await this.periodService.ensurePeriodsExist();
      if (daTao.length === 0) {
        this.logger.debug(`Kiểm kỳ đánh giá ${boiCanh}: đã đủ, không tạo thêm`);
      }
    } catch (error) {
      // Không để lỗi ở đây làm sập ứng dụng: thiếu kỳ thì tạo tay được,
      // còn máy chủ không lên thì cả hệ thống dừng.
      this.logger.error(
        `Không tự sinh được kỳ đánh giá (${boiCanh})`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
