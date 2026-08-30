import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CopyOutlined,
  EditOutlined,
  PlusOutlined,
  StopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  layDanhSachMau,
  saoChepMau,
  taoMau,
  voHieuHoaMau,
} from '../../api/kpi-template';
import { layChucDanh } from '../../api/org';
import { layThongBaoLoi } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { coTheGhiToChuc } from '../../auth/permissions';
import { ReadOnlyNotice } from '../../components/ReadOnlyNotice';
import type { KpiTemplate, TemplateStatus } from '../../types/kpi-template';

interface FormValues {
  code: string;
  name: string;
  jobTitleId?: string | null;
}

export function KpiTemplatesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const coQuyenGhi = coTheGhiToChuc(user?.role);
  const [form] = Form.useForm<FormValues>();

  const [locChucDanh, setLocChucDanh] = useState<string | undefined>();
  const [locTrangThai, setLocTrangThai] = useState<TemplateStatus | undefined>();
  const [modalMo, setModalMo] = useState(false);
  /** Null = tạo mới; có giá trị = đang sao chép từ mẫu đó. */
  const [dangSaoChep, setDangSaoChep] = useState<KpiTemplate | null>(null);
  const [loiForm, setLoiForm] = useState<string | null>(null);

  const { data: danhSach = [], isLoading } = useQuery({
    queryKey: ['kpi-templates', locChucDanh ?? 'tat-ca', locTrangThai ?? 'tat-ca'],
    queryFn: () =>
      layDanhSachMau({ jobTitleId: locChucDanh, status: locTrangThai }),
  });

  const { data: chucDanh = [] } = useQuery({
    queryKey: ['job-titles', 'tat-ca'],
    queryFn: () => layChucDanh(),
  });

  function lamMoi() {
    void queryClient.invalidateQueries({ queryKey: ['kpi-templates'] });
  }

  const luu = useMutation({
    mutationFn: (values: FormValues) =>
      dangSaoChep
        ? saoChepMau(dangSaoChep.id, values)
        : taoMau(values),
    onSuccess: (mau) => {
      message.success(dangSaoChep ? 'Đã sao chép mẫu' : 'Đã tạo mẫu');
      setModalMo(false);
      lamMoi();
      navigate(`/admin/kpi-templates/${mau.id}/edit`);
    },
    onError: (e) => setLoiForm(layThongBaoLoi(e)),
  });

  const voHieuHoa = useMutation({
    mutationFn: voHieuHoaMau,
    onSuccess: () => {
      message.success('Đã vô hiệu hoá mẫu');
      lamMoi();
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  function moTaoMoi() {
    setDangSaoChep(null);
    setLoiForm(null);
    form.resetFields();
    setModalMo(true);
  }

  function moSaoChep(mau: KpiTemplate) {
    setDangSaoChep(mau);
    setLoiForm(null);
    form.setFieldsValue({
      code: `${mau.code}-COPY`,
      name: `${mau.name} (bản sao)`,
      jobTitleId: mau.jobTitleId,
    });
    setModalMo(true);
  }

  function xacNhanVoHieuHoa(mau: KpiTemplate) {
    modal.confirm({
      title: `Vô hiệu hoá mẫu "${mau.name}"?`,
      content:
        'Mẫu sẽ không còn hiện khi giao KPI cho nhân viên mới. ' +
        'Phiếu KPI đã tạo từ mẫu này vẫn giữ nguyên nội dung.',
      okText: 'Vô hiệu hoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () => voHieuHoa.mutateAsync(mau.id),
    });
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Mẫu KPI
        </Typography.Title>
        <Space wrap>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ minWidth: 220 }}
            placeholder="Lọc theo chức danh"
            value={locChucDanh}
            onChange={setLocChucDanh}
            options={chucDanh.map((t) => ({ value: t.id, label: t.name }))}
          />
          <Select
            allowClear
            style={{ minWidth: 160 }}
            placeholder="Trạng thái"
            value={locTrangThai}
            onChange={setLocTrangThai}
            options={[
              { value: 'DRAFT', label: 'Bản nháp' },
              { value: 'PUBLISHED', label: 'Đã xuất bản' },
            ]}
          />
          {coQuyenGhi && (
            <Button icon={<PlusOutlined />} type="primary" onClick={moTaoMoi}>
              Tạo mẫu mới
            </Button>
          )}
        </Space>
      </Space>

      {!coQuyenGhi && <ReadOnlyNotice role={user?.role} />}

      <Table<KpiTemplate>
        rowKey="id"
        loading={isLoading}
        dataSource={danhSach}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Mã', dataIndex: 'code', width: 150 },
          {
            title: 'Tên mẫu',
            dataIndex: 'name',
            render: (ten: string, row) => (
              <Space size={6}>
                <a onClick={() => navigate(`/admin/kpi-templates/${row.id}/edit`)}>
                  {ten}
                </a>
                {row.isSystem && (
                  <Tooltip title="Mục 2 — áp dụng chung cho mọi chức danh, chỉ quản trị viên sửa được">
                    <Tag color="purple">Mẫu hệ thống</Tag>
                  </Tooltip>
                )}
              </Space>
            ),
          },
          {
            title: 'Chức danh',
            dataIndex: 'jobTitleName',
            render: (v: string | null) =>
              v ?? <Typography.Text type="secondary">Dùng chung</Typography.Text>,
          },
          {
            title: 'Số tiêu chí',
            dataIndex: 'criteriaCount',
            width: 110,
            align: 'right',
          },
          {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 140,
            render: (tt: TemplateStatus) =>
              tt === 'PUBLISHED' ? (
                <Tag color="green">Đã xuất bản</Tag>
              ) : (
                <Tag color="orange">Bản nháp</Tag>
              ),
          },
          { title: 'Phiên bản', dataIndex: 'version', width: 100, align: 'center' },
          {
            title: '',
            key: 'thao-tac',
            width: 200,
            render: (_, row) => (
              <Space>
                <Tooltip title={row.isSystem && coQuyenGhi ? 'Chỉ xem' : 'Sửa'}>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => navigate(`/admin/kpi-templates/${row.id}/edit`)}
                  />
                </Tooltip>
                {coQuyenGhi && (
                  <>
                    <Tooltip title="Sao chép">
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => moSaoChep(row)}
                      />
                    </Tooltip>
                    {!row.isSystem && (
                      <Tooltip title="Vô hiệu hoá">
                        <Button
                          size="small"
                          danger
                          icon={<StopOutlined />}
                          onClick={() => xacNhanVoHieuHoa(row)}
                        />
                      </Tooltip>
                    )}
                  </>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={modalMo}
        title={dangSaoChep ? `Sao chép "${dangSaoChep.name}"` : 'Tạo mẫu KPI mới'}
        onCancel={() => setModalMo(false)}
        onOk={() => form.submit()}
        confirmLoading={luu.isPending}
        okText={dangSaoChep ? 'Sao chép' : 'Tạo'}
        cancelText="Huỷ"
        destroyOnHidden
      >
        {loiForm && (
          <Alert type="error" message={loiForm} showIcon style={{ marginBottom: 16 }} />
        )}
        {dangSaoChep && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Bản sao gồm toàn bộ tiêu chí và KPI con của mẫu gốc"
            description="Bản sao ở trạng thái nháp. Sửa bản sao không ảnh hưởng mẫu gốc."
          />
        )}
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(v) => luu.mutate(v)}
        >
          <Form.Item
            name="code"
            label="Mã mẫu"
            rules={[
              { required: true, message: 'Vui lòng nhập mã mẫu' },
              {
                pattern: /^[A-Z0-9-]+$/,
                message: 'Chỉ gồm chữ in hoa, số và dấu gạch ngang',
              },
            ]}
          >
            <Input placeholder="VD: TPL-KT-SD" />
          </Form.Item>
          <Form.Item
            name="name"
            label="Tên mẫu"
            rules={[{ required: true, message: 'Vui lòng nhập tên mẫu' }]}
          >
            <Input placeholder="VD: KPI Nhân viên Shop Drawing" />
          </Form.Item>
          <Form.Item
            name="jobTitleId"
            label="Chức danh áp dụng"
            extra="Để trống nếu mẫu dùng chung cho nhiều chức danh"
          >
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
        </Form>
      </Modal>
    </Space>
  );
}
