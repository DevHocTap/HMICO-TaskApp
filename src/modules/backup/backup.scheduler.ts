import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BackupService } from './backup.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { MUI_GIO } from '../period/period-calendar.js';
import { phanNgayVN } from './backup-file.js';

/**
 * Sao lưu tự động hằng đêm theo giờ đặt trong Cài đặt (`saoLuu.gioChay`).
 *
 * Cron chạy MỖI GIỜ rồi tự so với giờ cài đặt — đổi giờ trong Cài đặt là có
 * hiệu lực ngay, không phải đăng ký lại cron. Lúc khởi động cũng kiểm: máy
 * chủ tắt đúng giờ sao lưu thì bật lên là bù, không đợi đêm sau — nhưng chỉ
 * bù nếu ĐÃ QUA giờ cài đặt của hôm nay và hôm nay chưa có bản.
 */
@Injectable()
export class BackupScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackupScheduler.name);

  constructor(
    private readonly backup: BackupService,
    private readonly settings: SettingsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.kiemVaChay('lúc khởi động');
  }

  @Cron('0 * * * *', { name: 'sao-luu-hang-dem', timeZone: MUI_GIO })
  async moiGio(): Promise<void> {
    await this.kiemVaChay('theo lịch');
  }

  private async kiemVaChay(boiCanh: string): Promise<void> {
    const s = this.settings.lay().saoLuu;
    if (!s.tuDongHangDem) return;
    const bayGio = new Date();
    if (phanNgayVN(bayGio).gio < s.gioChay) return; // chưa tới giờ hôm nay
    try {
      if (await this.backup.daCoBanTrongNgay(bayGio)) return;
      this.logger.log(`Sao lưu tự động (${boiCanh})`);
      await this.backup.saoLuu('TU_DONG', null);
    } catch (error) {
      // Đã ghi AuditLog BACKUP_FAILED và loiGanNhat trong service; không để sập app
      this.logger.error(`Sao lưu tự động thất bại (${boiCanh})`, error instanceof Error ? error.stack : undefined);
    }
  }
}
