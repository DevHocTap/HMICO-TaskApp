import { Injectable, OnModuleDestroy } from '@nestjs/common';

interface Attempt {
  count: number;
  /** Thời điểm bắt đầu cửa sổ đếm hiện tại. */
  windowStartedAt: number;
  lockedUntil?: number;
}

const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

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

  constructor() {
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

    // Chưa có, hoặc cửa sổ 15 phút cũ đã trôi qua thì đếm lại từ đầu
    if (!attempt || now - attempt.windowStartedAt > WINDOW_MS) {
      this.attempts.set(email, { count: 1, windowStartedAt: now });
      return;
    }

    attempt.count += 1;
    if (attempt.count > MAX_FAILURES) {
      attempt.lockedUntil = now + LOCK_MS;
    }
  }

  /** Đăng nhập thành công thì xoá sạch lịch sử sai của email đó. */
  reset(email: string): void {
    this.attempts.delete(email);
  }

  private cleanup(now = Date.now()) {
    for (const [email, attempt] of this.attempts) {
      const hetKhoa = !attempt.lockedUntil || attempt.lockedUntil <= now;
      const hetCuaSo = now - attempt.windowStartedAt > WINDOW_MS;
      if (hetKhoa && hetCuaSo) this.attempts.delete(email);
    }
  }
}
