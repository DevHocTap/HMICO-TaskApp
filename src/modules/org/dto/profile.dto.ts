import { Gender } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/** Số điện thoại Việt Nam: 10 chữ số bắt đầu bằng 0, cho phép +84. */
const SO_DIEN_THOAI = /^(\+84|0)\d{9,10}$/;
/** CCCD 12 số (CMND cũ 9 số vẫn còn lưu hành tới hết 2024, cho cả hai). */
const CCCD = /^\d{9}$|^\d{12}$/;

/**
 * Phần nhân viên TỰ sửa được. Mọi trường đều tuỳ chọn và cho phép `null`
 * để xoá. Trường KHÔNG có ở đây (họ tên, mã NV, ngày vào làm…) mà gửi lên
 * thì `forbidNonWhitelisted` từ chối 400 — không lặng lẽ bỏ qua.
 */
export class UpdateMyProfileDto {
  @IsOptional()
  @Matches(SO_DIEN_THOAI, { message: 'Số điện thoại không đúng định dạng (10 số, bắt đầu bằng 0)' })
  phone?: string | null;

  @IsOptional()
  @IsEmail({}, { message: 'Email cá nhân không đúng định dạng' })
  personalEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Ngày sinh không hợp lệ' })
  dateOfBirth?: string | null;

  @IsOptional()
  @IsEnum(Gender, { message: 'Giới tính không hợp lệ' })
  gender?: Gender | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  emergencyContact?: string | null;
}

/** Phần chỉ HR / ADMIN ghi — gồm cả các trường tự sửa. */
export class UpdateEmployeeProfileDto extends UpdateMyProfileDto {
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Ngày vào làm không hợp lệ' })
  hireDate?: string | null;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Ngày nghỉ việc không hợp lệ' })
  terminationDate?: string | null;

  @IsOptional()
  @Matches(CCCD, { message: 'Số CCCD phải là 12 chữ số (hoặc CMND 9 số)' })
  nationalId?: string | null;
}

export interface ProfileResponse {
  // Phần tài khoản — chỉ đọc ở màn hồ sơ, HR sửa ở màn Nhân viên
  userId: string;
  employeeCode: string;
  email: string;
  fullName: string;
  departmentName: string | null;
  jobTitleName: string | null;
  level: string | null;
  managerName: string | null;
  // Hồ sơ
  phone: string | null;
  personalEmail: string | null;
  address: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  emergencyContact: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  nationalId: string | null;
  /** Người gọi có được sửa phần HR không — để màn hình mở/khoá ô. */
  canEditHrFields: boolean;
}
