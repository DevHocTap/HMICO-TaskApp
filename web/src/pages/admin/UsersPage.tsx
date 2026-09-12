import { useMemo, useState } from 'react';
import { ThanhTab } from '../../components/ThanhTab';
import {
  Alert,
  App,
  Avatar,
  Button,
  Checkbox,
  Dropdown,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  TreeSelect,
  Typography,
} from 'antd';
import {
  KeyOutlined,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  datLaiMatKhau,
  doiTrangThaiNhanVien,
  layCayPhongBan,
  layChucDanh,
  layDanhSachNhanVien,
  suaNhanVien,
  suaPhongBan,
  taoNhanVien,
} from '../../api/org';
import { layThongBaoLoi } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { coTheGhiToChuc } from '../../auth/permissions';
import { ROLE_LABELS, type Role } from '../../types/auth';
import type { ColumnsType } from 'antd/es/table';
import type { DepartmentNode, ListUsersParams, OrgUser } from '../../types/org';
import { TemporaryPasswordModal } from '../../components/TemporaryPasswordModal';
import { ReadOnlyNotice } from '../../components/ReadOnlyNotice';
import { TieuDeTrang } from '../../components/TieuDeTrang';
import { TheSoLieu, type TheSoLieuProps } from '../../components/TheSoLieu';
import { layTomTatTrangChu } from '../../api/report';
import type { TomTatTrangChu } from '../../types/report';
import { phanTram } from '../../utils/format';
import {
  TeamOutlined,
  FileDoneOutlined,
  WarningOutlined,
  ApartmentOutlined,
} from '@ant-design/icons';

/**
 * Ba–bốn thẻ đầu màn Nhân viên (bộ mẫu 12/09), số lấy từ `/reports/home-summary`
 * theo vai. Ban giám đốc không có bộ số nhân sự nên không hiện thẻ.
 */
function theNhanSu(t: TomTatTrangChu): TheSoLieuProps[] {
  switch (t.role) {
    case 'ADMIN':
      return [
        {
          nhan: 'Tổng tài khoản',
          icon: <TeamOutlined />,
          so: t.tongTaiKhoan,
          donVi: 'tài khoản',
          chuThich: `${t.taiKhoanHoatDong} đang hoạt động · ${t.tongTaiKhoan - t.taiKhoanHoatDong} đã nghỉ`,
        },
        {
          nhan: 'Chưa đổi mật khẩu lần đầu',
          icon: <WarningOutlined />,
          so: t.chuaDoiMatKhau,
          donVi: 'tài khoản',
          phanTram: phanTram(t.chuaDoiMatKhau, t.taiKhoanHoatDong),
          canChuY: t.chuaDoiMatKhau > 0,
          chuThich:
            t.chuaDoiMatKhau > 0
              ? 'Nhắc họ đăng nhập để kích hoạt'
              : 'Mọi tài khoản đã kích hoạt',
        },
        {
          nhan: 'Phòng ban',
          icon: <ApartmentOutlined />,
          so: t.soPhongBan,
          donVi: 'phòng',
          chuThich:
            t.phongThieuTruong.length > 0
              ? `${t.phongThieuTruong.length} phòng có nhân sự chưa có trưởng bộ phận`
              : 'Mọi phòng có nhân sự đều có trưởng bộ phận',
          canChuY: t.phongThieuTruong.length > 0,
        },
      ];
    case 'HR':
    case 'MANAGER': {
      const chuaGiao = Math.max(t.soNhanSu - t.soPhieuTrongKy, 0);
      return [
        {
          nhan: t.role === 'HR' ? 'Tổng nhân sự' : 'Nhân sự phòng bạn',
          icon: <TeamOutlined />,
          so: t.soNhanSu,
          donVi: 'người',
          chuThich: 'Đang làm việc, thuộc diện KPI',
        },
        {
          nhan: `KPI ${t.period?.name.toLowerCase() ?? 'kỳ này'}`,
          icon: <FileDoneOutlined />,
          so: t.soPhieuTrongKy,
          donVi: `/ ${t.soNhanSu}`,
          phanTram: phanTram(t.soPhieuTrongKy, t.soNhanSu),
          chuThich: `${phanTram(t.soPhieuTrongKy, t.soNhanSu)}% đã có phiếu`,
        },
        {
          nhan: 'Chưa giao chỉ tiêu',
          icon: <WarningOutlined />,
          so: chuaGiao,
          donVi: 'người',
          phanTram: chuaGiao > 0 ? 100 : 0,
          canChuY: chuaGiao > 0,
          chuThich: chuaGiao > 0 ? 'Sang Giao KPI để sinh phiếu' : 'Đã giao đủ',
        },
      ];
    }
    default:
      return [];
  }
}
import { chuVietTat } from '../../utils/period';
import { mauChuDao, mauNhan } from '../../config/theme';

/**
 * Lọc nhanh — mỗi chip là một bộ tham số cố định, đè lên `vai trò` và
 * `trạng thái`. Phòng ban và chức danh vẫn là ô chọn riêng vì nhiều giá trị.
 */
type LocNhanh =
  'tat-ca' | 'truong-bo-phan' | 'chua-doi-mat-khau' | 'da-nghi-viec';
const CHIP_LOC: {
  key: LocNhanh;
  nhan: string;
  thamSo: Partial<ListUsersParams>;
}[] = [
  { key: 'tat-ca', nhan: 'Tất cả', thamSo: {} },
  {
    key: 'truong-bo-phan',
    nhan: 'Trưởng bộ phận',
    thamSo: { role: 'MANAGER', isActive: true },
  },
  {
    key: 'chua-doi-mat-khau',
    nhan: 'Chưa đổi mật khẩu',
    thamSo: { mustChangePassword: true, isActive: true },
  },
  { key: 'da-nghi-viec', nhan: 'Đã nghỉ việc', thamSo: { isActive: false } },
];

const CAC_VAI_TRO: Role[] = ['ADMIN', 'EXECUTIVE', 'HR', 'MANAGER', 'STAFF'];
const SO_DONG_MAC_DINH = 20;

interface FormValues {
  employeeCode: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId?: string | null;
  jobTitleId?: string | null;
  level?: string | null;
  /** Không gửi lên API — dùng để gọi thêm PATCH /departments/:id sau khi lưu. */
  datLamTruongBoPhan?: boolean;
}

function duyetPhang(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((n) => [n, ...duyetPhang(n.children)]);
}

function chuyenSangTreeData(nodes: DepartmentNode[]): {
  value: string;
  title: string;
  children?: ReturnType<typeof chuyenSangTreeData>;
}[] {
  return nodes.map((n) => ({
    value: n.id,
    title: `${n.name} (${n.code})`,
    children:
      n.children.length > 0 ? chuyenSangTreeData(n.children) : undefined,
  }));
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { user: nguoiDangDangNhap } = useAuth();
  const [form] = Form.useForm<FormValues>();

  const coQuyenGhi = coTheGhiToChuc(nguoiDangDangNhap?.role);

  const [boLoc, setBoLoc] = useState<ListUsersParams>({
    page: 1,
    limit: SO_DONG_MAC_DINH,
  });
  const [oTimKiem, setOTimKiem] = useState('');
  const [locNhanh, setLocNhanh] = useState<LocNhanh>('tat-ca');
  const [modalMo, setModalMo] = useState(false);
  const [dangSua, setDangSua] = useState<OrgUser | null>(null);
  const [loiForm, setLoiForm] = useState<string | null>(null);
  const [matKhauTam, setMatKhauTam] = useState<{
    hoTen: string;
    matKhau: string;
  } | null>(null);

  const { data: tomTat } = useQuery({
    queryKey: ['reports', 'home-summary'],
    queryFn: layTomTatTrangChu,
  });
  const cacThe = tomTat ? theNhanSu(tomTat) : [];

  const { data: danhSach, isLoading } = useQuery({
    queryKey: ['users', boLoc],
    queryFn: () => layDanhSachNhanVien(boLoc),
  });

  const { data: cay = [] } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: layCayPhongBan,
  });
  const phangPhongBan = useMemo(() => duyetPhang(cay), [cay]);

  const { data: chucDanh = [] } = useQuery({
    queryKey: ['job-titles', 'tat-ca'],
    queryFn: () => layChucDanh(),
  });

  // --- Gợi ý đặt trưởng bộ phận ---
  // Theo dõi hai trường trong form để biết có nên hiện gợi ý không.
  const vaiTroDangChon = Form.useWatch('role', form);
  const phongDangChon = Form.useWatch('departmentId', form);
  const phongThieuTruong = useMemo(() => {
    if (vaiTroDangChon !== 'MANAGER' || !phongDangChon) return null;
    const phong = phangPhongBan.find((d) => d.id === phongDangChon);
    // Đã có trưởng rồi thì thôi; nếu chính người đang sửa là trưởng cũng thôi
    if (!phong || (phong.managerId && phong.managerId !== dangSua?.id))
      return null;
    return phong.managerId ? null : phong;
  }, [vaiTroDangChon, phongDangChon, phangPhongBan, dangSua]);

  function lamMoi() {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['departments'] });
  }

  const luu = useMutation({
    mutationFn: async ({ datLamTruongBoPhan, ...values }: FormValues) => {
      const nguoi = dangSua
        ? await suaNhanVien(dangSua.id, values)
        : await taoNhanVien(values);

      // Đặt trưởng bộ phận là một lời gọi riêng: đây là thuộc tính của
      // PHÒNG BAN chứ không phải của người.
      if (datLamTruongBoPhan && values.departmentId) {
        await suaPhongBan(values.departmentId, { managerId: nguoi.id });
      }
      return nguoi;
    },
    onSuccess: (nguoi) => {
      message.success(dangSua ? 'Đã lưu thay đổi' : 'Đã thêm nhân viên');
      setModalMo(false);
      lamMoi();
      if (
        'temporaryPassword' in nguoi &&
        typeof nguoi.temporaryPassword === 'string'
      ) {
        setMatKhauTam({
          hoTen: nguoi.fullName,
          matKhau: nguoi.temporaryPassword,
        });
      }
    },
    onError: (error) => setLoiForm(layThongBaoLoi(error)),
  });

  const datLai = useMutation({
    mutationFn: (row: OrgUser) => datLaiMatKhau(row.id),
    onSuccess: (kq, row) =>
      setMatKhauTam({ hoTen: row.fullName, matKhau: kq.temporaryPassword }),
    onError: (error) => message.error(layThongBaoLoi(error)),
  });

  const doiTrangThai = useMutation({
    mutationFn: ({ row, hoatDong }: { row: OrgUser; hoatDong: boolean }) =>
      doiTrangThaiNhanVien(row.id, hoatDong),
    onSuccess: () => {
      message.success('Đã cập nhật trạng thái');
      lamMoi();
    },
    onError: (error) => message.error(layThongBaoLoi(error)),
  });

  function moThemMoi() {
    setDangSua(null);
    setLoiForm(null);
    form.resetFields();
    form.setFieldsValue({ role: 'STAFF' });
    setModalMo(true);
  }

  function moSua(row: OrgUser) {
    setDangSua(row);
    setLoiForm(null);
    form.setFieldsValue({
      employeeCode: row.employeeCode,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      departmentId: row.departmentId,
      jobTitleId: row.jobTitleId,
      level: row.level,
      datLamTruongBoPhan: false,
    });
    setModalMo(true);
  }

  function xacNhanDatLai(row: OrgUser) {
    modal.confirm({
      title: `Đặt lại mật khẩu cho ${row.fullName}?`,
      content:
        'Mọi phiên đăng nhập hiện tại của người này sẽ bị thu hồi. ' +
        'Mật khẩu tạm chỉ hiện một lần duy nhất.',
      okText: 'Đặt lại',
      cancelText: 'Huỷ',
      onOk: () => datLai.mutateAsync(row),
    });
  }

  function xacNhanDoiTrangThai(row: OrgUser) {
    const tat = row.isActive;
    modal.confirm({
      title: tat
        ? `Vô hiệu hoá ${row.fullName}?`
        : `Kích hoạt lại ${row.fullName}?`,
      content: tat
        ? 'Người này sẽ không đăng nhập được nữa và mọi phiên hiện tại bị thu hồi. Dữ liệu KPI cũ vẫn giữ nguyên.'
        : 'Người này sẽ đăng nhập lại được bằng mật khẩu hiện tại.',
      okText: tat ? 'Vô hiệu hoá' : 'Kích hoạt',
      okButtonProps: { danger: tat },
      cancelText: 'Huỷ',
      onOk: () => doiTrangThai.mutateAsync({ row, hoatDong: !tat }),
    });
  }

  function chonLocNhanh(key: LocNhanh) {
    setLocNhanh(key);
    const thamSo = CHIP_LOC.find((c) => c.key === key)!.thamSo;
    // Xoá ba trường mà chip quản lý rồi đặt lại theo chip; giữ phòng/chức danh/tìm kiếm
    setBoLoc(({ role: _r, isActive: _a, mustChangePassword: _m, ...cu }) => ({
      ...cu,
      ...thamSo,
      page: 1,
    }));
  }

  const soPhong = phangPhongBan.length;

  const cot: ColumnsType<OrgUser> = [
    {
      title: 'Nhân viên',
      dataIndex: 'fullName',
      render: (ten: string, row) => (
        <Space size={12}>
          <Avatar
            style={{
              background: row.isActive ? '#dbe6ff' : '#e2e8f0',
              color: row.isActive ? mauChuDao : 'rgba(0,0,0,0.45)',
              fontWeight: 700,
            }}
          >
            {chuVietTat(ten)}
          </Avatar>
          <span className="ten-va-phu">
            <Typography.Text strong>{ten}</Typography.Text>
            <small>
              {row.employeeCode} · {row.email}
            </small>
          </span>
        </Space>
      ),
    },
    {
      title: 'Chức danh',
      dataIndex: 'jobTitleName',
      render: (v: string | null, row) => (
        <span className="ten-va-phu">
          <span>
            {v ?? <Typography.Text type="secondary">—</Typography.Text>}
          </span>
          {row.level && <small>Cấp bậc {row.level}</small>}
        </span>
      ),
    },
    {
      title: 'Phòng ban',
      dataIndex: 'departmentName',
      render: (v: string | null) =>
        v ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      width: 150,
      render: (r: Role) => (
        <Tag className={`tag-tron${r === 'STAFF' ? '' : ' tag-chua-co'}`}>
          {ROLE_LABELS[r]}
        </Tag>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'trangThai',
      width: 150,
      // Ba trạng thái loại trừ nhau; hai trạng thái sau cần HCNS để ý nên tô hồng
      render: (_: unknown, row) =>
        !row.isActive ? (
          <Typography.Text strong style={{ color: mauNhan }}>
            Đã nghỉ việc
          </Typography.Text>
        ) : row.mustChangePassword ? (
          <Typography.Text strong style={{ color: mauNhan }}>
            Chưa đổi mật khẩu
          </Typography.Text>
        ) : (
          <Typography.Text style={{ color: mauChuDao }}>
            Đang hoạt động
          </Typography.Text>
        ),
    },
    ...(coQuyenGhi
      ? [
          {
            title: '',
            key: 'thao-tac',
            width: 110,
            align: 'right' as const,
            render: (_: unknown, row: OrgUser) => (
              <Space size={4}>
                <Button
                  type="link"
                  style={{ padding: '0 4px' }}
                  onClick={() => moSua(row)}
                >
                  Sửa
                </Button>
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'dat-lai',
                        icon: <KeyOutlined />,
                        label: 'Đặt lại mật khẩu',
                        onClick: () => xacNhanDatLai(row),
                      },
                      {
                        key: 'trang-thai',
                        icon: row.isActive ? (
                          <StopOutlined />
                        ) : (
                          <CheckCircleOutlined />
                        ),
                        label: row.isActive ? 'Vô hiệu hoá' : 'Kích hoạt lại',
                        danger: row.isActive,
                        onClick: () => xacNhanDoiTrangThai(row),
                      },
                    ],
                  }}
                >
                  <Button
                    type="text"
                    icon={<MoreOutlined />}
                    aria-label="Thao tác khác"
                  />
                </Dropdown>
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <ThanhTab nhom="nhan-su" />
      <TieuDeTrang
        tieuDe="Nhân viên"
        moTa={
          danhSach
            ? `${danhSach.total} người${locNhanh !== 'tat-ca' || boLoc.departmentId || boLoc.jobTitleId || boLoc.search ? ' theo bộ lọc' : ''} · ${soPhong} phòng ban`
            : undefined
        }
        phai={
          <>
            <Input
              allowClear
              size="large"
              className="o-tim-tron"
              prefix={<SearchOutlined />}
              placeholder="Tìm theo tên hoặc mã nhân viên"
              style={{ width: 280 }}
              value={oTimKiem}
              onChange={(e) => setOTimKiem(e.target.value)}
              onPressEnter={() =>
                setBoLoc((cu) => ({
                  ...cu,
                  search: oTimKiem || undefined,
                  page: 1,
                }))
              }
              onBlur={() =>
                setBoLoc((cu) => ({
                  ...cu,
                  search: oTimKiem || undefined,
                  page: 1,
                }))
              }
            />
            {coQuyenGhi && (
              <Button
                icon={<PlusOutlined />}
                type="primary"
                shape="round"
                size="large"
                onClick={moThemMoi}
              >
                Thêm nhân viên
              </Button>
            )}
          </>
        }
      />

      {!coQuyenGhi && <ReadOnlyNotice role={nguoiDangDangNhap?.role} />}

      {cacThe.length > 0 && (
        <div className="the-so-lieu-luoi" style={{ marginBottom: 16 }}>
          {cacThe.map((the) => (
            <TheSoLieu key={the.nhan} {...the} />
          ))}
        </div>
      )}

      <div className="chip-loc-hang">
        {CHIP_LOC.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`chip-loc${locNhanh === c.key ? ' chip-loc-chon' : ''}`}
            onClick={() => chonLocNhanh(c.key)}
          >
            {c.nhan}
          </button>
        ))}
        <TreeSelect
          allowClear
          showSearch
          treeNodeFilterProp="title"
          className="chon-tron"
          style={{ minWidth: 220 }}
          placeholder="Phòng ban"
          treeData={chuyenSangTreeData(cay)}
          value={boLoc.departmentId}
          onChange={(v: string | undefined) =>
            setBoLoc((cu) => ({ ...cu, departmentId: v, page: 1 }))
          }
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          className="chon-tron"
          style={{ minWidth: 200 }}
          placeholder="Chức danh"
          value={boLoc.jobTitleId}
          onChange={(v: string | undefined) =>
            setBoLoc((cu) => ({ ...cu, jobTitleId: v, page: 1 }))
          }
          options={chucDanh.map((t) => ({ value: t.id, label: t.name }))}
        />
      </div>

      <Table<OrgUser>
        rowKey="id"
        loading={isLoading}
        dataSource={danhSach?.data ?? []}
        scroll={{ x: 'max-content' }}
        columns={cot}
        pagination={{
          current: danhSach?.page ?? 1,
          pageSize: danhSach?.limit ?? SO_DONG_MAC_DINH,
          total: danhSach?.total ?? 0,
          showSizeChanger: true,
          showTotal: (tong) => `${tong} nhân viên`,
          onChange: (page, limit) => setBoLoc((cu) => ({ ...cu, page, limit })),
        }}
      />

      <Modal
        open={modalMo}
        title={dangSua ? `Sửa "${dangSua.fullName}"` : 'Thêm nhân viên'}
        onCancel={() => setModalMo(false)}
        onOk={() => form.submit()}
        confirmLoading={luu.isPending}
        okText="Lưu"
        cancelText="Huỷ"
        width={560}
        destroyOnHidden
      >
        {loiForm && (
          <Alert
            type="error"
            message={loiForm}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => luu.mutate(values)}
        >
          <Form.Item
            name="employeeCode"
            label="Mã nhân viên"
            rules={[
              { required: true, message: 'Vui lòng nhập mã nhân viên' },
              {
                pattern: /^[A-Z0-9-]+$/,
                message: 'Chỉ gồm chữ in hoa, số và dấu gạch ngang',
              },
            ]}
          >
            <Input placeholder="VD: HM015" />
          </Form.Item>

          <Form.Item
            name="fullName"
            label="Họ tên"
            rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Vui lòng nhập email' },
              { type: 'email', message: 'Email không đúng định dạng' },
            ]}
          >
            <Input placeholder="ten.nhanvien@hmico.vn" />
          </Form.Item>

          <Form.Item name="departmentId" label="Phòng ban">
            <TreeSelect
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder="Chọn phòng ban"
              treeData={chuyenSangTreeData(cay)}
            />
          </Form.Item>

          <Form.Item name="jobTitleId" label="Chức danh">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Chọn chức danh"
              options={chucDanh
                .filter((t) => t.isActive)
                .map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }))}
            />
          </Form.Item>

          <Form.Item name="level" label="Cấp bậc">
            <Input placeholder="VD: S2, M1" />
          </Form.Item>

          <Form.Item
            name="role"
            label="Vai trò"
            rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}
          >
            <Select
              options={CAC_VAI_TRO.map((r) => ({
                value: r,
                label: ROLE_LABELS[r],
              }))}
            />
          </Form.Item>

          {/*
            Bẫy hay gặp: đặt người làm MANAGER nhưng quên gán họ làm trưởng
            bộ phận. Phòng đó sẽ không ai duyệt KPI, và lỗi chỉ lộ ra cuối
            tháng khi nhân viên đã nộp kết quả.
          */}
          {phongThieuTruong && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Phòng "${phongThieuTruong.name}" chưa có trưởng bộ phận`}
              description={
                <Space direction="vertical" size={4}>
                  <Typography.Text>
                    KPI của phòng này sẽ không ai duyệt được cho tới khi có
                    trưởng bộ phận.
                  </Typography.Text>
                  <Form.Item
                    name="datLamTruongBoPhan"
                    valuePropName="checked"
                    noStyle
                  >
                    <Checkbox>Đặt người này làm trưởng bộ phận</Checkbox>
                  </Form.Item>
                </Space>
              }
            />
          )}
        </Form>
      </Modal>

      <TemporaryPasswordModal
        open={matKhauTam !== null}
        hoTen={matKhauTam?.hoTen ?? ''}
        matKhau={matKhauTam?.matKhau ?? ''}
        onClose={() => setMatKhauTam(null)}
      />
    </div>
  );
}
