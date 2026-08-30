import { apiClient } from './client';
import { getRefreshToken } from '../auth/token-store';
import type { LoginResponse, UserProfile } from '../types/auth';

export async function dangNhap(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', {
    email,
    password,
  });
  return data;
}

export async function layHoSo(): Promise<UserProfile> {
  const { data } = await apiClient.get<UserProfile>('/auth/me');
  return data;
}

export async function doiMatKhau(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await apiClient.post('/auth/change-password', {
    currentPassword,
    newPassword,
  });
}

/**
 * Đăng xuất phiên hiện tại. Backend luôn trả 204 nên hàm này không bao giờ
 * ném lỗi vì token sai — nhưng vẫn nuốt lỗi mạng: người dùng bấm đăng xuất
 * thì phải được ra, kể cả khi mất mạng.
 */
export async function dangXuat(): Promise<void> {
  try {
    await apiClient.post('/auth/logout', { refreshToken: getRefreshToken() });
  } catch {
    // Không cản trở việc đăng xuất phía trình duyệt
  }
}

/** Đăng xuất khỏi mọi thiết bị. Cần access token còn hiệu lực. */
export async function dangXuatMoiNoi(): Promise<void> {
  try {
    await apiClient.post('/auth/logout-all');
  } catch {
    // Như trên
  }
}
