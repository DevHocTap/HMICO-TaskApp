import { AssignStatus, Grade, KpiSection, Prisma, ResultStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
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

  /**
   * Sinh phiếu RỖNG: chỉ dựng Mục 2, Mục 1 để trống chờ nhập trực tiếp.
   *
   * Dành cho trưởng bộ phận — chức danh của họ không có mẫu KPI, ban giám
   * đốc nhập KPI thẳng vào phiếu rồi hai bên trao đổi và chốt.
   *
   * CỐ Ý không có ở batch và copy: sinh phiếu rỗng phải là hành động có chủ
   * đích trên từng người, không phải thao tác hàng loạt.
   */
  @IsOptional()
  @IsBoolean()
  emptyTemplate?: boolean;
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

/**
 * Một dòng khi sửa cây item của phiếu.
 *
 * `key` là khoá TẠM do giao diện sinh; dòng mới chưa có id. Quan hệ cha con
 * biểu diễn bằng key/parentKey nên gửi được cả cây mới lẫn cây đã sửa trong
 * một lần — giống hệt màn soạn mẫu KPI.
 */
export class ScorecardItemInput {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  parentKey?: string | null;

  @IsString()
  @MinLength(1, { message: 'Tên tiêu chí không được để trống' })
  @MaxLength(500)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsEnum(KpiSection, { message: 'Mục không hợp lệ' })
  section!: KpiSection;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  measurementText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  measureMethod?: string | null;

  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'Trọng số chỉ được có tối đa 2 chữ số thập phân' },
  )
  @Min(0, { message: 'Trọng số không được âm' })
  @Max(100, { message: 'Trọng số không vượt quá 100' })
  weight!: number;

  @IsInt()
  @Min(0)
  displayOrder!: number;

  /**
   * Nguồn gốc từ mẫu KPI, nếu dòng này vốn chép từ mẫu.
   *
   * Chỉ để TRA NGUỒN GỐC. Không bao giờ đọc nội dung từ mẫu qua cột này —
   * sửa mẫu về sau không được làm đổi phiếu đã lập.
   */
  @IsOptional()
  @IsUUID('4')
  templateItemId?: string | null;
}

export class SaveScorecardItemsDto {
  @IsArray()
  @ArrayMaxSize(500, { message: 'Phiếu KPI không được quá 500 dòng' })
  @ValidateNested({ each: true })
  @Type(() => ScorecardItemInput)
  items!: ScorecardItemInput[];
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

  /** Phiếu do người này chấm — khối "Phiếu cần xử lý gấp" ở Tổng quan (12/09). */
  @IsOptional()
  @IsUUID('4')
  evaluatorId?: string;
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
  /** Điểm ĐÃ CHỐT hai cột; `null` khi chưa nộp / chưa chốt. */
  selfTotalScore: Prisma.Decimal | null;
  managerTotalScore: Prisma.Decimal | null;
  grade: Grade | null;
  selfScoredAt: Date | null;
  managerScoredAt: Date | null;
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
  /**
   * Số ngày CÒN LÀM ĐƯỢC, tính cả hôm nay. Không bao giờ âm.
   * `null` = việc này không có hạn (mọi việc đầu kỳ ở giai đoạn 1).
   */
  daysUntilDeadline: number | null;
  /** Đã quá hạn. Tách riêng để giao diện không phải suy từ số âm. */
  isOverdue: boolean;
}

/**
 * Lọc thêm cho bảng giao KPI.
 *
 * `managers` = chỉ những người đang là trưởng bộ phận. Ban giám đốc mặc
 * định thấy nhóm này vì đó là nhóm họ chịu trách nhiệm giao KPI (mục 5.0).
 */
export enum PhamViGiaoKpi {
  ALL = 'all',
  MANAGERS = 'managers',
}

export class AssignmentBoardQuery {
  @IsUUID('4', { message: 'Kỳ đánh giá không hợp lệ' })
  periodId!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId?: string;

  @IsOptional()
  @IsEnum(PhamViGiaoKpi, { message: 'Phạm vi phải là all hoặc managers' })
  scope?: PhamViGiaoKpi;
}

/**
 * MỘT dòng cho MỖI nhân viên trong phạm vi — kể cả người CHƯA có phiếu.
 *
 * Khác hẳn `ScorecardSummary`: đó là danh sách PHIẾU, còn đây là danh sách
 * NGƯỜI. Màn giao KPI cần biết ai chưa được giao, mà danh sách phiếu thì
 * theo định nghĩa không chứa những người đó.
 */
export interface AssignmentBoardRow {
  userId: string;
  employeeCode: string;
  ownerName: string;
  jobTitleName: string | null;
  departmentName: string;
  /** Đang là trưởng bộ phận — ban giám đốc giao KPI cho nhóm này. */
  isDepartmentManager: boolean;

  /** Bốn trường dưới đây `null` khi người này CHƯA có phiếu trong kỳ. */
  scorecardId: string | null;
  assignStatus: AssignStatus | null;
  totalWeight: string | null;
  acceptedAt: Date | null;
  evaluatorName: string | null;
  /**
   * Bước chấm điểm và điểm đã chốt — để màn giao KPI chỉ ra ai đã được chấm,
   * ai chưa (phản hồi 12/09/2026). `null` khi chưa có phiếu.
   */
  resultStatus: ResultStatus | null;
  selfTotalScore: Prisma.Decimal | null;
  managerTotalScore: Prisma.Decimal | null;
  evaluatorId: string | null;
}
