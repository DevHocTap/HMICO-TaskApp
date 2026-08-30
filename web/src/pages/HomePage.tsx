import { useState } from 'react';
import { Button, Layout, Space, Tag, Typography } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/useAuth';
import { ROLE_LABELS } from '../types/auth';

export function HomePage() {
  const { user, logout } = useAuth();
  const [dangThoat, setDangThoat] = useState(false);

  async function onLogout() {
    setDangThoat(true);
    // Không cần setDangThoat(false): đăng xuất xong component bị gỡ bỏ
    await logout();
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          paddingInline: 16,
        }}
      >
        <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
          Quản lý KPI — HMICO
        </Typography.Text>

        <Space size="middle" align="center">
          <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
            {/* Tên, phòng ban, chức danh đều lấy từ GET /auth/me — không lấy
                từ cây phòng ban, vì STAFF nhận cây rỗng. */}
            <Typography.Text strong>{user?.fullName}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {user?.departmentName ?? 'Chưa gán phòng ban'}
            </Typography.Text>
          </Space>

          {user && <Tag color="blue">{ROLE_LABELS[user.role]}</Tag>}

          <Button
            icon={<LogoutOutlined />}
            onClick={onLogout}
            loading={dangThoat}
          >
            Đăng xuất
          </Button>
        </Space>
      </Layout.Header>

      <Layout.Content style={{ display: 'grid', placeItems: 'center' }}>
        <Typography.Text type="secondary" style={{ fontSize: 18 }}>
          Đang xây dựng
        </Typography.Text>
      </Layout.Content>
    </Layout>
  );
}
