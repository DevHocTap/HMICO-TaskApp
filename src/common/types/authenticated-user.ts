import { Role } from '@prisma/client';

/**
 * Người dùng đã xác thực, đọc ra từ access token.
 *
 * Cố ý chỉ giữ đúng những gì Guard và service cần để phân quyền — không
 * nhét cả bản ghi User vào token.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  departmentId: string | null;
}

/** Nội dung bên trong access token. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  departmentId: string | null;
}
