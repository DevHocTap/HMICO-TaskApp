import type { Role } from './auth';

export interface Department {
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

export interface DepartmentNode extends Department {
  children: DepartmentNode[];
}

export interface JobTitle {
  id: string;
  code: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  departmentName: string | null;
  isActive: boolean;
  userCount: number;
}

export interface OrgUser {
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
  lastLoginAt: string | null;
}

export interface PaginatedUsers {
  data: OrgUser[];
  total: number;
  page: number;
  limit: number;
}

export interface ListUsersParams {
  page?: number;
  limit?: number;
  departmentId?: string;
  role?: Role;
  jobTitleId?: string;
  isActive?: boolean;
  /** Người chưa đổi mật khẩu lần đầu. */
  mustChangePassword?: boolean;
  search?: string;
}

// ------------------------------------------------------------ hồ sơ nhân sự

export type GioiTinh = 'MALE' | 'FEMALE' | 'OTHER';
export const NHAN_GIOI_TINH: Record<GioiTinh, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };

/** Trả về của `GET /users/me/profile` và `GET /users/:id/profile`. Ngày là chuỗi `YYYY-MM-DD`. */
export interface HoSoNhanSu {
  userId: string;
  employeeCode: string;
  email: string;
  fullName: string;
  departmentName: string | null;
  jobTitleName: string | null;
  level: string | null;
  managerName: string | null;
  phone: string | null;
  personalEmail: string | null;
  address: string | null;
  dateOfBirth: string | null;
  gender: GioiTinh | null;
  emergencyContact: string | null;
  hireDate: string | null;
  terminationDate: string | null;
  nationalId: string | null;
  canEditHrFields: boolean;
}

/** Phần nhân viên tự sửa — trùng `UpdateMyProfileDto` ở backend. */
export interface HoSoTuSuaInput {
  phone?: string | null;
  personalEmail?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  gender?: GioiTinh | null;
  emergencyContact?: string | null;
}

/** Phần HR sửa — trùng `UpdateEmployeeProfileDto`. */
export interface HoSoHrInput extends HoSoTuSuaInput {
  hireDate?: string | null;
  terminationDate?: string | null;
  nationalId?: string | null;
}
