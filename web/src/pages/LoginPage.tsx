import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { layThongBaoLoi } from '../api/client';

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
      // Backend đã cố ý trả cùng một câu cho "sai mật khẩu" và "email không
      // tồn tại". Không thêm thắt gì để khỏi lộ email nào có thật.
      setLoi(layThongBaoLoi(error, 'Email hoặc mật khẩu không đúng'));
    } finally {
      setDangGui(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f0f2f5',
        padding: 16,
      }}
    >
      <Card style={{ width: '100%', maxWidth: 400 }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 4 }}>
          Quản lý KPI
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
          Công ty HMICO
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
              prefix={<MailOutlined />}
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
              prefix={<LockOutlined />}
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
          >
            Đăng nhập
          </Button>
        </Form>
      </Card>
    </div>
  );
}
