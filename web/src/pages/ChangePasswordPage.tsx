import { useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Progress, Typography } from 'antd';
import { useAuth } from '../auth/useAuth';
import { doiMatKhau } from '../api/auth';
import { layThongBaoLoi } from '../api/client';
import { danhGiaMatKhau } from '../auth/password-strength';

const MIN_LENGTH = 8;

interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function ChangePasswordPage() {
  const { user, logoutAll } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm<ChangePasswordForm>();
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  const matKhauMoi = Form.useWatch('newPassword', form) ?? '';
  const doManh = danhGiaMatKhau(matKhauMoi);

  async function onFinish(values: ChangePasswordForm) {
    setDangGui(true);
    setLoi(null);
    try {
      await doiMatKhau(values.currentPassword, values.newPassword);
      message.success('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.');

      // Backend đã thu hồi mọi phiên khi đổi mật khẩu, nên lời gọi này
      // thường trả lỗi và bị nuốt. Vẫn gọi để phía trình duyệt dọn sạch
      // token và đưa người dùng về màn hình đăng nhập.
      await logoutAll();
    } catch (error) {
      setLoi(layThongBaoLoi(error, 'Không đổi được mật khẩu. Vui lòng thử lại.'));
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
      <Card style={{ width: '100%', maxWidth: 440 }}>
        <Typography.Title level={4}>Đổi mật khẩu</Typography.Title>
        <Alert
          type={user?.mustChangePassword ? 'warning' : 'info'}
          showIcon
          style={{ marginBottom: 16 }}
          message={
            user?.mustChangePassword
              ? 'Bắt buộc đổi mật khẩu'
              : 'Đổi mật khẩu'
          }
          description={
            user?.mustChangePassword
              ? 'Đây là lần đăng nhập đầu tiên. Bạn cần đặt mật khẩu mới trước khi sử dụng hệ thống.'
              : 'Sau khi đổi, bạn sẽ phải đăng nhập lại trên mọi thiết bị.'
          }
        />

        {loi && (
          <Alert type="error" message={loi} showIcon style={{ marginBottom: 16 }} />
        )}

        <Form<ChangePasswordForm>
          form={form}
          layout="vertical"
          onFinish={onFinish}
          disabled={dangGui}
        >
          <Form.Item
            name="currentPassword"
            label="Mật khẩu hiện tại"
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}
          >
            <Input.Password autoComplete="current-password" autoFocus size="large" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="Mật khẩu mới"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu mới' },
              {
                min: MIN_LENGTH,
                message: `Mật khẩu mới phải có ít nhất ${MIN_LENGTH} ký tự`,
              },
              ({ getFieldValue }) => ({
                validator(_, value: string) {
                  if (!value || value !== getFieldValue('currentPassword')) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error('Mật khẩu mới phải khác mật khẩu hiện tại'),
                  );
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" size="large" />
          </Form.Item>

          {matKhauMoi.length > 0 && (
            <div style={{ marginTop: -16, marginBottom: 16 }}>
              <Progress
                percent={((doManh.score + 1) / 5) * 100}
                strokeColor={doManh.color}
                showInfo={false}
                size="small"
              />
              <Typography.Text style={{ color: doManh.color, fontSize: 12 }}>
                Độ mạnh: {doManh.label}
              </Typography.Text>
            </div>
          )}

          <Form.Item
            name="confirmPassword"
            label="Nhập lại mật khẩu mới"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Vui lòng nhập lại mật khẩu mới' },
              ({ getFieldValue }) => ({
                validator(_, value: string) {
                  if (!value || value === getFieldValue('newPassword')) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Hai mật khẩu không khớp'));
                },
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" size="large" />
          </Form.Item>

          <Button type="primary" htmlType="submit" loading={dangGui} block size="large">
            Đổi mật khẩu
          </Button>
        </Form>
      </Card>
    </div>
  );
}
