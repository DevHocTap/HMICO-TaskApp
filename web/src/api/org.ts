import { apiClient } from './client';
import type {
  Department,
  DepartmentNode,
  JobTitle,
  ListUsersParams,
  OrgUser,
  PaginatedUsers,
} from '../types/org';

// ------------------------------------------------------------ phòng ban

export async function layCayPhongBan(): Promise<DepartmentNode[]> {
  const { data } = await apiClient.get<DepartmentNode[]>('/departments/tree');
  return data;
}

export interface DepartmentInput {
  code: string;
  name: string;
  parentId?: string | null;
  managerId?: string | null;
}

export async function taoPhongBan(input: DepartmentInput): Promise<Department> {
  const { data } = await apiClient.post<Department>('/departments', input);
  return data;
}

export async function suaPhongBan(
  id: string,
  input: Partial<DepartmentInput>,
): Promise<Department> {
  const { data } = await apiClient.patch<Department>(`/departments/${id}`, input);
  return data;
}

export async function voHieuHoaPhongBan(id: string): Promise<void> {
  await apiClient.delete(`/departments/${id}`);
}

// ------------------------------------------------------------ chức danh

export async function layChucDanh(departmentId?: string): Promise<JobTitle[]> {
  const { data } = await apiClient.get<JobTitle[]>('/job-titles', {
    params: departmentId ? { departmentId } : undefined,
  });
  return data;
}

export interface JobTitleInput {
  code: string;
  name: string;
  description?: string | null;
  departmentId?: string | null;
}

export async function taoChucDanh(input: JobTitleInput): Promise<JobTitle> {
  const { data } = await apiClient.post<JobTitle>('/job-titles', input);
  return data;
}

export async function suaChucDanh(
  id: string,
  input: Partial<JobTitleInput>,
): Promise<JobTitle> {
  const { data } = await apiClient.patch<JobTitle>(`/job-titles/${id}`, input);
  return data;
}

export async function voHieuHoaChucDanh(id: string): Promise<void> {
  await apiClient.delete(`/job-titles/${id}`);
}

// ------------------------------------------------------------- nhân viên

export async function layDanhSachNhanVien(
  params: ListUsersParams,
): Promise<PaginatedUsers> {
  const { data } = await apiClient.get<PaginatedUsers>('/users', { params });
  return data;
}

export interface UserInput {
  employeeCode: string;
  email: string;
  fullName: string;
  role: string;
  departmentId?: string | null;
  jobTitleId?: string | null;
  level?: string | null;
  managerId?: string | null;
}

/** Tạo nhân viên. Mật khẩu tạm chỉ trả về ĐÚNG LẦN NÀY. */
export async function taoNhanVien(
  input: UserInput,
): Promise<OrgUser & { temporaryPassword: string }> {
  const { data } = await apiClient.post<OrgUser & { temporaryPassword: string }>(
    '/users',
    input,
  );
  return data;
}

export async function suaNhanVien(
  id: string,
  input: Partial<UserInput>,
): Promise<OrgUser> {
  const { data } = await apiClient.patch<OrgUser>(`/users/${id}`, input);
  return data;
}

/** Đặt lại mật khẩu. Mật khẩu tạm chỉ trả về ĐÚNG LẦN NÀY, không xem lại được. */
export async function datLaiMatKhau(id: string): Promise<{ temporaryPassword: string }> {
  const { data } = await apiClient.patch<{ temporaryPassword: string }>(
    `/users/${id}/reset-password`,
  );
  return data;
}

export async function doiTrangThaiNhanVien(
  id: string,
  hoatDong: boolean,
): Promise<OrgUser> {
  const { data } = await apiClient.patch<OrgUser>(
    `/users/${id}/${hoatDong ? 'activate' : 'deactivate'}`,
  );
  return data;
}
