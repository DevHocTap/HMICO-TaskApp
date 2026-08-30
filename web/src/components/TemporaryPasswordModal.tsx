import { App, Alert, Button, Modal, Space, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

interface Props {
  open: boolean;
  hoTen: string;
  matKhau: string;
  onClose: () => void;
}

/**
 * Hiện mật khẩu tạm ĐÚNG MỘT LẦN.
 *
 * Backend chỉ trả mật khẩu này trong phản hồi của lần gọi đó và không lưu
 * lại dạng thường ở đâu. Đóng hộp thoại là mất hẳn — phải đặt lại lần nữa
 * nếu quên chép.
 */
export function TemporaryPasswordModal({ open, hoTen, matKhau, onClose }: Props) {
  const { message } = App.useApp();

  async function chep() {
    try {
      await navigator.clipboard.writeText(matKhau);
      message.success('Đã chép mật khẩu');
    } catch {
      // Trình duyệt chặn clipboard (thường do không chạy trên HTTPS)
      message.warning('Không chép được tự động, vui lòng chép thủ công');
    }
  }

  return (
    <Modal
      open={open}
      title="Mật khẩu tạm"
      onCancel={onClose}
      footer={[
        <Button key="dong" type="primary" onClick={onClose}>
          Tôi đã lưu mật khẩu
        </Button>,
      ]}
      closable={false}
      maskClosable={false}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Alert
          type="warning"
          showIcon
          message="Chỉ hiện một lần duy nhất"
          description="Đóng cửa sổ này là không xem lại được. Hãy chép và gửi cho nhân viên ngay bây giờ."
        />
        <div>
          <Typography.Text type="secondary">Nhân viên</Typography.Text>
          <div>
            <Typography.Text strong>{hoTen}</Typography.Text>
          </div>
        </div>
        <div>
          <Typography.Text type="secondary">Mật khẩu tạm</Typography.Text>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Typography.Text
              code
              style={{ fontSize: 18, letterSpacing: 1, wordBreak: 'break-all' }}
            >
              {matKhau}
            </Typography.Text>
            <Button icon={<CopyOutlined />} onClick={chep}>
              Chép
            </Button>
          </div>
        </div>
        <Typography.Text type="secondary">
          Nhân viên sẽ bị bắt đổi mật khẩu ngay ở lần đăng nhập đầu tiên.
        </Typography.Text>
      </Space>
    </Modal>
  );
}
