import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'gioi_han_tan_suat';

export interface RateLimitOptions {
  /** Số lần gọi tối đa trong một cửa sổ thời gian. */
  limit: number;
  /** Độ dài cửa sổ, tính bằng mili giây. */
  windowMs: number;
}

/** Giới hạn số lần một địa chỉ IP được gọi endpoint này. */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
