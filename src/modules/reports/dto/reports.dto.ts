import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportPeriodQuery {
  @IsUUID('4', { message: 'Kỳ đánh giá không hợp lệ' })
  periodId!: string;
}

/** Xu hướng N kỳ tháng gần nhất, tính lùi từ `periodId`. */
export class ReportTrendQuery extends ReportPeriodQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(24)
  months?: number;
}
