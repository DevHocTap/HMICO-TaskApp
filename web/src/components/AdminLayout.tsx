import { useState } from 'react';
import { Button, Layout, Menu, Space, Tag, Typography } from 'antd';
import {
  CalendarOutlined,
  ScheduleOutlined,
  SolutionOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  IdcardOutlined,
  LogoutOutlined,
  TeamOutlined,
  HistoryOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  coTheChotSo,
  coTheGiaoKpi,
  coTheXemNhanVien,
  coTheXemToChuc,
  coTheXemNhatKy,
  coTheXemBaoCao,
} from '../auth/permissions';
import { ROLE_LABELS } from '../types/auth';
import type { Role } from '../types/auth';

/** Khung chung cho mọi trang sau khi đăng nhập: thanh trên + menu trái. */
/**
 * Dòng phụ dưới tên người dùng.
 *
 * Tài khoản quản trị hệ thống CỐ Ý không thuộc phòng ban nào — HCNS chốt
 * 03/09/2026 (câu A4): đó là tài khoản kỹ thuật, không phải một vị trí nhân
 * sự. Ghi "Chưa gán phòng ban" ở đó đọc như một thiếu sót cần khắc phục,
 * trong khi không có gì để khắc phục.
 */
function moTaViTri(user: { role: Role; departmentName?: string | null } | null): string {
  if (!user) return '';
  if (user.departmentName) return user.departmentName;
  if (user.role === 'ADMIN') return 'Tài khoản kỹ thuật — không thuộc phòng ban';
  return 'Chưa gán phòng ban';
}

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
  //
  // Nhóm KPI đứng TRƯỚC nhóm quản trị: phiếu KPI là việc hàng tháng của mọi
  // người, còn phòng ban và chức danh là việc nhập một lần rồi thôi.
  const mucMenu = [
    {
      key: 'kpi',
      label: 'KPI',
      type: 'group' as const,
      children: [
        {
          key: '/kpi/my',
          icon: <SolutionOutlined />,
          label: <Link to="/kpi/my">Phiếu KPI của tôi</Link>,
        },
        ...(coTheGiaoKpi(user?.role)
          ? [
              {
                key: '/kpi/assign',
                icon: <ScheduleOutlined />,
                label: <Link to="/kpi/assign">Giao KPI</Link>,
              },
            ]
          : []),
        ...(coTheXemBaoCao(user?.role)
          ? [
              {
                key: '/kpi/progress',
                icon: <BarChartOutlined />,
                label: <Link to="/kpi/progress">Tiến độ nộp</Link>,
              },
            ]
          : []),
        ...(coTheChotSo(user?.role)
          ? [
              {
                key: '/kpi/periods',
                icon: <CalendarOutlined />,
                label: <Link to="/kpi/periods">Kỳ đánh giá</Link>,
              },
            ]
          : []),
      ],
    },
  ];

  const mucQuanTri = [];
  if (coTheXemToChuc(user?.role)) {
    mucQuanTri.push(
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
    mucQuanTri.push({
      key: '/admin/users',
      icon: <TeamOutlined />,
      label: <Link to="/admin/users">Nhân viên</Link>,
    });
  }
  // Mẫu KPI: STAFF không truy cập, các vai trò còn lại xem được
  if (coTheXemNhanVien(user?.role)) {
    mucQuanTri.push({
      key: '/admin/kpi-templates',
      icon: <FileTextOutlined />,
      label: <Link to="/admin/kpi-templates">Mẫu KPI</Link>,
    });
  }

  if (coTheXemNhatKy(user?.role)) {
    mucQuanTri.push({
      key: '/admin/audit-logs',
      icon: <HistoryOutlined />,
      label: <Link to="/admin/audit-logs">Nhật ký thao tác</Link>,
    });
  }

  if (mucQuanTri.length > 0) {
    mucMenu.push({
      key: 'quan-tri',
      label: 'Quản trị',
      type: 'group' as const,
      children: mucQuanTri,
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
              {moTaViTri(user)}
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
