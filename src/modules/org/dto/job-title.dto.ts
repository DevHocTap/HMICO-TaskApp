import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const MA_CHUC_DANH = /^[A-Z0-9-]+$/;

export class CreateJobTitleDto {
  @IsString()
  @MinLength(2, { message: 'Mã chức danh phải có ít nhất 2 ký tự' })
  @MaxLength(30, { message: 'Mã chức danh không quá 30 ký tự' })
  @Matches(MA_CHUC_DANH, {
    message: 'Mã chức danh chỉ gồm chữ in hoa, số và dấu gạch ngang',
  })
  code!: string;

  @IsString()
  @MinLength(2, { message: 'Tên chức danh quá ngắn' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  /** Null = chức danh dùng chung toàn công ty. */
  @IsOptional()
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId?: string | null;
}

export class UpdateJobTitleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(MA_CHUC_DANH, {
    message: 'Mã chức danh chỉ gồm chữ in hoa, số và dấu gạch ngang',
  })
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListJobTitlesQuery {
  @IsOptional()
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId?: string;
}

export interface JobTitleResponse {
  id: string;
  code: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  departmentName: string | null;
  isActive: boolean;
  /** Số người đang giữ chức danh này và đang hoạt động. */
  userCount: number;
}
