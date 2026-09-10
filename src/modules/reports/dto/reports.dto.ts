import { IsUUID } from 'class-validator';

export class ReportPeriodQuery {
  @IsUUID('4', { message: 'Kỳ đánh giá không hợp lệ' })
  periodId!: string;
}
