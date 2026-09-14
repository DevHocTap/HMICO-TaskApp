import { useState, type FormEvent } from 'react';
import { EyeInvisibleOutlined, EyeOutlined, ExclamationCircleFilled, WarningFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { layThongBaoLoi } from '../api/client';
import bieuTuong from '../assets/brand/bieu-tuong.svg';
import './dang-nhap.css';

/**
 * Trang đăng nhập theo mẫu thẻ đôi 14/09 (form trái · minh hoạ phải).
 *
 * Hai chỗ CỐ Ý khác mẫu, giữ quyết định 11/09: không có "Quên mật khẩu?"
 * (không có luồng tự đặt lại — HCNS đặt lại hộ) và không có "Ghi nhớ đăng
 * nhập" (refresh token 7 ngày đã ghi nhớ sẵn, ô này không có tác dụng).
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [matKhau, setMatKhau] = useState('');
  const [hienMk, setHienMk] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (dangGui) return;
    setDangGui(true);
    setLoi(null);
    try {
      const nguoiDung = await login(email.trim(), matKhau);
      navigate(nguoiDung.mustChangePassword ? '/change-password' : '/', { replace: true });
    } catch (error) {
      // KHÔNG đặt mặc định là "Email hoặc mật khẩu không đúng": câu đó do
      // backend trả về khi thực sự sai. Dùng nó làm mặc định thì lỗi mạng và
      // CORS cũng hiện y hệt, không ai biết hỏng ở đâu.
      setLoi(layThongBaoLoi(error));
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="dn-trang">
      <main className="dn-khung">
        {/* ===== cột trái: form */}
        <section className="dn-trai">
          <div>
            <div className="dn-logo">
              <img className="dn-logo-o" src={bieuTuong} alt="Hoàng Minh" />
              <div className="dn-logo-chu">
                <b>HMICO KPI</b>
                <span>Công ty Cổ phần Đầu tư Công nghệ Hoàng Minh</span>
              </div>
            </div>
            <h1>Đăng nhập</h1>
            <p className="dn-dan">Dùng email công ty do hành chính cấp để truy cập hệ thống KPI.</p>

            <form className="dn-form" onSubmit={onSubmit}>
              <div className="dn-nhom">
                <label className="dn-nhan" htmlFor="dn-email">
                  Email công ty
                </label>
                <div className="dn-o">
                  <input
                    id="dn-email"
                    className="dn-input"
                    type="email"
                    placeholder="ten.ban@hmico.vn"
                    autoComplete="username"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={dangGui}
                  />
                </div>
              </div>

              <div className="dn-nhom">
                <label className="dn-nhan" htmlFor="dn-mat-khau">
                  Mật khẩu
                </label>
                <div className="dn-o">
                  <input
                    id="dn-mat-khau"
                    className="dn-input dn-input-mk"
                    type={hienMk ? 'text' : 'password'}
                    placeholder="••••••••••••"
                    autoComplete="current-password"
                    required
                    value={matKhau}
                    onChange={(e) => setMatKhau(e.target.value)}
                    disabled={dangGui}
                  />
                  <button
                    type="button"
                    className={`dn-mat${hienMk ? ' dn-mat-mo' : ''}`}
                    aria-label={hienMk ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                    onClick={() => setHienMk((v) => !v)}
                  >
                    {hienMk ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  </button>
                </div>
              </div>

              <button type="submit" className="dn-nut" disabled={dangGui}>
                {dangGui ? 'Đang đăng nhập…' : 'Đăng nhập'}
              </button>

              {loi && (
                <div className="dn-loi" role="alert">
                  <ExclamationCircleFilled />
                  <span>{loi}</span>
                </div>
              )}
            </form>

            {/* Khớp với LoginAttemptService ở backend: sai >10 lần / 15 phút */}
            <div className="dn-chu-y">
              <WarningFilled />
              <p>Sai mật khẩu quá 10 lần trong 15 phút, tài khoản bị khoá tạm. Liên hệ Hành chính – Nhân sự để mở lại.</p>
            </div>
          </div>

          <footer className="dn-chan">
            Chưa có tài khoản hoặc quên mật khẩu?<b>Liên hệ HCNS</b>
          </footer>
        </section>

        {/* ===== cột phải: minh hoạ (ẩn dưới 1024px) */}
        <section className="dn-phai" aria-hidden="true">
          <div className="dn-hinh">
            <div className="dn-cong-xanh">+</div>
            <div className="dn-cong-vang">+</div>
            <div className="dn-quang" />
            <div className="dn-lap">
              <div className="dn-man">
                <div className="dn-man-dau">
                  <div className="dn-man-cham">
                    <i style={{ background: '#fb7185' }} />
                    <i style={{ background: '#fbbf24' }} />
                    <i style={{ background: '#34d399' }} />
                  </div>
                  <div className="dn-man-tim" />
                </div>
                <div className="dn-man-bieu-do">
                  <svg viewBox="0 0 160 40">
                    <path d="M0,25 Q20,5 40,22 T80,18 T120,28 T160,10" fill="none" stroke="#2563eb" strokeLinecap="round" strokeWidth={4} />
                    <path d="M0,32 Q25,18 50,30 T100,24 T160,20" fill="none" stroke="#f59e0b" strokeLinecap="round" strokeOpacity={0.8} strokeWidth={3} />
                  </svg>
                </div>
                <div className="dn-man-the">
                  <div className="dn-man-donut" />
                  <div className="dn-man-cot">
                    <i style={{ height: 12, background: '#fbbf24' }} />
                    <i style={{ height: 20, background: '#3b82f6' }} />
                    <i style={{ height: 16, background: '#34d399' }} />
                    <i style={{ height: 24, background: '#fff' }} />
                  </div>
                </div>
              </div>

              <div className="dn-checklist dn-noi dn-bay">
                <div><b>✓</b><i style={{ width: 40 }} /></div>
                <div><b>✓</b><i style={{ width: 48 }} /></div>
                <div><b>✓</b><i style={{ width: 32 }} /></div>
              </div>

              <div className="dn-pie dn-noi dn-bay-tre">
                <div>
                  <div className="dn-pie-lat" />
                  <div className="dn-pie-tam" />
                </div>
              </div>

              <div className="dn-bong dn-noi">
                <div>
                  <div className="dn-bong-den"><i /></div>
                  <div className="dn-bong-tay" />
                </div>
              </div>

              <div className="dn-but dn-noi dn-bay">
                <div className="dn-but-than" />
                <div className="dn-but-tay"><i /></div>
              </div>
            </div>
          </div>

          <div className="dn-mo-ta">
            <h2>Theo dõi tiến độ &amp; Đánh giá KPI</h2>
            <p>Hệ thống quản trị mục tiêu khép kín hàng tháng: Giao chỉ tiêu, tự chấm, trưởng bộ phận xét duyệt và HCNS khóa sổ minh bạch, chuẩn xác.</p>
          </div>
          <div className="dn-cham-trang"><i /><i /><i /></div>
        </section>
      </main>
    </div>
  );
}
