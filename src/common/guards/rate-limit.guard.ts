import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  RATE_LIMIT_KEY,
  type RateLimitOptions,
} from '../decorators/rate-limit.decorator.js';

interface Counter {
  count: number;
  resetAt: number;
}

const CLEANUP_INTERVAL_MS = 60_000;

/**
 * Giới hạn tần suất gọi theo IP, đếm trong bộ nhớ tiến trình.
 *
 * VÌ SAO TỰ VIẾT thay vì dùng @nestjs/throttler: bản mới nhất của thư viện
 * đó (6.5.0) chỉ khai hỗ trợ NestJS tới 11, chưa có bản nào cho NestJS 12.
 * Cài đè bằng --legacy-peer-deps là dùng tổ hợp chưa ai kiểm thử cho một
 * chốt bảo mật — hỏng thì hỏng lặng lẽ.
 *
 * GIỚI HẠN: đếm trong bộ nhớ nên chỉ đúng khi chạy MỘT tiến trình. Dự án
 * triển khai một VPS (docs/quyet-dinh-cong-nghe.md, phương án A) nên hiện
 * đủ dùng. Khi nào chạy nhiều tiến trình phải chuyển sang Redis.
 */
@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly counters = new Map<string, Counter>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(private readonly reflector: Reflector) {
    // Không dọn thì Map phình mãi theo số IP từng gọi
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const limit = this.docHanMuc(options);

    const request = context.switchToHttp().getRequest<{ ip?: string }>();
    // Sau này chạy sau nginx phải bật `trust proxy`, nếu không mọi request
    // đều mang cùng một IP và cả công ty dùng chung hạn mức.
    const key = `${context.getHandler().name}:${request.ip ?? 'khong-ro'}`;

    const now = Date.now();
    const counter = this.counters.get(key);

    if (!counter || counter.resetAt <= now) {
      this.counters.set(key, { count: 1, resetAt: now + options.windowMs });
      return true;
    }

    counter.count += 1;
    if (counter.count > limit) {
      throw new HttpException(
        'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  /** Biến môi trường ghi đè hạn mức; giá trị không hợp lệ thì dùng mặc định. */
  private docHanMuc(options: RateLimitOptions): number {
    if (!options.envVar) return options.limit;
    const thoDaiSo = Number(process.env[options.envVar]);
    return Number.isInteger(thoDaiSo) && thoDaiSo > 0 ? thoDaiSo : options.limit;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) this.counters.delete(key);
    }
  }
}
