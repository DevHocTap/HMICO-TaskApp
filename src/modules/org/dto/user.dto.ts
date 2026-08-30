import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const MA_NHAN_VIEN = /^[A-Z0-9-]+$/;

export class CreateUserDto {
  @IsString()
  @MinLength(2, { message: 'Mã nhân viên quá ngắn' })
  @MaxLength(20)
  @Matches(MA_NHAN_VIEN, {
    message: 'Mã nhân viên chỉ gồm chữ in hoa, số và dấu gạch ngang',
  })
  employeeCode!: string;

  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email!: string;

  @IsString()
  @MinLength(2, { message: 'Họ tên quá ngắn' })
  @MaxLength(200)
  fullName!: string;

  @IsEnum(Role, { message: 'Vai trò không hợp lệ' })
  role!: Role;

  @IsOptional()
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Chức danh không hợp lệ' })
  jobTitleId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  level?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Người quản lý không hợp lệ' })
  managerId?: string | null;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(MA_NHAN_VIEN, {
    message: 'Mã nhân viên chỉ gồm chữ in hoa, số và dấu gạch ngang',
  })
  employeeCode?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Vai trò không hợp lệ' })
  role?: Role;

  @IsOptional()
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Chức danh không hợp lệ' })
  jobTitleId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  level?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Người quản lý không hợp lệ' })
  managerId?: string | null;
}

export class ListUsersQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100, { message: 'Mỗi trang tối đa 100 dòng' })
  limit?: number;

  /** Lọc theo phòng ban, BAO GỒM cả các phòng con. */
  @IsOptional()
  @IsUUID('4', { message: 'Phòng ban không hợp lệ' })
  departmentId?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'Vai trò không hợp lệ' })
  role?: Role;

  @IsOptional()
  @IsUUID('4', { message: 'Chức danh không hợp lệ' })
  jobTitleId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;

  /** Tìm theo họ tên hoặc mã nhân viên. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/**
 * Nhân viên trả ra ngoài.
 *
 * Khai tường minh, KHÔNG bao giờ trả thẳng object của Prisma: bản ghi User
 * chứa `passwordHash`, và thêm cột nhạy cảm vào schema sau này sẽ vô tình
 * lọt ra API nếu trả thẳng.
 */
export interface UserResponse {
  id: string;
  employeeCode: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  departmentName: string | null;
  jobTitleId: string | null;
  jobTitleName: string | null;
  level: string | null;
  managerId: string | null;
  managerName: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
}

export interface PaginatedUsers {
  data: UserResponse[];
  total: number;
  page: number;
  limit: number;
}

/** Mật khẩu tạm chỉ trả về ĐÚNG MỘT LẦN, không lưu lại để xem lại. */
export interface ResetPasswordResponse {
  temporaryPassword: string;
}
