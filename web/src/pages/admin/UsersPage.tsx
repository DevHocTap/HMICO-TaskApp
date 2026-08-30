import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  TreeSelect,
  Typography,
} from 'antd';
import {
  EditOutlined,
  KeyOutlined,
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
import type { DepartmentNode, ListUsersParams, OrgUser } from '../../types/org';
import { TemporaryPasswordModal } from '../../components/TemporaryPasswordModal';
import { ReadOnlyNotice } from '../../components/ReadOnlyNotice';

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
    children: n.children.length > 0 ? chuyenSangTreeData(n.children) : undefined,
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
  const [modalMo, setModalMo] = useState(false);
  const [dangSua, setDangSua] = useState<OrgUser | null>(null);
  const [loiForm, setLoiForm] = useState<string | null>(null);
  const [matKhauTam, setMatKhauTam] = useState<{ hoTen: string; matKhau: string } | null>(
    null,
  );

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
    if (!phong || (phong.managerId && phong.managerId !== dangSua?.id)) return null;
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
      if ('temporaryPassword' in nguoi && typeof nguoi.temporaryPassword === 'string') {
        setMatKhauTam({ hoTen: nguoi.fullName, matKhau: nguoi.temporaryPassword });
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
      title: tat ? `Vô hiệu hoá ${row.fullName}?` : `Kích hoạt lại ${row.fullName}?`,
      content: tat
        ? 'Người này sẽ không đăng nhập được nữa và mọi phiên hiện tại bị thu hồi. Dữ liệu KPI cũ vẫn giữ nguyên.'
        : 'Người này sẽ đăng nhập lại được bằng mật khẩu hiện tại.',
      okText: tat ? 'Vô hiệu hoá' : 'Kích hoạt',
      okButtonProps: { danger: tat },
      cancelText: 'Huỷ',
      onOk: () => doiTrangThai.mutateAsync({ row, hoatDong: !tat }),
    });
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Nhân viên
        </Typography.Title>
        {coQuyenGhi && (
          <Button icon={<PlusOutlined />} type="primary" onClick={moThemMoi}>
            Thêm nhân viên
          </Button>
        )}
      </Space>

      {!coQuyenGhi && <ReadOnlyNotice role={nguoiDangDangNhap?.role} />}

      <Space wrap>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Tìm theo tên hoặc mã nhân viên"
          style={{ width: 260 }}
          value={oTimKiem}
          onChange={(e) => setOTimKiem(e.target.value)}
          onPressEnter={() =>
            setBoLoc((cu) => ({ ...cu, search: oTimKiem || undefined, page: 1 }))
          }
          onBlur={() =>
            setBoLoc((cu) => ({ ...cu, search: oTimKiem || undefined, page: 1 }))
          }
        />
        <TreeSelect
          allowClear
          showSearch
          treeNodeFilterProp="title"
          style={{ minWidth: 240 }}
          placeholder="Phòng ban"
          treeData={chuyenSangTreeData(cay)}
          value={boLoc.departmentId}
          onChange={(v: string | undefined) =>
            setBoLoc((cu) => ({ ...cu, departmentId: v, page: 1 }))
          }
        />
        <Select
          allowClear
          style={{ minWidth: 180 }}
          placeholder="Vai trò"
          value={boLoc.role}
          onChange={(v: Role | undefined) => setBoLoc((cu) => ({ ...cu, role: v, page: 1 }))}
          options={CAC_VAI_TRO.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
        />
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 200 }}
          placeholder="Chức danh"
          value={boLoc.jobTitleId}
          onChange={(v: string | undefined) =>
            setBoLoc((cu) => ({ ...cu, jobTitleId: v, page: 1 }))
          }
          options={chucDanh.map((t) => ({ value: t.id, label: t.name }))}
        />
        <Select
          allowClear
          style={{ minWidth: 160 }}
          placeholder="Trạng thái"
          value={boLoc.isActive}
          onChange={(v: boolean | undefined) =>
            setBoLoc((cu) => ({ ...cu, isActive: v, page: 1 }))
          }
          options={[
            { value: true, label: 'Đang hoạt động' },
            { value: false, label: 'Đã vô hiệu hoá' },
          ]}
        />
      </Space>

      <Table<OrgUser>
        rowKey="id"
        loading={isLoading}
        dataSource={danhSach?.data ?? []}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: danhSach?.page ?? 1,
          pageSize: danhSach?.limit ?? SO_DONG_MAC_DINH,
          total: danhSach?.total ?? 0,
          showSizeChanger: true,
          showTotal: (tong) => `${tong} nhân viên`,
          onChange: (page, limit) => setBoLoc((cu) => ({ ...cu, page, limit })),
        }}
        columns={[
          { title: 'Mã NV', dataIndex: 'employeeCode', width: 110 },
          {
            title: 'Họ tên',
            dataIndex: 'fullName',
            render: (ten: string, row) => (
              <Space size={6}>
                <span>{ten}</span>
                {row.mustChangePassword && (
                  <Tooltip title="Chưa đổi mật khẩu lần đầu">
                    <Tag color="orange">Mới</Tag>
                  </Tooltip>
                )}
              </Space>
            ),
          },
          { title: 'Email', dataIndex: 'email' },
          {
            title: 'Phòng ban',
            dataIndex: 'departmentName',
            render: (v: string | null) =>
              v ?? <Typography.Text type="secondary">—</Typography.Text>,
          },
          {
            title: 'Chức danh',
            dataIndex: 'jobTitleName',
            render: (v: string | null) =>
              v ?? <Typography.Text type="secondary">—</Typography.Text>,
          },
          { title: 'Cấp bậc', dataIndex: 'level', width: 100 },
          {
            title: 'Vai trò',
            dataIndex: 'role',
            width: 160,
            render: (r: Role) => <Tag color="blue">{ROLE_LABELS[r]}</Tag>,
          },
          {
            title: 'Trạng thái',
            dataIndex: 'isActive',
            width: 130,
            render: (hoatDong: boolean) =>
              hoatDong ? <Tag color="green">Hoạt động</Tag> : <Tag>Đã tắt</Tag>,
          },
          ...(coQuyenGhi
            ? [
                {
                  title: '',
                  key: 'thao-tac',
                  width: 200,
                  render: (_: unknown, row: OrgUser) => (
                    <Space>
                      <Tooltip title="Sửa">
                        <Button
                          size="small"
                          icon={<EditOutlined />}
                          onClick={() => moSua(row)}
                        />
                      </Tooltip>
                      <Tooltip title="Đặt lại mật khẩu">
                        <Button
                          size="small"
                          icon={<KeyOutlined />}
                          onClick={() => xacNhanDatLai(row)}
                        />
                      </Tooltip>
                      <Tooltip title={row.isActive ? 'Vô hiệu hoá' : 'Kích hoạt lại'}>
                        <Button
                          size="small"
                          danger={row.isActive}
                          icon={
                            row.isActive ? <StopOutlined /> : <CheckCircleOutlined />
                          }
                          onClick={() => xacNhanDoiTrangThai(row)}
                        />
                      </Tooltip>
                    </Space>
                  ),
                },
              ]
            : []),
        ]}
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
          <Alert type="error" message={loiForm} showIcon style={{ marginBottom: 16 }} />
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
              options={CAC_VAI_TRO.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
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
                    KPI của phòng này sẽ không ai duyệt được cho tới khi có trưởng bộ phận.
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
    </Space>
  );
}
