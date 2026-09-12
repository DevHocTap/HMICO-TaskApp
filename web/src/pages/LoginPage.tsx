import { useState } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { layThongBaoLoi } from '../api/client';
import { mauChuDao, mauNenDam } from '../config/theme';

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  async function onFinish(values: LoginForm) {
    setDangGui(true);
    setLoi(null);
    try {
      const nguoiDung = await login(values.email, values.password);
      navigate(nguoiDung.mustChangePassword ? '/change-password' : '/', {
        replace: true,
      });
    } catch (error) {
      // KHÔNG đặt mặc định là "Email hoặc mật khẩu không đúng": câu đó do
      // backend trả về khi thực sự sai thông tin. Dùng nó làm mặc định thì
      // lỗi mạng và CORS cũng hiện y hệt, không ai biết hỏng ở đâu.
      setLoi(layThongBaoLoi(error));
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div className="login-trang">
      {/* Cột trái: giới thiệu, ẩn trên màn hẹp (xem index.css) */}
      <aside className="login-cot-trai" style={{ background: mauNenDam }}>
        <div className="login-luoi">
          <div>
            <div
              style={{
                fontSize: 13,
                letterSpacing: '0.2em',
                opacity: 0.85,
                marginBottom: 28,
              }}
            >
              HMICO
            </div>
            <h1
              style={{
                fontFamily: 'inherit',
                fontSize: 52,
                lineHeight: 1.1,
                fontWeight: 700,
                color: '#fff',
                margin: '0 0 20px',
              }}
            >
              Quản lý
              <br />& giao KPI
            </h1>
            <p style={{ fontSize: 17, lineHeight: 1.6, opacity: 0.85, margin: 0 }}>
              Giao chỉ tiêu, tự chấm, trưởng bộ phận chấm, hành chính tiếp
              nhận — một vòng khép kín mỗi tháng.
            </p>
          </div>
          <div />
          <div />
          <div />
        </div>
      </aside>

      {/* Cột phải: form đăng nhập */}
      <main className="login-cot-phai">
        <div className="login-form">
          <Typography.Title
            level={2}
            style={{ fontFamily: 'inherit', marginBottom: 4 }}
          >
            Đăng nhập
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 24 }}>
            Dùng email công ty do hành chính cấp.
          </Typography.Paragraph>

          {loi && (
            <Alert type="error" message={loi} showIcon style={{ marginBottom: 16 }} />
          )}

          {/* Form của antd tự gửi khi nhấn Enter trong ô nhập */}
          <Form<LoginForm> layout="vertical" onFinish={onFinish} disabled={dangGui}>
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: 'Vui lòng nhập email' },
                { type: 'email', message: 'Email không đúng định dạng' },
              ]}
            >
              <Input
                variant="filled"
                placeholder="ten.ban@hmico.vn"
                autoComplete="username"
                autoFocus
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Mật khẩu"
              rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
            >
              {/* Input.Password có sẵn nút hiện/ẩn */}
              <Input.Password
                variant="filled"
                placeholder="Mật khẩu"
                autoComplete="current-password"
                size="large"
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              loading={dangGui}
              block
              size="large"
              style={{ fontWeight: 700, marginTop: 8 }}
            >
              Đăng nhập
            </Button>
          </Form>

          {/* Khớp với LoginAttemptService ở backend: sai >10 lần / 15 phút */}
          <Typography.Paragraph
            style={{ color: mauChuDao, fontSize: 13, marginTop: 24, marginBottom: 0 }}
          >
            Sai mật khẩu quá 10 lần trong 15 phút, tài khoản bị khoá tạm. Liên hệ
            hành chính để mở lại.
          </Typography.Paragraph>
        </div>
      </main>
    </div>
  );
}
