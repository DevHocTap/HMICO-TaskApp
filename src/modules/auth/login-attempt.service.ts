import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service.js';

interface Attempt {
  count: number;
  /** Thời điểm bắt đầu cửa sổ đếm hiện tại. */
  windowStartedAt: number;
  lockedUntil?: number;
}

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
/** Cửa sổ dọn bộ nhớ: giữ bản ghi tối đa một ngày dù cài đặt khoá dài hơn. */
const GIU_TOI_DA_MS = 24 * 60 * 60 * 1000;

/**
 * Đếm số lần đăng nhập sai theo email, khoá tạm khi vượt ngưỡng.
 *
 * Bổ sung cho giới hạn theo IP: giới hạn IP chặn một máy dò nhiều mật khẩu,
 * cái này chặn nhiều máy cùng dò một tài khoản.
 *
 * QUAN TRỌNG — đếm cho MỌI chuỗi email, kể cả email không tồn tại trong hệ
 * thống. Nếu chỉ đếm email có thật thì thông báo "tài khoản tạm khoá" sẽ
 * tiết lộ email nào có thật, đúng thứ mà login đang cố giấu.
 *
 * GIỚI HẠN: đếm trong bộ nhớ tiến trình, mất khi khởi động lại và chỉ đúng
 * khi chạy MỘT tiến trình — giống RateLimitGuard. Xem docs/no-ky-thuat.md.
 */
@Injectable()
export class LoginAttemptService implements OnModuleDestroy {
  private readonly attempts = new Map<string, Attempt>();
  private readonly cleanupTimer: NodeJS.Timeout;

  /**
   * Ngưỡng và thời gian khoá lấy từ Cài đặt hệ thống (11/09/2026): mặc định
   * 10 lần / 15 phút. Tắt "khoá tạm" thì vẫn đếm nhưng không bao giờ khoá.
   */
  constructor(private readonly settings: SettingsService) {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  /** Số phút còn phải chờ, hoặc 0 nếu không bị khoá. */
  getLockRemainingMinutes(email: string, now = Date.now()): number {
    const attempt = this.attempts.get(email);
    if (!attempt?.lockedUntil || attempt.lockedUntil <= now) return 0;
    return Math.ceil((attempt.lockedUntil - now) / 60_000);
  }

  recordFailure(email: string, now = Date.now()): void {
    const attempt = this.attempts.get(email);

    const { khoaTamKhiSaiNhieu, soLanSaiToiDa, phutKhoaTam } = this.settings.lay().baoMat;
    const cuaSoMs = phutKhoaTam * 60_000;

    // Chưa có, hoặc cửa sổ đếm cũ đã trôi qua thì đếm lại từ đầu
    if (!attempt || now - attempt.windowStartedAt > cuaSoMs) {
      this.attempts.set(email, { count: 1, windowStartedAt: now });
      return;
    }

    attempt.count += 1;
    if (khoaTamKhiSaiNhieu && attempt.count > soLanSaiToiDa) {
      attempt.lockedUntil = now + cuaSoMs;
    }
  }

  /** Đăng nhập thành công thì xoá sạch lịch sử sai của email đó. */
  reset(email: string): void {
    this.attempts.delete(email);
  }

  private cleanup(now = Date.now()) {
    for (const [email, attempt] of this.attempts) {
      const hetKhoa = !attempt.lockedUntil || attempt.lockedUntil <= now;
      const cuaSoMs = Math.min(this.settings.lay().baoMat.phutKhoaTam * 60_000, GIU_TOI_DA_MS);
      const hetCuaSo = now - attempt.windowStartedAt > cuaSoMs;
      if (hetKhoa && hetCuaSo) this.attempts.delete(email);
    }
  }
}
