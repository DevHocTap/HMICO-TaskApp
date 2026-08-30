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

/**
 * Các endpoint mà 401 là câu trả lời hợp lệ, không phải dấu hiệu token hết
 * hạn. Sai mật khẩu ở /auth/login mà đi làm mới token là vô nghĩa, lại còn
 * kích hoạt nhầm luồng "phiên hết hạn".
 */
const KHONG_LAM_MOI = ['/auth/login', '/auth/refresh'];

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const laEndpointXacThuc = KHONG_LAM_MOI.some((duong) =>
      config?.url?.startsWith(duong),
    );

    const canThuLai =
      error.response?.status === 401 &&
      config !== undefined &&
      !config.daThuLai &&
      !laEndpointXacThuc;

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

const LOI_KHONG_KET_NOI =
  'Không kết nối được máy chủ. Kiểm tra máy chủ đã chạy chưa rồi thử lại.';
const LOI_KHONG_RO = 'Có lỗi xảy ra. Vui lòng thử lại.';

/**
 * Lấy thông báo lỗi để hiện cho người dùng.
 *
 * Phân biệt rạch ròi ba trường hợp — KHÔNG gộp chúng vào một câu:
 *
 *   1. Không nhận được phản hồi nào (mất mạng, máy chủ chưa chạy, CORS
 *      chặn) -> báo lỗi kết nối.
 *   2. Máy chủ trả về thông báo -> hiện đúng câu đó (backend viết sẵn
 *      tiếng Việt).
 *   3. Máy chủ trả lỗi nhưng không kèm thông báo (500, lỗi hạ tầng) ->
 *      câu chung, không để chi tiết kỹ thuật lọt ra giao diện.
 *
 * VÌ SAO QUAN TRỌNG: trước đây mọi lỗi đều hiện "Email hoặc mật khẩu
 * không đúng". CORS chặn cũng hiện y hệt sai mật khẩu, khiến không thể
 * biết hỏng ở đâu. Thông báo sai còn tệ hơn không có thông báo.
 */
export function layThongBaoLoi(error: unknown, macDinh = LOI_KHONG_RO): string {
  if (!axios.isAxiosError(error)) return macDinh;

  // Không có response nghĩa là request chưa từng tới nơi, hoặc trình duyệt
  // đã chặn phản hồi vì CORS
  if (!error.response) return LOI_KHONG_KET_NOI;

  const message = (error.response.data as { message?: unknown } | undefined)
    ?.message;
  if (typeof message === 'string' && message.length > 0) return message;
  // class-validator trả mảng chuỗi khi DTO không hợp lệ
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];

  return macDinh;
}
