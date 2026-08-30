import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthState } from './AuthContext';
import {
  clearTokens,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from './token-store';
import { lamMoiToken, setOnSessionExpired } from '../api/client';
import { dangNhap, dangXuat, dangXuatMoiNoi, layHoSo } from '../api/auth';
import type { UserProfile } from '../types/auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [dangKhoiPhuc, setDangKhoiPhuc] = useState(true);

  /**
   * Khôi phục phiên khi mới tải trang.
   *
   * Access token nằm trong bộ nhớ nên F5 là mất. Nếu còn refresh token thì
   * đổi lấy access token mới rồi lấy hồ sơ — người dùng không phải đăng
   * nhập lại.
   */
  useEffect(() => {
    let conHieuLuc = true;

    async function khoiPhucPhien() {
      if (!getRefreshToken()) {
        setDangKhoiPhuc(false);
        return;
      }
      try {
        await lamMoiToken();
        const hoSo = await layHoSo();
        if (conHieuLuc) setUser(hoSo);
      } catch {
        clearTokens();
      } finally {
        if (conHieuLuc) setDangKhoiPhuc(false);
      }
    }

    void khoiPhucPhien();
    return () => {
      conHieuLuc = false;
    };
  }, []);

  /**
   * Khi interceptor phát hiện refresh token cũng hỏng, nó gọi vào đây.
   * Chỉ xoá state — việc chuyển hướng do ProtectedRoute lo, nhờ vậy không
   * phải đụng tới window.location và không mất state của React Router.
   */
  useEffect(() => {
    setOnSessionExpired(() => setUser(null));
    return () => setOnSessionExpired(null);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const ketQua = await dangNhap(email, password);
    setAccessToken(ketQua.accessToken);
    setRefreshToken(ketQua.refreshToken);
    setUser(ketQua.user);
    return ketQua.user;
  }, []);

  const logout = useCallback(async () => {
    await dangXuat();
    clearTokens();
    setUser(null);
  }, []);

  const logoutAll = useCallback(async () => {
    await dangXuatMoiNoi();
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, dangKhoiPhuc, login, logout, logoutAll, setUser }),
    [user, dangKhoiPhuc, login, logout, logoutAll],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
