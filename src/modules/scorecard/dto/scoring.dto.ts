import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Một ô điểm gửi lên khi lưu nháp.
 *
 * `score = null` nghĩa là XOÁ điểm đã nhập, khác hẳn với việc không gửi
 * dòng đó lên (không gửi = giữ nguyên).
 */
export class ScoreInput {
  @IsUUID('4', { message: 'Tiêu chí không hợp lệ' })
  itemId!: string;

  /**
   * Trần trên đây là trần TUYỆT ĐỐI cho mọi thang, chỉ để chặn số vô lý
   * sớm. Trần thật theo `section` (12 với BSC, 3 với nội quy) do
   * `tranDiemCuaDong()` của engine kiểm — DTO không biết dòng này thuộc mục
   * nào nên không kiểm thay được.
   *
   * `maxDecimalPlaces: 2` là ràng buộc THẬT, không phải cho đẹp: cột là
   * `Decimal(6,2)`. Nhập 8,257 mà không chặn thì Prisma làm tròn im lặng
   * thành 8,26 và người chấm không hề biết điểm mình cho đã bị đổi.
   */
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Điểm chỉ được có tối đa 2 chữ số thập phân' },
  )
  @Min(0, { message: 'Điểm không được âm' })
  @Max(9999, { message: 'Điểm không hợp lệ' })
  score!: number | null;

  /** `undefined` = giữ nguyên ghi chú cũ; `null` hoặc chuỗi rỗng = xoá. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string | null;
}

export class SaveScoresDto {
  @IsArray()
  @ArrayMaxSize(500, { message: 'Phiếu KPI không được quá 500 dòng' })
  @ValidateNested({ each: true })
  @Type(() => ScoreInput)
  scores!: ScoreInput[];
}

export class RejectScorecardDto {
  @IsString()
  @MinLength(5, { message: 'Vui lòng nêu lý do trả lại, ít nhất 5 ký tự' })
  @MaxLength(2000)
  reason!: string;
}

export class ManagerSubmitDto {
  /**
   * Lý do phiếu không có cột tự chấm — CHỈ dùng cho người đã nghỉ việc.
   *
   * Đây là đường DUY NHẤT chốt được phiếu mà cột tự chấm còn trống. Bắt
   * buộc ghi lý do để về sau còn biết vì sao phiếu này thiếu một cột.
   */
  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'Lý do không có điểm tự chấm phải ít nhất 5 ký tự' })
  @MaxLength(2000)
  noSelfScoreReason?: string;
}
