import { AssignStatus, ResultStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateScorecardDto {
  @IsUUID('4', { message: 'Nhân viên không hợp lệ' })
  userId!: string;

  @IsUUID('4', { message: 'Kỳ đánh giá không hợp lệ' })
  periodId!: string;

  /**
   * Chỉ định người chấm thủ công.
   *
   * Đường thoát cho phòng chưa có trưởng bộ phận: ADMIN/HR gán tay thay vì
   * chờ cơ cấu tổ chức hoàn thiện. Bỏ trống thì lấy Department.managerId.
   */
  @IsOptional()
  @IsUUID('4', { message: 'Người chấm không hợp lệ' })
  evaluatorId?: string;
}

export class BatchCreateScorecardDto {
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId!: string;

  @IsUUID('4', { message: 'Kỳ đánh giá không hợp lệ' })
  periodId!: string;

  /** Bỏ trống thì làm cho toàn bộ nhân viên đang hoạt động của phòng. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('4', { each: true, message: 'Danh sách nhân viên có id không hợp lệ' })
  userIds?: string[];

  @IsOptional()
  @IsUUID('4', { message: 'Người chấm không hợp lệ' })
  evaluatorId?: string;
}

export class CopyFromPeriodDto {
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId!: string;

  @IsUUID('4', { message: 'Kỳ nguồn không hợp lệ' })
  sourcePeriodId!: string;

  @IsUUID('4', { message: 'Kỳ đích không hợp lệ' })
  targetPeriodId!: string;
}

export class ProposeDto {
  /** Bắt buộc khi gửi lại từ trạng thái có ý kiến. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class BatchProposeDto {
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId!: string;

  @IsUUID('4', { message: 'Kỳ đánh giá không hợp lệ' })
  periodId!: string;
}

export class DisputeDto {
  @IsString()
  @MinLength(5, { message: 'Vui lòng nêu lý do, ít nhất 5 ký tự' })
  @MaxLength(2000)
  reason!: string;
}

export class ListScorecardsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @IsUUID('4')
  periodId?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsUUID('4')
  ownerUserId?: string;

  @IsOptional()
  @IsEnum(AssignStatus, { message: 'Trạng thái giao KPI không hợp lệ' })
  assignStatus?: AssignStatus;

  @IsOptional()
  @IsEnum(ResultStatus, { message: 'Trạng thái chấm điểm không hợp lệ' })
  resultStatus?: ResultStatus;
}

export class ReadinessQuery {
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId!: string;
}

// ---------------------------------------------------------------- trả về

/** Một người bị bỏ qua khi sinh phiếu hàng loạt, kèm lý do cụ thể. */
export interface NguoiBiBoQua {
  userId: string;
  employeeCode: string;
  fullName: string;
  reason: string;
}

export interface KetQuaHangLoat {
  created: number;
  skipped: number;
  skippedDetails: NguoiBiBoQua[];
  /** Cảnh báo không chặn: phiếu vẫn tạo nhưng cần người dùng để mắt. */
  warnings: NguoiBiBoQua[];
}

export interface ScorecardSummary {
  id: string;
  ownerUserId: string | null;
  ownerName: string | null;
  employeeCode: string | null;
  periodId: string;
  periodCode: string;
  departmentId: string;
  departmentName: string;
  jobTitleName: string;
  evaluatorId: string | null;
  evaluatorName: string | null;
  assignStatus: AssignStatus;
  resultStatus: ResultStatus;
  proposedAt: Date | null;
  acceptedAt: Date | null;
  disputedAt: Date | null;
  disputeReason: string | null;
  /** Tổng trọng số tiêu chí cấp 1, tính bằng groupBy — không nạp cây item. */
  totalWeight: string;
  itemCount: number;
}

export interface PaginatedScorecards {
  data: ScorecardSummary[];
  total: number;
  page: number;
  limit: number;
}

/** Một việc cần xử lý, hiện trên trang "Việc của tôi". */
export interface ViecCanXuLy {
  type: string;
  message: string;
  count: number;
  link: string;
  daysUntilDeadline: number | null;
}
