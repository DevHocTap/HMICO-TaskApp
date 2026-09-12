import { Transform } from 'class-transformer';

/**
 * Đọc boolean từ query string.
 *
 * KHÔNG dùng `@Type(() => Boolean)`: nó gọi `Boolean("false")` và ra `true`,
 * nên `?isActive=false` từng trả về đúng danh sách người ĐANG hoạt động
 * (phát hiện 11/09/2026). Chỉ nhận đúng hai chuỗi "true"/"false"; giá trị
 * khác giữ nguyên để `@IsBoolean()` từ chối.
 */
export function BoolQuery() {
  return Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  });
}
