import { useState, type FormEvent } from 'react';
import { App } from 'antd';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleFilled,
  CheckOutlined,
  ExclamationCircleFilled,
  EyeInvisibleOutlined,
  EyeOutlined,
  KeyOutlined,
  LockOutlined,
  MinusCircleOutlined,
  SafetyCertificateOutlined,
  StarFilled,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { doiMatKhau } from '../api/auth';
import { layThongBaoLoi } from '../api/client';
import { danhGiaMatKhau } from '../auth/password-strength';
import './dang-nhap.css';
import './doi-mat-khau.css';

/** Phải khớp MIN_PASSWORD_LENGTH ở backend (change-password.dto.ts). */
const MIN_LENGTH = 8;

/**
 * Đổi mật khẩu theo mẫu thẻ đôi 14/09. Thẻ "Độ mạnh mật khẩu" bên phải chạy
 * THẬT theo ô mật khẩu mới đang gõ (`danhGiaMatKhau`).
 *
 * Cố ý khác mẫu: chỉ liệt kê quy tắc backend THẬT SỰ kiểm (8 ký tự, khác mật
 * khẩu hiện tại) — "có chữ hoa & số" của mẫu không được ép nên không hứa.
 * Lần đầu bắt buộc đổi thì đường lui duy nhất là đăng xuất.
 */
export function ChangePasswordPage() {
  const { user, logout, logoutAll } = useAuth();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [hienTai, setHienTai] = useState('');
  const [moi, setMoi] = useState('');
  const [nhapLai, setNhapLai] = useState('');
  const [hien, setHien] = useState({ hienTai: false, moi: false, nhapLai: false });
  const [daBam, setDaBam] = useState(false);
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  const lanDau = user?.mustChangePassword === true;
  const doManh = danhGiaMatKhau(moi);

  const quyTac = [
    { text: `Tối thiểu ${MIN_LENGTH} ký tự`, dat: moi.length >= MIN_LENGTH },
    { text: lanDau ? 'Khác mật khẩu tạm' : 'Khác mật khẩu hiện tại', dat: moi.length > 0 && moi !== hienTai },
  ];
  const loiO = {
    hienTai: daBam && !hienTai ? 'Vui lòng nhập mật khẩu hiện tại' : null,
    moi:
      daBam && !moi
        ? 'Vui lòng nhập mật khẩu mới'
        : daBam && moi.length < MIN_LENGTH
          ? `Mật khẩu mới phải có ít nhất ${MIN_LENGTH} ký tự`
          : daBam && moi === hienTai
            ? 'Mật khẩu mới phải khác mật khẩu hiện tại'
            : null,
    nhapLai: daBam && nhapLai !== moi ? 'Hai mật khẩu không khớp' : null,
  };

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDaBam(true);
    if (!hienTai || moi.length < MIN_LENGTH || moi === hienTai || nhapLai !== moi) return;
    setDangGui(true);
    setLoi(null);
    try {
      await doiMatKhau(hienTai, moi);
      message.success('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');
      // Backend đã thu hồi mọi phiên khi đổi mật khẩu, nên lời gọi này thường
      // trả lỗi và bị nuốt. Vẫn gọi để trình duyệt dọn token và về đăng nhập.
      await logoutAll();
    } catch (error) {
      setLoi(layThongBaoLoi(error, 'Không đổi được mật khẩu. Vui lòng thử lại.'));
      setDangGui(false);
    }
  }

  const oMatKhau = (
    khoa: 'hienTai' | 'moi' | 'nhapLai',
    id: string,
    nhan: string,
    giaTri: string,
    setGiaTri: (v: string) => void,
    placeholder: string,
    icon: React.ReactNode,
    autoComplete: string,
    autoFocus = false,
  ) => (
    <div className="dm-nhom">
      <label htmlFor={id}>{nhan}</label>
      <div className="dm-o">
        <span className="dm-o-icon">{icon}</span>
        <input
          id={id}
          className={`dm-input${loiO[khoa] ? ' dm-input-loi' : ''}`}
          type={hien[khoa] ? 'text' : 'password'}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          value={giaTri}
          onChange={(e) => setGiaTri(e.target.value)}
          disabled={dangGui}
        />
        <button
          type="button"
          className="dm-mat"
          aria-label={hien[khoa] ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          onClick={() => setHien((h) => ({ ...h, [khoa]: !h[khoa] }))}
        >
          {hien[khoa] ? <EyeInvisibleOutlined /> : <EyeOutlined />}
        </button>
      </div>
      {loiO[khoa] && <div className="dm-loi-o">{loiO[khoa]}</div>}
    </div>
  );

  return (
    <div className="dm-trang">
      <main className="dm-khung">
        {/* ===== trái: form */}
        <section className="dm-trai">
          <div>
            <div className="dm-logo">
              <div className="dm-logo-o">H</div>
              <div className="dm-logo-chu">
                <b>HMICO KPI</b>
                <span>Enterprise Performance System</span>
              </div>
            </div>
            {lanDau && <span className="dm-tag">Đăng nhập lần đầu</span>}
            <h1>{lanDau ? 'Đặt mật khẩu mới' : 'Đổi mật khẩu'}</h1>
            <p className="dm-dan">
              {lanDau
                ? 'Mật khẩu tạm do hành chính cấp chỉ dùng được một lần. Đặt mật khẩu riêng để tiếp tục.'
                : 'Nhập mật khẩu hiện tại và thiết lập mật khẩu mới. Sau khi đổi, bạn sẽ phải đăng nhập lại trên mọi thiết bị.'}
            </p>

            <form className="dm-form" onSubmit={onSubmit} noValidate>
              {oMatKhau('hienTai', 'dm-hien-tai', lanDau ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại', hienTai, setHienTai, '••••••••••••', <LockOutlined />, 'current-password', true)}
              {oMatKhau('moi', 'dm-moi', 'Mật khẩu mới', moi, setMoi, `Nhập tối thiểu ${MIN_LENGTH} ký tự`, <LockOutlined />, 'new-password')}
              {oMatKhau('nhapLai', 'dm-nhap-lai', 'Xác nhận mật khẩu mới', nhapLai, setNhapLai, 'Nhập lại mật khẩu mới', <SafetyCertificateOutlined />, 'new-password')}

              <div className="dm-quy-tac">
                <span>Quy tắc bảo mật bắt buộc:</span>
                <div className="dm-quy-tac-luoi">
                  {quyTac.map((q) => (
                    <div key={q.text} className={q.dat ? 'dm-dat' : ''}>
                      {q.dat ? <CheckCircleFilled /> : <MinusCircleOutlined />}
                      <span>{q.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button type="submit" className="dm-nut" disabled={dangGui}>
                <span>{dangGui ? 'Đang lưu…' : lanDau ? 'Lưu mật khẩu và vào hệ thống' : 'Lưu mật khẩu mới'}</span>
                <ArrowRightOutlined />
              </button>
              {loi && (
                <div className="dm-loi" role="alert">
                  <ExclamationCircleFilled />
                  <span>{loi}</span>
                </div>
              )}
            </form>
          </div>

          {/* Lần đầu bắt buộc thì KHÔNG có đường lui — chỉ đăng xuất; tự vào từ
              menu tài khoản thì quay về chỗ đang đứng (14/09). */}
          <div className="dm-chan">
            {lanDau ? (
              <button
                type="button"
                disabled={dangGui}
                onClick={async () => {
                  await logout();
                  navigate('/login', { replace: true });
                }}
              >
                <ArrowLeftOutlined /> Đăng xuất, quay lại trang Đăng nhập
              </button>
            ) : (
              <button type="button" disabled={dangGui} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
                <ArrowLeftOutlined /> Quay lại, không đổi nữa
              </button>
            )}
          </div>
        </section>

        {/* ===== phải: minh hoạ bảo mật (ẩn dưới 900px) */}
        <section className="dm-phai" aria-hidden="true">
          <div className="dm-sao"><StarFilled /></div>
          <div className="dm-cong">+</div>
          <div className="dm-giua">
            <div className="dm-lap">
              <div className="dm-pill-tich">
                <i><CheckOutlined /></i>
                <span>Mã hóa argon2</span>
              </div>
              <div className="dm-hop">
                <div className="dm-hop-dau">
                  <div className="dm-hop-cham">
                    <i style={{ background: '#fb7185' }} />
                    <i style={{ background: '#fbbf24' }} />
                    <i style={{ background: '#34d399' }} />
                  </div>
                  <div className="dm-hop-thanh" />
                </div>
                <div className="dm-hop-than">
                  <div className="dm-khien">
                    <div className="dm-khien-o"><LockOutlined /></div>
                    <div className="dm-khoa"><KeyOutlined /></div>
                  </div>
                  {/* Chạy thật theo ô mật khẩu mới */}
                  <div className="dm-manh">
                    <div className="dm-manh-dau">
                      <span>Độ mạnh mật khẩu</span>
                      <b style={{ background: moi ? `${doManh.color}33` : '#334155', color: moi ? doManh.color : '#94a3b8' }}>
                        {moi ? doManh.label : 'Chưa nhập'}
                      </b>
                    </div>
                    <div className="dm-manh-thanh">
                      {[1, 2, 3, 4].map((muc) => (
                        <i key={muc} style={{ background: muc <= doManh.score ? doManh.color : undefined }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div className="dm-pill-shield">
                <i />
                <span>HMICO Shield Active</span>
              </div>
            </div>
          </div>
          <div className="dm-mo-ta">
            <h3>Bảo mật tài khoản doanh nghiệp</h3>
            <p>Định kỳ đổi mật khẩu giúp bảo vệ dữ liệu đánh giá KPI và thông tin cá nhân trong hệ thống HMICO.</p>
            <div className="dm-cham-trang"><i /><i /><i /></div>
          </div>
        </section>
      </main>
    </div>
  );
}
