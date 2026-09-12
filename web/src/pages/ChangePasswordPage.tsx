import { useState } from 'react';
import { Alert, App, Button, Form, Input, Tag, Typography } from 'antd';
import { CheckCircleFilled, MinusCircleOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/useAuth';
import { doiMatKhau } from '../api/auth';
import { layThongBaoLoi } from '../api/client';
import { danhGiaMatKhau } from '../auth/password-strength';
import { mauChuDao } from '../config/theme';

/** Phải khớp MIN_PASSWORD_LENGTH ở backend (change-password.dto.ts). */
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

  const lanDau = user?.mustChangePassword === true;
  const matKhauHienTai = Form.useWatch('currentPassword', form) ?? '';
  const matKhauMoi = Form.useWatch('newPassword', form) ?? '';
  const doManh = danhGiaMatKhau(matKhauMoi);

  // Chỉ liệt kê những gì backend THẬT SỰ kiểm — hiện thêm quy tắc hệ thống
  // không ép là hứa suông với người dùng.
  const quyTac = [
    { text: `Ít nhất ${MIN_LENGTH} ký tự`, dat: matKhauMoi.length >= MIN_LENGTH },
    {
      text: lanDau ? 'Không trùng mật khẩu tạm' : 'Khác mật khẩu hiện tại',
      dat: matKhauMoi.length > 0 && matKhauMoi !== matKhauHienTai,
    },
  ];

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
    <div className="doi-mk-trang">
      <div className="doi-mk-the">
        {lanDau && (
          <Tag color="processing" style={{ borderRadius: 999, marginBottom: 16 }}>
            Đăng nhập lần đầu
          </Tag>
        )}
        <Typography.Title level={2} style={{ fontFamily: 'inherit', marginTop: 0 }}>
          {lanDau ? 'Đặt mật khẩu mới' : 'Đổi mật khẩu'}
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 16, marginBottom: 28 }}>
          {lanDau
            ? 'Mật khẩu tạm do hành chính cấp chỉ dùng được một lần. Đặt mật khẩu riêng để tiếp tục.'
            : 'Sau khi đổi, bạn sẽ phải đăng nhập lại trên mọi thiết bị.'}
        </Typography.Paragraph>

        {loi && (
          <Alert type="error" message={loi} showIcon style={{ marginBottom: 16 }} />
        )}

        <Form<ChangePasswordForm>
          form={form}
          layout="vertical"
          onFinish={onFinish}
          disabled={dangGui}
          requiredMark={false}
        >
          <Form.Item
            name="currentPassword"
            label={lanDau ? 'Mật khẩu tạm' : 'Mật khẩu hiện tại'}
            rules={[{ required: true, message: 'Vui lòng nhập mật khẩu hiện tại' }]}
          >
            <Input.Password
              variant="filled"
              autoComplete="current-password"
              autoFocus
              size="large"
            />
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
            <Input.Password variant="filled" autoComplete="new-password" size="large" />
          </Form.Item>

          {/* Thanh độ mạnh bốn đoạn — điểm 0–4 của danhGiaMatKhau */}
          {matKhauMoi.length > 0 && (
            <div style={{ marginTop: -12, marginBottom: 20 }}>
              <div className="doi-mk-do-manh">
                {[1, 2, 3, 4].map((muc) => (
                  <span
                    key={muc}
                    style={{ background: muc <= doManh.score ? doManh.color : undefined }}
                  />
                ))}
              </div>
              <Typography.Text strong style={{ color: doManh.color, fontSize: 13 }}>
                {doManh.label}
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
            <Input.Password variant="filled" autoComplete="new-password" size="large" />
          </Form.Item>

          <ul className="doi-mk-quy-tac">
            {quyTac.map((q) => (
              <li key={q.text} style={{ color: q.dat ? mauChuDao : undefined }}>
                {q.dat ? <CheckCircleFilled /> : <MinusCircleOutlined />}
                {q.text}
              </li>
            ))}
          </ul>

          <Button
            type="primary"
            htmlType="submit"
            loading={dangGui}
            block
            size="large"
            style={{ fontWeight: 700, borderRadius: 999 }}
          >
            {lanDau ? 'Đổi mật khẩu và vào hệ thống' : 'Đổi mật khẩu'}
          </Button>
        </Form>
      </div>
    </div>
  );
}
