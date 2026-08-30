import type { Role } from '../types/auth';

/**
 * Ai thấy mục nào trong menu quản trị.
 *
 * ẨN MENU KHÔNG PHẢI BẢO MẬT. Backend chặn độc lập bằng RolesGuard và
 * getAccessibleDepartmentIds — người dùng gõ thẳng URL vẫn bị chặn ở đó.
 * Mấy hàm dưới đây chỉ để giao diện không bày ra thứ bấm vào sẽ báo lỗi.
 */

/** ADMIN và HR toàn quyền quản trị nhân sự. */
export function coTheQuanTri(role: Role | undefined): boolean {
  return role === 'ADMIN' || role === 'HR';
}

/** MANAGER xem được danh sách nhân viên trong phạm vi của mình, chỉ đọc. */
export function coTheXemNhanVien(role: Role | undefined): boolean {
  return coTheQuanTri(role) || role === 'MANAGER';
}
