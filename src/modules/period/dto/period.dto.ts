import { PeriodType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Ngày nhập vào dạng `YYYY-MM-DD`, KHÔNG nhận chuỗi ISO có giờ.
 *
 * `startDate`, `endDate`, `submitDeadline` đều là cột `@db.Date` — ngày lịch
 * thuần, không phải thời điểm. Nhận `2026-10-02T00:00:00+07:00` rồi để
 * JavaScript tự quy đổi sẽ lưu thành 01/10, đúng loại lỗi lệch một ngày đã
 * sửa ở GĐ2.6. Xem `tinhTinhTrangHanNop()` trong `period-calendar.ts`.
 */
const DANG_NGAY = /^\d{4}-\d{2}-\d{2}$/;
const LOI_NGAY = 'Ngày phải ở dạng YYYY-MM-DD';

export class CreatePeriodDto {
  @IsString()
  @MinLength(4, { message: 'Mã kỳ quá ngắn' })
  @MaxLength(20, { message: 'Mã kỳ quá dài' })
  code!: string;

  @IsString()
  @MinLength(3, { message: 'Tên kỳ quá ngắn' })
  @MaxLength(100, { message: 'Tên kỳ quá dài' })
  name!: string;

  @IsEnum(PeriodType, { message: 'Loại kỳ phải là MONTH, QUARTER hoặc YEAR' })
  type!: PeriodType;

  @Matches(DANG_NGAY, { message: `Ngày bắt đầu: ${LOI_NGAY}` })
  startDate!: string;

  @Matches(DANG_NGAY, { message: `Ngày kết thúc: ${LOI_NGAY}` })
  endDate!: string;

  /**
   * Bốn mốc dưới đây CHỈ kỳ MONTH được có. Kỳ quý và năm chỉ để tổng hợp.
   * Bỏ trống thì kỳ tạo tay không có hạn nào — khác với kỳ tự sinh, vốn
   * luôn đủ bốn mốc.
   */
  @IsOptional()
  @Matches(DANG_NGAY, { message: `Hạn lên KPI: ${LOI_NGAY}` })
  assignDeadline?: string;

  @IsOptional()
  @Matches(DANG_NGAY, { message: `Hạn tự đánh giá: ${LOI_NGAY}` })
  selfScoreDeadline?: string;

  @IsOptional()
  @Matches(DANG_NGAY, { message: `Hạn chấm điểm: ${LOI_NGAY}` })
  managerScoreDeadline?: string;

  @IsOptional()
  @Matches(DANG_NGAY, { message: `Hạn gửi HCNS: ${LOI_NGAY}` })
  submitDeadline?: string;

  /** Kỳ cha: tháng thuộc quý, quý thuộc năm. Bỏ trống thì để rời. */
  @IsOptional()
  @IsUUID('4', { message: 'Kỳ cha không hợp lệ' })
  parentId?: string;
}

export class ListPeriodsQuery {
  @IsOptional()
  @IsEnum(PeriodType, { message: 'Loại kỳ phải là MONTH, QUARTER hoặc YEAR' })
  type?: PeriodType;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Năm phải là số nguyên' })
  @Min(2000, { message: 'Năm không hợp lệ' })
  @Max(2100, { message: 'Năm không hợp lệ' })
  year?: number;
}

/** Một dòng trong danh sách kỳ. */
export interface PeriodSummary {
  id: string;
  code: string;
  name: string;
  type: PeriodType;
  startDate: Date;
  endDate: Date;
  /** Hạn trưởng phòng lên KPI cho kỳ này — ngày 25 THÁNG TRƯỚC. */
  assignDeadline: Date | null;
  /** Hạn nhân viên tự đánh giá — ngày 25. */
  selfScoreDeadline: Date | null;
  /** Hạn trưởng phòng chấm xong và chốt — ngày 29. */
  managerScoreDeadline: Date | null;
  /** Hạn gửi HCNS tổng hợp — ngày 30. */
  submitDeadline: Date | null;
  isLocked: boolean;
  /** NULL = hệ thống tự sinh; có giá trị = người tạo tay. */
  createdById: string | null;
  createdByName: string | null;
  /** Số phiếu KPI đã lập trong kỳ — cảnh báo trước khi khoá hoặc sửa. */
  scorecardCount: number;
}
