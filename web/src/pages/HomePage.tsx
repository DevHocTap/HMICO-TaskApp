import { Card, Space, Typography } from 'antd';
import { useAuth } from '../auth/useAuth';

export function HomePage() {
  const { user } = useAuth();

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        Xin chào, {user?.fullName}
      </Typography.Title>
      <Card>
        <Typography.Text type="secondary" style={{ fontSize: 18 }}>
          Đang xây dựng
        </Typography.Text>
      </Card>
    </Space>
  );
}
