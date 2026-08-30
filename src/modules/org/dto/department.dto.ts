import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Mã phòng: chữ hoa, số và dấu gạch ngang. Dùng làm mã hiển thị nên phải gọn. */
const MA_PHONG = /^[A-Z0-9-]+$/;

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2, { message: 'Mã phòng ban phải có ít nhất 2 ký tự' })
  @MaxLength(20, { message: 'Mã phòng ban không quá 20 ký tự' })
  @Matches(MA_PHONG, {
    message: 'Mã phòng ban chỉ gồm chữ in hoa, số và dấu gạch ngang',
  })
  code!: string;

  @IsString()
  @MinLength(2, { message: 'Tên phòng ban quá ngắn' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsUUID('4', { message: 'Phòng ban cha không hợp lệ' })
  parentId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Trưởng bộ phận không hợp lệ' })
  managerId?: string | null;
}

export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  @Matches(MA_PHONG, {
    message: 'Mã phòng ban chỉ gồm chữ in hoa, số và dấu gạch ngang',
  })
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsUUID('4', { message: 'Phòng ban cha không hợp lệ' })
  parentId?: string | null;

  @IsOptional()
  @IsUUID('4', { message: 'Trưởng bộ phận không hợp lệ' })
  managerId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Dữ liệu phòng ban trả ra ngoài.
 *
 * Khai tường minh thay vì trả thẳng object của Prisma: thêm cột vào schema
 * sau này sẽ không vô tình lọt ra API.
 */
export interface DepartmentResponse {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  managerId: string | null;
  managerName: string | null;
  isActive: boolean;
  /** Số nhân viên đang hoạt động thuộc trực tiếp phòng này. */
  userCount: number;
}

export interface DepartmentTreeNode extends DepartmentResponse {
  children: DepartmentTreeNode[];
}
