import { useState } from 'react';
import { Button, Layout, Menu, Space, Tag, Typography } from 'antd';
import {
  ApartmentOutlined,
  IdcardOutlined,
  LogoutOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { coTheXemNhanVien, coTheXemToChuc } from '../auth/permissions';
import { ROLE_LABELS } from '../types/auth';

/** Khung chung cho mọi trang sau khi đăng nhập: thanh trên + menu trái. */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dangThoat, setDangThoat] = useState(false);

  async function onLogout() {
    setDangThoat(true);
    await logout();
    navigate('/login', { replace: true });
  }

  // Menu dựng theo vai trò. Xem permissions.ts — đây chỉ là giao diện,
  // backend chặn độc lập.
  const mucMenu = [];
  if (coTheXemToChuc(user?.role)) {
    mucMenu.push(
      {
        key: '/admin/departments',
        icon: <ApartmentOutlined />,
        label: <Link to="/admin/departments">Phòng ban</Link>,
      },
      {
        key: '/admin/job-titles',
        icon: <IdcardOutlined />,
        label: <Link to="/admin/job-titles">Chức danh</Link>,
      },
    );
  }
  if (coTheXemNhanVien(user?.role)) {
    mucMenu.push({
      key: '/admin/users',
      icon: <TeamOutlined />,
      label: <Link to="/admin/users">Nhân viên</Link>,
    });
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
        <Link to="/" style={{ color: 'inherit' }}>
          <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
            Quản lý KPI — HMICO
          </Typography.Text>
        </Link>

        <Space size="middle" align="center">
          <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
            {/* Tên, phòng ban lấy từ GET /auth/me — không từ cây phòng ban,
                vì STAFF nhận cây rỗng. */}
            <Typography.Text strong>{user?.fullName}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {user?.departmentName ?? 'Chưa gán phòng ban'}
            </Typography.Text>
          </Space>
          {user && <Tag color="blue">{ROLE_LABELS[user.role]}</Tag>}
          <Button icon={<LogoutOutlined />} onClick={onLogout} loading={dangThoat}>
            Đăng xuất
          </Button>
        </Space>
      </Layout.Header>

      <Layout>
        {mucMenu.length > 0 && (
          <Layout.Sider width={220} theme="light" breakpoint="lg" collapsedWidth={0}>
            <Menu
              mode="inline"
              selectedKeys={[location.pathname]}
              items={mucMenu}
              style={{ height: '100%', borderInlineEnd: 0 }}
            />
          </Layout.Sider>
        )}
        <Layout.Content style={{ padding: 16, overflow: 'auto' }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
