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
  search?: string;
}
