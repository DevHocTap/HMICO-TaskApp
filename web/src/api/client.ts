import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import { API_URL } from '../config/env';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from '../auth/token-store';
import type { TokenPair } from '../types/auth';

/** Đánh dấu request đã thử lại một lần, tránh lặp vô hạn. */
interface RetriableConfig extends InternalAxiosRequestConfig {
  daThuLai?: boolean;
}

export const apiClient = axios.create({ baseURL: API_URL });

/**
 * Instance RIÊNG để gọi /auth/refresh.
 *
 * Bắt buộc phải tách: nếu dùng chung `apiClient`, một lần refresh thất bại
 * sẽ trả 401, kích hoạt lại chính interceptor này và gây đệ quy vô hạn.
 */
const refreshClient = axios.create({ baseURL: API_URL });

/** Nơi ứng dụng đăng ký việc cần làm khi phiên hết hạn hẳn. */
let onSessionExpired: (() => void) | null = null;

export function setOnSessionExpired(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

// ---------------------------------------------------------------------------
// Làm mới token — single-flight
// ---------------------------------------------------------------------------

/**
 * Promise của lần refresh đang chạy, hoặc null nếu không có.
 *
 * Đây là điểm mấu chốt: khi trang vừa tải và bắn 5 request cùng lúc, cả 5
 * đều nhận 401. Nếu mỗi cái tự gọi /auth/refresh thì backend xoay vòng 5
 * lần liên tiếp — request đầu tiên thu hồi token, bốn cái sau dùng token đã
 * chết và đá người dùng ra màn hình đăng nhập.
 *
 * Giữ một promise chung: request đầu tiên gọi refresh thật, bốn cái còn lại
 * chờ cùng promise đó rồi dùng chung token mới.
 */
let refreshPromise: Promise<string> | null = null;

async function doiTokenMoi(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('Không có refresh token');
  }

  const { data } = await refreshClient.post<TokenPair>('/auth/refresh', {
    refreshToken,
  });

  setAccessToken(data.accessToken);
  setRefreshToken(data.refreshToken);
  return data.accessToken;
}

export function lamMoiToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = doiTokenMoi().finally(() => {
      // Xoá ngay khi xong (thành công hay thất bại) để lần 401 sau còn gọi lại
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// ---------------------------------------------------------------------------
// Interceptor
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    const canThuLai =
      error.response?.status === 401 && config !== undefined && !config.daThuLai;

    if (!canThuLai) {
      return Promise.reject(error);
    }

    config.daThuLai = true;

    try {
      const token = await lamMoiToken();
      config.headers.Authorization = `Bearer ${token}`;
      return apiClient(config as AxiosRequestConfig);
    } catch {
      // Refresh token cũng hỏng -> phiên chấm dứt hẳn
      clearTokens();
      onSessionExpired?.();
      return Promise.reject(error);
    }
  },
);

/**
 * Lấy thông báo lỗi để hiện cho người dùng.
 *
 * Chỉ nhận thông báo do backend cố ý trả về (đã viết bằng tiếng Việt).
 * Mọi thứ khác — lỗi mạng, 500, stack trace — quy về một câu chung, không
 * để chi tiết kỹ thuật lọt ra giao diện.
 */
export function layThongBaoLoi(error: unknown, macDinh: string): string {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: unknown } | undefined)
      ?.message;
    if (typeof message === 'string' && message.length > 0) return message;
    // class-validator trả mảng chuỗi khi DTO không hợp lệ
    if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  }
  return macDinh;
}
