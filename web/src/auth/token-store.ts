/**
 * Nơi giữ token.
 *
 * Access token giữ TRONG BỘ NHỚ, không đưa vào localStorage: mã JavaScript
 * lạ (XSS, tiện ích trình duyệt) đọc được localStorage. Mất khi tải lại
 * trang cũng không sao — refresh token sẽ lấy lại được ngay.
 *
 * Refresh token buộc phải nằm ở localStorage để người dùng không phải đăng
 * nhập lại sau mỗi lần F5. Đây là đánh đổi có ý thức: httpOnly cookie an
 * toàn hơn nhưng backend hiện trả token trong body, đổi sang cookie là
 * việc của backend chứ không phải chỗ này.
 *
 * Để ở tầng module (không phải React state) vì interceptor của axios cần
 * đọc token một cách đồng bộ, ngoài vòng đời render.
 */

const REFRESH_TOKEN_KEY = 'kpi.refreshToken';

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    // Trình duyệt chặn lưu trữ (chế độ riêng tư, chặn cookie bên thứ ba)
    return null;
  }
}

export function setRefreshToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    // Không lưu được thì phiên chỉ sống tới khi tải lại trang — chấp nhận
  }
}

export function clearTokens(): void {
  setAccessToken(null);
  setRefreshToken(null);
}
