import { createContext } from 'react';
import type { UserProfile } from '../types/auth';

export interface AuthState {
  user: UserProfile | null;
  /** Đang khôi phục phiên lúc mới tải trang. */
  dangKhoiPhuc: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  logout: () => Promise<void>;
  /** Đăng xuất mọi thiết bị rồi đưa về màn hình đăng nhập. */
  logoutAll: () => Promise<void>;
  /** Cập nhật hồ sơ sau khi đổi mật khẩu. */
  setUser: (user: UserProfile | null) => void;
}

export const AuthContext = createContext<AuthState | null>(null);
