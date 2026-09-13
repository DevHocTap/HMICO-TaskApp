import { BoolQuery } from '../../../common/transforms/bool-query.js';
import { KpiSection, ScoringMode, TemplateStatus } from '@prisma/client';
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
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const MA_MAU = /^[A-Z0-9-]+$/;

export class CreateTemplateDto {
  @IsString()
  @MinLength(2, { message: 'Mã mẫu phải có ít nhất 2 ký tự' })
  @MaxLength(30)
  @Matches(MA_MAU, { message: 'Mã mẫu chỉ gồm chữ in hoa, số và dấu gạch ngang' })
  code!: string;

  @IsString()
  @MinLength(2, { message: 'Tên mẫu quá ngắn' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Chức danh không hợp lệ' })
  jobTitleId?: string | null;

  /**
   * Mẫu nội quy CỦA MỘT PHÒNG (13/09/2026): `isSystem = true` kèm
   * `departmentId`, không có `jobTitleId`. Trưởng bộ phận chỉ tạo cho phòng
   * mình; mẫu nội quy dùng chung (không phòng) không tạo qua đây.
   */
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @IsOptional()
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId?: string | null;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(MA_MAU, { message: 'Mã mẫu chỉ gồm chữ in hoa, số và dấu gạch ngang' })
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Chức danh không hợp lệ' })
  jobTitleId?: string | null;
}

export class DuplicateTemplateDto {
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(MA_MAU, { message: 'Mã mẫu chỉ gồm chữ in hoa, số và dấu gạch ngang' })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Chức danh không hợp lệ' })
  jobTitleId?: string | null;

  /** Chép mẫu nội quy về một phòng — chỉ có nghĩa khi mẫu gốc là mẫu nội quy. */
  @IsOptional()
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId?: string | null;
}

export class ListTemplatesQuery {
  @IsOptional()
  @IsUUID('4', { message: 'Chức danh không hợp lệ' })
  jobTitleId?: string;

  @IsOptional()
  @IsEnum(TemplateStatus, { message: 'Trạng thái không hợp lệ' })
  status?: TemplateStatus;

  /** Kèm cả mẫu đã ngừng sử dụng — để kích hoạt lại khi bấm nhầm (13/09). */
  @IsOptional()
  @BoolQuery()
  @IsBoolean()
  includeInactive?: boolean;
}

/**
 * Một dòng trong cây item khi lưu.
 *
 * `key` là khoá TẠM do giao diện sinh ra — dòng mới chưa có id trong
 * database. Quan hệ cha con biểu diễn bằng `key`/`parentKey`, không dùng
 * id thật, nên giao diện gửi được cả cây mới lẫn cây đã sửa trong một lần.
 */
export class TemplateItemInput {
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

  @IsOptional()
  @IsEnum(ScoringMode)
  scoringMode?: ScoringMode;

  @IsInt()
  @Min(0)
  displayOrder!: number;
}

export class SaveItemsDto {
  @IsArray()
  @ArrayMaxSize(500, { message: 'Mẫu KPI không được quá 500 dòng' })
  @ValidateNested({ each: true })
  @Type(() => TemplateItemInput)
  items!: TemplateItemInput[];
}

// ------------------------------------------------------------ trả về

export interface TemplateItemResponse {
  id: string;
  parentId: string | null;
  name: string;
  description: string | null;
  section: KpiSection;
  measurementText: string | null;
  measureMethod: string | null;
  /** Chuỗi để không mất độ chính xác của Decimal khi qua JSON. */
  weight: string;
  scoringMode: ScoringMode;
  displayOrder: number;
  /** Suy ra từ section, không lưu trong database. */
  maxScale: number;
  children: TemplateItemResponse[];
}

export interface TemplateResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  jobTitleId: string | null;
  jobTitleName: string | null;
  isSystem: boolean;
  /** Mẫu nội quy của phòng: khác null. Mẫu nội quy dùng chung: null. */
  departmentId: string | null;
  departmentName: string | null;
  status: TemplateStatus;
  version: number;
  isActive: boolean;
  /** Số tiêu chí cấp 1. */
  criteriaCount: number;
  /** Số KPI con (cấp 2). */
  subCriteriaCount: number;
  /**
   * Tổng trọng số của MỤC MÀ MẪU CHỊU TRÁCH NHIỆM: mẫu chức danh là mục BSC
   * (phải đủ 70), mẫu hệ thống là mục nội quy (phải đủ 30). Chuỗi Decimal.
   */
  weightTotal: string;
  /** 70 với mẫu chức danh, 30 với mẫu hệ thống — để giao diện vẽ thanh. */
  weightRequired: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplateDetailResponse extends TemplateResponse {
  items: TemplateItemResponse[];
}
