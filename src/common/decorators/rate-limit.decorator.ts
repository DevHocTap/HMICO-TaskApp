import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'gioi_han_tan_suat';

/**
 * Đếm theo cái gì.
 *
 * `ip` — mọi request từ một địa chỉ IP dùng chung một bộ đếm.
 * `ip+email` — mỗi cặp (IP, email trong body) một bộ đếm riêng.
 *
 * VÌ SAO PHẢI CÓ `ip+email`: cả công ty sau NAT dùng chung MỘT địa chỉ IP
 * công cộng. Khoá theo IP thuần nghĩa là người thứ sáu đăng nhập buổi sáng
 * bị chặn vì năm người trước đã dùng hết hạn mức — dò mật khẩu không cần
 * làm gì, chỉ cần chờ. Khoá theo cặp (IP, email) thì một người gõ sai
 * không ảnh hưởng ai khác, mà kẻ dò mật khẩu của MỘT tài khoản vẫn bị chặn
 * đúng như trước.
 */
export type CachDem = 'ip' | 'ip+email';

export interface RateLimitRule {
  /** Số lần gọi tối đa trong một cửa sổ thời gian. */
  limit: number;
  /** Độ dài cửa sổ, tính bằng mili giây. */
  windowMs: number;
  /** Mặc định `ip`. */
  theo?: CachDem;
  /**
   * Tên biến môi trường ghi đè `limit`.
   *
   * Cần thiết vì hạn mức đúng phụ thuộc cách triển khai: con số hợp lý ở
   * máy dev lại quá chặt ở văn phòng 200 người.
   */
  envVar?: string;
}

/**
 * Giới hạn tần suất gọi endpoint này.
 *
 * Nhận NHIỀU luật, kiểm tất cả — luật nào vượt trước thì chặn. Dùng để xếp
 * lớp: một luật chặt theo `ip+email` chống dò mật khẩu, một luật rộng theo
 * `ip` chống một máy hoá điên.
 */
export const RateLimit = (...rules: RateLimitRule[]) =>
  SetMetadata(RATE_LIMIT_KEY, rules);
