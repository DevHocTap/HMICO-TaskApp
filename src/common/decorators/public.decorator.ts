import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'khong_can_dang_nhap';

/**
 * Đánh dấu endpoint không cần đăng nhập.
 *
 * Mặc định MỌI endpoint đều phải có token — quên gắn Guard sẽ không tạo
 * ra lỗ hổng, chỉ làm endpoint không truy cập được. Sai theo hướng an toàn.
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
