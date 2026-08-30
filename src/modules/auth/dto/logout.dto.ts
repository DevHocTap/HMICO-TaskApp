import { IsOptional } from 'class-validator';

export class LogoutDto {
  /**
   * Cố ý KHÔNG ràng buộc kiểu (không `@IsString()`).
   *
   * Endpoint logout phải luôn trả 204 dù token thiếu, sai định dạng, đã hết
   * hạn hay không tồn tại. Nếu ràng buộc kiểu, token sai định dạng sẽ nhận
   * 400 còn token hợp lệ nhận 204 — chênh lệch đó biến endpoint thành công
   * cụ dò xem chuỗi nào là token thật.
   */
  @IsOptional()
  refreshToken?: unknown;
}
