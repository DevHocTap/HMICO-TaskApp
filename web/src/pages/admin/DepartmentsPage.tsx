import { useMemo, useState } from 'react';
import { TieuDeTrang } from '../../components/TieuDeTrang';
import { ThanhTab } from '../../components/ThanhTab';
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  layCayPhongBan,
  layDanhSachNhanVien,
  suaPhongBan,
  taoPhongBan,
  voHieuHoaPhongBan,
} from '../../api/org';
import { laySanSangCongTy } from '../../api/scorecard';
import { layThongBaoLoi } from '../../api/client';
import type { DepartmentNode } from '../../types/org';
import { useAuth } from '../../auth/useAuth';
import { coTheGhiToChuc } from '../../auth/permissions';
import { ReadOnlyNotice } from '../../components/ReadOnlyNotice';

interface FormValues {
  code: string;
  name: string;
  parentId?: string | null;
  managerId?: string | null;
}

/** Duyệt cây, trả về danh sách phẳng. */
function duyetPhang(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((n) => [n, ...duyetPhang(n.children)]);
}

/** Id của phòng đó và toàn bộ con cháu — dùng để ẩn nhánh gây vòng lặp. */
function idsCuaNhanh(node: DepartmentNode): string[] {
  return [node.id, ...node.children.flatMap(idsCuaNhanh)];
}

export function DepartmentsPage() {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const { user: nguoiDangDangNhap } = useAuth();
  const coQuyenGhi = coTheGhiToChuc(nguoiDangDangNhap?.role);

  const [dangChon, setDangChon] = useState<DepartmentNode | null>(null);
  const [modalMo, setModalMo] = useState(false);
  /** Null = đang tạo mới; có giá trị = đang sửa phòng đó. */
  const [dangSua, setDangSua] = useState<DepartmentNode | null>(null);
  const [loiForm, setLoiForm] = useState<string | null>(null);

  const { data: cay = [], isLoading } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: layCayPhongBan,
  });

  const danhSachPhang = useMemo(() => duyetPhang(cay), [cay]);

  // Danh sách người trong phòng đang sửa, để chọn trưởng bộ phận.
  // Backend bắt buộc trưởng bộ phận phải thuộc chính phòng đó.
  const idPhongDangSua = dangSua?.id;
  const { data: nguoiTrongPhong } = useQuery({
    queryKey: ['users', 'cua-phong', idPhongDangSua],
    queryFn: () =>
      layDanhSachNhanVien({
        departmentId: idPhongDangSua,
        limit: 100,
        isActive: true,
      }),
    enabled: Boolean(idPhongDangSua),
  });

  /**
   * Phòng nào THẬT SỰ bị chặn — lấy từ backend, KHÔNG tự đếm `!managerId`.
   *
   * Đếm mọi phòng thiếu trưởng là sai: 8 đơn vị tổ chức chưa có nhân sự nào
   * (Công ty HMICO, Hà Nội, Chi nhánh HCM, Phòng Dự án…) và Ban giám đốc
   * (giám đốc không bị chấm điểm) đều không cần trưởng bộ phận. Bản trước
   * báo đỏ cả 10 trong khi KHÔNG phòng nào bị chặn — báo động giả lặp mỗi
   * lần mở màn hình thì người dùng học cách bỏ qua luôn cả cảnh báo thật.
   *
   * `readiness/company` đã tách sẵn hai loại; quyền gọi đúng bằng quyền vào
   * màn này (ADMIN, HR, EXECUTIVE).
   */
  const { data: sanSang } = useQuery({
    queryKey: ['scorecards', 'readiness', 'company'],
    queryFn: laySanSangCongTy,
  });

  const phongBiChan = sanSang?.departmentsWithoutManager ?? [];
  const maPhongBiChan = useMemo(
    () => new Set(phongBiChan.map((p) => p.code)),
    [phongBiChan],
  );

  function lamMoi() {
    void queryClient.invalidateQueries({ queryKey: ['departments'] });
  }

  const luu = useMutation({
    mutationFn: (values: FormValues) =>
      dangSua ? suaPhongBan(dangSua.id, values) : taoPhongBan(values),
    onSuccess: () => {
      message.success(dangSua ? 'Đã lưu thay đổi' : 'Đã thêm phòng ban');
      setModalMo(false);
      lamMoi();
    },
    onError: (error) => setLoiForm(layThongBaoLoi(error)),
  });

  const voHieuHoa = useMutation({
    mutationFn: voHieuHoaPhongBan,
    onSuccess: () => {
      message.success('Đã vô hiệu hoá phòng ban');
      setDangChon(null);
      lamMoi();
    },
    onError: (error) => message.error(layThongBaoLoi(error)),
  });

  function moThemMoi(cha: DepartmentNode | null) {
    setDangSua(null);
    setLoiForm(null);
    form.resetFields();
    form.setFieldsValue({ parentId: cha?.id ?? null });
    setModalMo(true);
  }

  function moSua(node: DepartmentNode) {
    setDangSua(node);
    setLoiForm(null);
    form.setFieldsValue({
      code: node.code,
      name: node.name,
      parentId: node.parentId,
      managerId: node.managerId,
    });
    setModalMo(true);
  }

  function xacNhanVoHieuHoa(node: DepartmentNode) {
    modal.confirm({
      title: `Vô hiệu hoá "${node.name}"?`,
      content: (
        <div>
          <p>
            Phòng ban sẽ không còn hiện trong danh sách chọn, nhưng dữ liệu cũ
            vẫn giữ nguyên.
          </p>
          <p style={{ marginBottom: 0 }}>
            Không thể vô hiệu hoá nếu phòng còn nhân viên hoặc còn phòng con
            đang hoạt động.
          </p>
        </div>
      ),
      okText: 'Vô hiệu hoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () => voHieuHoa.mutateAsync(node.id),
    });
  }

  /** Nút cây: tên phòng + số người + cảnh báo thiếu trưởng bộ phận. */
  function dungTieuDe(node: DepartmentNode) {
    return (
      <Space size={6}>
        <span>{node.name}</span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {node.code}
        </Typography.Text>
        <Tag style={{ marginInlineEnd: 0 }}>{node.userCount} người</Tag>
        {maPhongBiChan.has(node.code) && (
          // CHỈ cảnh báo phòng đang có nhân sự mà thiếu trưởng bộ phận: những
          // người đó không sinh được phiếu KPI. Đơn vị chưa có ai thì chưa
          // cần trưởng — cảnh báo ở đó là báo động giả.
          <Tooltip title="Phòng đang có nhân sự nhưng chưa có trưởng bộ phận — những người này không sinh được phiếu KPI">
            <WarningOutlined style={{ color: '#faad14' }} />
          </Tooltip>
        )}
      </Space>
    );
  }

  function chuyenSangDataNode(nodes: DepartmentNode[]): DataNode[] {
    return nodes.map((n) => ({
      key: n.id,
      title: dungTieuDe(n),
      children:
        n.children.length > 0 ? chuyenSangDataNode(n.children) : undefined,
    }));
  }

  // Mở sẵn hai tầng đầu
  const khoaMoSan = useMemo(
    () => [
      ...cay.map((n) => n.id),
      ...cay.flatMap((n) => n.children.map((c) => c.id)),
    ],
    [cay],
  );

  // Chuyển phòng: ẩn chính nó và mọi con cháu, vì backend sẽ từ chối
  const idsBiCam = dangSua ? idsCuaNhanh(dangSua) : [];
  const luaChonPhongCha = danhSachPhang
    .filter((d) => !idsBiCam.includes(d.id))
    .map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <ThanhTab nhom="nhan-su" />
      <TieuDeTrang
        tieuDe="Cây phòng ban"
        moTa="Bấm một phòng để sửa hoặc thêm phòng con. Phòng có nhân sự mà thiếu trưởng bộ phận thì không sinh được phiếu KPI."
        phai={
          coQuyenGhi && (
            <>
              <Button
                shape="round"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => moThemMoi(dangChon)}
                type="primary"
              >
                {dangChon
                  ? `Thêm phòng con của "${dangChon.name}"`
                  : 'Thêm phòng ban'}
              </Button>
              <Button
                shape="round"
                size="large"
                icon={<EditOutlined />}
                disabled={!dangChon}
                onClick={() => dangChon && moSua(dangChon)}
              >
                Sửa
              </Button>
              <Button
                shape="round"
                size="large"
                icon={<DeleteOutlined />}
                danger
                disabled={!dangChon}
                onClick={() => dangChon && xacNhanVoHieuHoa(dangChon)}
              >
                Vô hiệu hoá
              </Button>
            </>
          )
        }
      />

      {!coQuyenGhi && <ReadOnlyNotice role={nguoiDangDangNhap?.role} />}

      {phongBiChan.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${phongBiChan.length} phòng đang có nhân sự nhưng chưa có trưởng bộ phận`}
          description={
            <>
              <div>
                {phongBiChan.reduce((tong, p) => tong + p.headcount, 0)} người
                trong các phòng này không sinh được phiếu KPI, vì hệ thống không
                biết ai là người chấm. Các nút có dấu cảnh báo màu vàng là những
                phòng còn thiếu.
              </div>
              <div style={{ marginTop: 6 }}>
                {phongBiChan.map((p) => (
                  <Tag key={p.code} color="warning" style={{ marginTop: 4 }}>
                    {p.name} — {p.headcount} người
                  </Tag>
                ))}
              </div>
            </>
          }
        />
      )}

      <Card loading={isLoading}>
        {cay.length === 0 && !isLoading ? (
          <Typography.Text type="secondary">
            {coQuyenGhi
              ? 'Chưa có phòng ban nào. Bấm "Thêm phòng ban" để bắt đầu.'
              : 'Chưa có phòng ban nào.'}
          </Typography.Text>
        ) : (
          <Tree
            treeData={chuyenSangDataNode(cay)}
            defaultExpandedKeys={khoaMoSan}
            selectedKeys={dangChon ? [dangChon.id] : []}
            onSelect={(keys) =>
              setDangChon(danhSachPhang.find((d) => d.id === keys[0]) ?? null)
            }
          />
        )}
      </Card>

      <Modal
        open={modalMo}
        title={dangSua ? `Sửa "${dangSua.name}"` : 'Thêm phòng ban'}
        onCancel={() => setModalMo(false)}
        onOk={() => form.submit()}
        confirmLoading={luu.isPending}
        okText="Lưu"
        cancelText="Huỷ"
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
            name="code"
            label="Mã phòng ban"
            rules={[
              { required: true, message: 'Vui lòng nhập mã phòng ban' },
              {
                pattern: /^[A-Z0-9-]+$/,
                message: 'Chỉ gồm chữ in hoa, số và dấu gạch ngang',
              },
            ]}
          >
            <Input placeholder="VD: KT-SD" />
          </Form.Item>

          <Form.Item
            name="name"
            label="Tên phòng ban"
            rules={[{ required: true, message: 'Vui lòng nhập tên phòng ban' }]}
          >
            <Input placeholder="VD: Tổ Shop Drawing" />
          </Form.Item>

          <Form.Item
            name="parentId"
            label="Thuộc phòng ban"
            extra="Để trống nếu đây là đơn vị cấp cao nhất"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Chọn phòng ban cha"
              options={luaChonPhongCha}
            />
          </Form.Item>

          {dangSua && (
            <Form.Item
              name="managerId"
              label="Trưởng bộ phận"
              extra="Chỉ chọn được người thuộc chính phòng ban này"
            >
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={
                  nguoiTrongPhong?.data.length
                    ? 'Chọn trưởng bộ phận'
                    : 'Phòng này chưa có nhân viên nào'
                }
                options={(nguoiTrongPhong?.data ?? []).map((u) => ({
                  value: u.id,
                  label: `${u.fullName} (${u.employeeCode})`,
                }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Space>
  );
}
