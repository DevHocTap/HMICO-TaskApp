import { useState } from 'react';
import {
  Avatar,
  Badge,
  Button,
  Layout,
  Menu,
  Popover,
  Select,
  Tag,
  Typography,
} from 'antd';
import {
  CalendarOutlined,
  ScheduleOutlined,
  SolutionOutlined,
  FileTextOutlined,
  LogoutOutlined,
  TeamOutlined,
  BarChartOutlined,
  AppstoreOutlined,
  SettingOutlined,
  BellOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { coTheGiaoKpi, coTheXemBaoCao, coTheXemNhanVien } from '../auth/permissions';
import { layKyDanhGia, layViecCuaToi } from '../api/scorecard';
import { laySoLieuDashboard } from '../api/report';
import type { Role } from '../types/auth';
import type { ViecCanXuLy } from '../types/scorecard';
import {
  chuVietTat,
  giaiDoanCuaKy,
  kyChuaHomNay,
} from '../utils/period';
import { mauChuDao } from '../config/theme';
import { NHOM_TAB, loiVaoNhom } from './ThanhTab';
import { ngayVN } from '../utils/format';
import { KyDangXemProvider, useKyDangXem } from '../contexts/KyDangXem';

/**
 * Dòng phụ dưới tên người dùng: chức danh · phòng ban.
 *
 * Tài khoản quản trị hệ thống CỐ Ý không thuộc phòng ban nào — HCNS chốt
 * 03/09/2026 (câu A4): đó là tài khoản kỹ thuật, không phải một vị trí nhân
 * sự. Ghi "Chưa gán phòng ban" ở đó đọc như một thiếu sót cần khắc phục,
 * trong khi không có gì để khắc phục.
 */
function moTaViTri(
  user: {
    role: Role;
    departmentName?: string | null;
    jobTitleName?: string | null;
  } | null,
): string {
  if (!user) return '';
  const phan = [user.jobTitleName, user.departmentName].filter(Boolean);
  if (phan.length > 0) return phan.join(' · ');
  if (user.role === 'ADMIN')
    return 'Tài khoản kỹ thuật — không thuộc phòng ban';
  return 'Chưa gán phòng ban';
}

/**
 * Đếm việc đang chờ theo màn hình đích, để gắn số lên mục menu.
 * `link` của việc có thể kèm query (`/kpi/assign?periodId=…`) — chỉ lấy
 * phần đường dẫn để khớp với `key` của menu.
 */
function demViecTheoDuongDan(viec: ViecCanXuLy[]): Record<string, number> {
  const dem: Record<string, number> = {};
  for (const v of viec) {
    const duongDan = v.link.split('?')[0];
    dem[duongDan] = (dem[duongDan] ?? 0) + v.count;
  }
  return dem;
}

/** Tên trang theo tiền tố đường dẫn — cho breadcrumb ở thanh trên. */
const TEN_TRANG: [string, string][] = [
  ['/kpi/my', 'Phiếu KPI của tôi'],
  ['/kpi/assign', 'Giao KPI'],
  ['/kpi/scorecards', 'Phiếu KPI'],
  ['/kpi/progress', 'Tiến độ nộp'],
  ['/kpi/dashboard', 'Bảng điều hành KPI'],
  ['/kpi/periods', 'Kỳ đánh giá'],
  ['/admin/departments', 'Phòng ban'],
  ['/admin/job-titles', 'Chức danh'],
  ['/admin/users', 'Nhân viên'],
  ['/admin/kpi-templates', 'Mẫu KPI'],
  ['/admin/audit-logs', 'Nhật ký thao tác'],
  ['/admin/settings', 'Cài đặt hệ thống'],
];

/** Khung chung cho mọi trang sau khi đăng nhập: thanh trên + menu trái. */
/** Bọc provider "kỳ đang xem" ngoài khung, vì chính header của khung cũng đọc nó. */
export function AdminLayout() {
  return (
    <KyDangXemProvider>
      <KhungAdmin />
    </KyDangXemProvider>
  );
}

function KhungAdmin() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dangThoat, setDangThoat] = useState(false);

  // Cùng queryKey với HomePage nên TanStack Query chỉ gọi một lần.
  const { data: viec = [] } = useQuery({
    queryKey: ['scorecards', 'pending-my-action'],
    queryFn: layViecCuaToi,
  });
  const { data: kyDanhGia = [] } = useQuery({
    queryKey: ['periods', 'MONTH'],
    queryFn: () => layKyDanhGia('MONTH'),
    staleTime: 5 * 60 * 1000,
  });
  const kyHienTai = kyChuaHomNay(kyDanhGia);
  const giaiDoan = kyHienTai ? giaiDoanCuaKy(kyHienTai) : null;
  // Vai quản lý: ô chọn "Kỳ:" + chip "Tiến độ thẩm định N%" theo kỳ đang xem
  // (mẫu 13/09). Cùng queryKey với Tổng quan nên không gọi thêm lần nào.
  const xemBaoCao = coTheXemBaoCao(user?.role);
  const { cacKy, ky: kyDangXem, datKyId } = useKyDangXem();
  const { data: soLieu } = useQuery({
    queryKey: ['reports', 'dashboard', kyDangXem?.id],
    queryFn: () => laySoLieuDashboard(kyDangXem!.id),
    enabled: Boolean(kyDangXem) && xemBaoCao,
    staleTime: 60 * 1000,
  });
  const tienDoThamDinh =
    soLieu && soLieu.soPhieuTrongKy > 0
      ? Math.round((soLieu.soPhieuDaChot / soLieu.soPhieuTrongKy) * 100)
      : null;
  const soViec = demViecTheoDuongDan(viec);
  const tongViec = viec.reduce((a, v) => a + v.count, 0);
  const tenTrang = TEN_TRANG.find(([tienTo]) =>
    location.pathname.startsWith(tienTo),
  )?.[1];

  async function onLogout() {
    setDangThoat(true);
    await logout();
    navigate('/login', { replace: true });
  }

  /** Nhãn menu kèm số việc đang chờ (nếu có). */
  function nhan(duongDan: string, text: string) {
    const so = soViec[duongDan];
    return (
      <Link to={duongDan} className="menu-nhan">
        <span>{text}</span>
        {so ? <span className="menu-badge">{so}</span> : null}
      </Link>
    );
  }

  // Menu dựng theo vai trò. Xem permissions.ts — đây chỉ là giao diện,
  // backend chặn độc lập.
  //
  // Nhóm KPI đứng TRƯỚC nhóm quản trị: phiếu KPI là việc hàng tháng của mọi
  // người, còn phòng ban và chức danh là việc nhập một lần rồi thôi.
  // Bảy mục như bộ mẫu 12/09; màn phụ nằm trong tab của màn cha (ThanhTab).
  const role = user?.role;
  const nhanSu = loiVaoNhom('nhan-su', role);
  const baoCao = loiVaoNhom('bao-cao', role);
  const heThong = loiVaoNhom('he-thong', role);

  const mucKpi = [
    { key: '/', icon: <AppstoreOutlined />, label: nhan('/', 'Tổng quan') },
    {
      key: '/kpi/my',
      icon: <SolutionOutlined />,
      label: nhan('/kpi/my', 'Phiếu đánh giá'),
    },
  ];
  if (coTheGiaoKpi(role)) {
    mucKpi.push({
      key: '/kpi/assign',
      icon: <ScheduleOutlined />,
      label: nhan('/kpi/assign', 'Giao KPI'),
    });
  }
  if (baoCao) {
    mucKpi.push({
      key: baoCao,
      icon: <BarChartOutlined />,
      label: nhan(baoCao, 'Báo cáo kỳ'),
    });
  }
  if (nhanSu) {
    mucKpi.push({
      key: nhanSu,
      icon: <TeamOutlined />,
      label: nhan(nhanSu, 'Quản lý nhân sự'),
    });
  }
  if (coTheXemNhanVien(role)) {
    mucKpi.push({
      key: '/admin/kpi-templates',
      icon: <FileTextOutlined />,
      label: nhan('/admin/kpi-templates', 'Mẫu KPI'),
    });
  }
  if (heThong) {
    mucKpi.push({
      key: heThong,
      icon: <SettingOutlined />,
      label: nhan(heThong, 'Cài đặt hệ thống'),
    });
  }

  const mucMenu = [
    { key: 'kpi', label: 'Phân hệ điều hành', type: 'group' as const, children: mucKpi },
  ];

  // Mục đang chọn: màn phụ (tab) sáng mục cha của nó; còn lại khớp tiền tố.
  const nhomCua = (d: string) =>
    (Object.keys(NHOM_TAB) as (keyof typeof NHOM_TAB)[]).find((n) =>
      NHOM_TAB[n].some((t) => d.startsWith(t.to)),
    );
  const nhomHienTai = nhomCua(location.pathname);
  const duongDanChon =
    (nhomHienTai &&
      (nhomHienTai === 'nhan-su'
        ? nhanSu
        : nhomHienTai === 'bao-cao'
          ? baoCao
          : heThong)) ??
    (location.pathname.startsWith('/kpi/scorecards') ? '/kpi/assign' : null) ??
    mucKpi
      .map((m) => m.key)
      .filter((k) => k !== '/' && location.pathname.startsWith(k))
      .sort((a, b) => b.length - a.length)[0] ??
    (location.pathname === '/' ? '/' : '');

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider
        width={232}
        theme="light"
        breakpoint="lg"
        collapsedWidth={0}
      >
        <div className="sidebar">
          <Link to="/" className="sidebar-thuong-hieu">
            <span className="sidebar-logo">H</span>
            <span>
              <strong>HMICO KPI</strong>
              <small>Quản lý hiệu suất</small>
            </span>
          </Link>

          <Menu
            mode="inline"
            selectedKeys={[duongDanChon]}
            items={mucMenu}
            style={{ flex: 1, background: 'transparent', borderInlineEnd: 0 }}
          />

          {/* Ba mốc của kỳ tháng chứa hôm nay — mọi vai đều đọc được /periods */}
          {kyHienTai && giaiDoan && (
            <div className="sidebar-ky">
              <div className="sidebar-ky-dau">
                <span className="sidebar-ky-nhan">
                  <i className="sidebar-ky-cham" />
                  Chu kỳ hiện tại
                </span>
                <span className="sidebar-ky-active">
                  {kyHienTai.isLocked ? 'ĐÃ KHOÁ' : 'ACTIVE'}
                </span>
              </div>
              <strong>{kyHienTai.name}</strong>
              <div className="sidebar-ky-hang">
                <span>Hạn chốt:</span>
                <b>{ngayVN(kyHienTai.submitDeadline)}</b>
              </div>
              <div className="sidebar-ky-hang">
                <span>
                  {giaiDoan.so === 4 ? giaiDoan.ten : `GĐ ${giaiDoan.so} · ${giaiDoan.ten}`}
                </span>
                {giaiDoan.conNgay !== null && giaiDoan.so !== 4 && (
                  <b>còn {giaiDoan.conNgay} ngày</b>
                )}
              </div>
            </div>
          )}
        </div>
      </Layout.Sider>

      <Layout>
        <Layout.Header className="thanh-tren">
          <div className="thanh-tren-trai">
            <span className="breadcrumb">
              <Link to="/">Trang chủ</Link>
              {tenTrang && (
                <>
                  <span className="breadcrumb-cach">/</span>
                  <span className="breadcrumb-hien-tai">{tenTrang}</span>
                </>
              )}
            </span>
            {xemBaoCao && kyDangXem && (
              <span className="chip-ky-chon">
                <CalendarOutlined />
                <span className="chip-ky-chon-nhan">Kỳ:</span>
                <Select
                  size="small"
                  variant="borderless"
                  value={kyDangXem.id}
                  onChange={datKyId}
                  popupMatchSelectWidth={false}
                  options={cacKy.map((k) => ({ value: k.id, label: k.name }))}
                />
              </span>
            )}
            {!xemBaoCao && kyHienTai && giaiDoan && (
              <Link to="/kpi/periods" className="chip-ky">
                <CalendarOutlined />
                <span>Kỳ {kyHienTai.name.toLowerCase()}</span>
                <span className="chip-ky-cach">·</span>
                <span className="chip-ky-giai-doan">
                  {giaiDoan.so === 4
                    ? giaiDoan.ten
                    : `Giai đoạn ${giaiDoan.so}: ${giaiDoan.ten}`}
                </span>
              </Link>
            )}
            {tienDoThamDinh !== null && (
              <Link to="/kpi/dashboard" className="chip-tham-dinh">
                <span className="chip-tham-dinh-cham" />
                Tiến độ thẩm định: <strong>{tienDoThamDinh}%</strong>
              </Link>
            )}
          </div>

          <div className="thanh-tren-nguoi-dung">
            {/* Chuông = số việc đang chờ; bấm mở danh sách, không có "đã đọc" */}
            <Popover
              trigger="click"
              placement="bottomRight"
              title="Việc đang chờ bạn"
              content={
                viec.length === 0 ? (
                  <Typography.Text type="secondary">
                    Không có việc nào
                  </Typography.Text>
                ) : (
                  <div className="chuong-danh-sach">
                    {viec.map((v) => (
                      <Link key={v.type} to={v.link} className="chuong-dong">
                        <span>{v.message}</span>
                        {v.isOverdue ? (
                          <Tag color="error">Quá hạn</Tag>
                        ) : v.daysUntilDeadline !== null ? (
                          <Tag
                            color={
                              v.daysUntilDeadline <= 5 ? 'gold' : 'default'
                            }
                          >
                            Còn {v.daysUntilDeadline} ngày
                          </Tag>
                        ) : null}
                        <ArrowRightOutlined />
                      </Link>
                    ))}
                  </div>
                )
              }
            >
              <Badge count={tongViec} size="small" offset={[-2, 4]}>
                <Button
                  type="text"
                  shape="circle"
                  icon={<BellOutlined style={{ fontSize: 18 }} />}
                  aria-label="Việc đang chờ"
                />
              </Badge>
            </Popover>
            {/* Tên, chức danh, phòng ban lấy từ GET /auth/me — không từ cây
                phòng ban, vì STAFF nhận cây rỗng. */}
            {user && (
              <Avatar
                size={38}
                style={{
                  background: '#dbe6ff',
                  color: mauChuDao,
                  fontWeight: 700,
                }}
              >
                {chuVietTat(user.fullName)}
              </Avatar>
            )}
            <span className="thanh-tren-ten">
              <Typography.Text strong>{user?.fullName}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {moTaViTri(user)}
              </Typography.Text>
            </span>
            <Button
              icon={<LogoutOutlined />}
              onClick={onLogout}
              loading={dangThoat}
              shape="round"
              style={{ fontWeight: 600 }}
            >
              Đăng xuất
            </Button>
          </div>
        </Layout.Header>

        <Layout.Content style={{ padding: '20px 32px 32px', overflow: 'auto' }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
