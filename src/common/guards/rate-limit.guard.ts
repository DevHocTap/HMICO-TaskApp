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
  type RateLimitRule,
} from '../decorators/rate-limit.decorator.js';

interface Counter {
  count: number;
  resetAt: number;
}

const CLEANUP_INTERVAL_MS = 60_000;

/**
 * Giới hạn tần suất gọi, đếm trong bộ nhớ tiến trình.
 *
 * VÌ SAO TỰ VIẾT thay vì dùng @nestjs/throttler: bản mới nhất của thư viện
 * đó (6.5.0) chỉ khai hỗ trợ NestJS tới 11, chưa có bản nào cho NestJS 12.
 * Cài đè bằng --legacy-peer-deps là dùng tổ hợp chưa ai kiểm thử cho một
 * chốt bảo mật — hỏng thì hỏng lặng lẽ.
 *
 * GIỚI HẠN: đếm trong bộ nhớ nên chỉ đúng khi chạy MỘT tiến trình, và mất
 * sạch khi khởi động lại. Dự án cố ý chạy MỘT tiến trình Node trên một máy
 * chủ — với 200 người thì thừa sức, và rẻ hơn dựng Redis rất nhiều. Chạy
 * PM2 cluster hay nhiều container thì hạn mức thực tế bị nhân lên theo số
 * tiến trình; muốn vậy phải chuyển bộ đếm sang Redis trước.
 *
 * SAU NGINX PHẢI BẬT `TRUST_PROXY`. Không bật thì `request.ip` là địa chỉ
 * của nginx, mọi người dùng gộp làm một, và lớp `ip+email` mất luôn phần
 * `ip` — xem `src/main.ts`.
 */
@Injectable()
export class RateLimitGuard implements CanActivate, OnModuleDestroy {
  private readonly counters = new Map<string, Counter>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(private readonly reflector: Reflector) {
    // Không dọn thì Map phình mãi theo số cặp (IP, email) từng gọi
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  canActivate(context: ExecutionContext): boolean {
    const rules = this.reflector.getAllAndOverride<RateLimitRule[]>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rules || rules.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ ip?: string; body?: Record<string, unknown> }>();
    const ip = request.ip ?? 'khong-ro';
    const email = this.docEmail(request.body);
    const now = Date.now();

    // Kiểm HẾT các luật, luật nào vượt trước thì chặn. Không dừng ở luật
    // đầu tiên còn dư chỗ: mỗi luật một bộ đếm riêng, bỏ qua là luật kia
    // không bao giờ đếm tới.
    for (const rule of rules) {
      const key = [
        context.getHandler().name,
        rule.theo ?? 'ip',
        ip,
        rule.theo === 'ip+email' ? email : '',
      ].join(':');

      const limit = this.docHanMuc(rule);
      const counter = this.counters.get(key);

      if (!counter || counter.resetAt <= now) {
        this.counters.set(key, { count: 1, resetAt: now + rule.windowMs });
        continue;
      }

      counter.count += 1;
      if (counter.count > limit) {
        throw new HttpException(
          'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    return true;
  }

  /**
   * Email trong body, chuẩn hoá về chữ thường.
   *
   * Không chuẩn hoá thì `A@hmico.vn` và `a@hmico.vn` thành hai bộ đếm khác
   * nhau, và kẻ dò mật khẩu chỉ cần đổi hoa thường là nhân đôi hạn mức.
   * Body không có email (hoặc không phải chuỗi) thì gộp vào một khoá chung
   * — vẫn đếm, chỉ là không tách được theo tài khoản.
   */
  private docEmail(body: Record<string, unknown> | undefined): string {
    const thoDaiEmail = body?.email;
    if (typeof thoDaiEmail !== 'string') return '(khong-email)';
    const sach = thoDaiEmail.trim().toLowerCase();
    return sach.length > 0 ? sach : '(khong-email)';
  }

  /** Biến môi trường ghi đè hạn mức; giá trị không hợp lệ thì dùng mặc định. */
  private docHanMuc(rule: RateLimitRule): number {
    if (!rule.envVar) return rule.limit;
    const thoDaiSo = Number(process.env[rule.envVar]);
    return Number.isInteger(thoDaiSo) && thoDaiSo > 0 ? thoDaiSo : rule.limit;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) this.counters.delete(key);
    }
  }
}
