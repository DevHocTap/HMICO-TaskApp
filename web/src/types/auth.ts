export type Role = 'ADMIN' | 'EXECUTIVE' | 'HR' | 'MANAGER' | 'STAFF';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Quản trị hệ thống',
  EXECUTIVE: 'Ban giám đốc',
  HR: 'Hành chính nhân sự',
  MANAGER: 'Trưởng bộ phận',
  STAFF: 'Nhân viên',
};

/**
 * Hồ sơ người dùng, lấy từ GET /auth/me hoặc POST /auth/login.
 *
 * Đây là NGUỒN DUY NHẤT cho tên phòng ban và chức danh của chính người
 * dùng. Không lấy từ cây phòng ban — STAFF nhận cây rỗng.
 */
export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId: string | null;
  departmentName: string | null;
  jobTitleName: string | null;
  level: string | null;
  mustChangePassword: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends TokenPair {
  user: UserProfile;
}
