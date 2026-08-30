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
  Typography,
} from 'antd';
import { EditOutlined, PlusOutlined, StopOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  layCayPhongBan,
  layChucDanh,
  suaChucDanh,
  taoChucDanh,
  voHieuHoaChucDanh,
} from '../../api/org';
import { layThongBaoLoi } from '../../api/client';
import type { DepartmentNode, JobTitle } from '../../types/org';

interface FormValues {
  code: string;
  name: string;
  description?: string | null;
  departmentId?: string | null;
}

function duyetPhang(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((n) => [n, ...duyetPhang(n.children)]);
}

export function JobTitlesPage() {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<FormValues>();

  const [locPhongBan, setLocPhongBan] = useState<string | undefined>();
  const [modalMo, setModalMo] = useState(false);
  const [dangSua, setDangSua] = useState<JobTitle | null>(null);
  const [loiForm, setLoiForm] = useState<string | null>(null);

  const { data: chucDanh = [], isLoading } = useQuery({
    queryKey: ['job-titles', locPhongBan ?? 'tat-ca'],
    queryFn: () => layChucDanh(locPhongBan),
  });

  const { data: cay = [] } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: layCayPhongBan,
  });
  const luaChonPhongBan = duyetPhang(cay).map((d) => ({
    value: d.id,
    label: `${d.name} (${d.code})`,
  }));

  function lamMoi() {
    void queryClient.invalidateQueries({ queryKey: ['job-titles'] });
  }

  const luu = useMutation({
    mutationFn: (values: FormValues) =>
      dangSua ? suaChucDanh(dangSua.id, values) : taoChucDanh(values),
    onSuccess: () => {
      message.success(dangSua ? 'Đã lưu thay đổi' : 'Đã thêm chức danh');
      setModalMo(false);
      lamMoi();
    },
    onError: (error) => setLoiForm(layThongBaoLoi(error)),
  });

  const voHieuHoa = useMutation({
    mutationFn: voHieuHoaChucDanh,
    onSuccess: () => {
      message.success('Đã vô hiệu hoá chức danh');
      lamMoi();
    },
    onError: (error) => message.error(layThongBaoLoi(error)),
  });

  function moThemMoi() {
    setDangSua(null);
    setLoiForm(null);
    form.resetFields();
    form.setFieldsValue({ departmentId: locPhongBan ?? null });
    setModalMo(true);
  }

  function moSua(row: JobTitle) {
    setDangSua(row);
    setLoiForm(null);
    form.setFieldsValue({
      code: row.code,
      name: row.name,
      description: row.description,
      departmentId: row.departmentId,
    });
    setModalMo(true);
  }

  function xacNhanVoHieuHoa(row: JobTitle) {
    modal.confirm({
      title: `Vô hiệu hoá chức danh "${row.name}"?`,
      content:
        'Chức danh sẽ không còn hiện khi gán cho nhân viên mới. ' +
        'Không thể vô hiệu hoá nếu còn người đang giữ chức danh này.',
      okText: 'Vô hiệu hoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () => voHieuHoa.mutateAsync(row.id),
    });
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Chức danh
        </Typography.Title>
        <Space wrap>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ minWidth: 240 }}
            placeholder="Lọc theo phòng ban"
            value={locPhongBan}
            onChange={setLocPhongBan}
            options={luaChonPhongBan}
          />
          <Button icon={<PlusOutlined />} type="primary" onClick={moThemMoi}>
            Thêm chức danh
          </Button>
        </Space>
      </Space>

      <Table<JobTitle>
        rowKey="id"
        loading={isLoading}
        dataSource={chucDanh}
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Mã', dataIndex: 'code', width: 140 },
          { title: 'Tên chức danh', dataIndex: 'name' },
          {
            title: 'Phòng ban',
            dataIndex: 'departmentName',
            render: (ten: string | null) =>
              ten ?? <Typography.Text type="secondary">Dùng chung</Typography.Text>,
          },
          {
            title: 'Số người',
            dataIndex: 'userCount',
            width: 110,
            align: 'right',
          },
          {
            title: 'Trạng thái',
            dataIndex: 'isActive',
            width: 130,
            render: (hoatDong: boolean) =>
              hoatDong ? (
                <Tag color="green">Đang dùng</Tag>
              ) : (
                <Tag>Ngừng dùng</Tag>
              ),
          },
          {
            title: '',
            key: 'thao-tac',
            width: 160,
            render: (_, row) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => moSua(row)}>
                  Sửa
                </Button>
                {row.isActive && (
                  <Button
                    size="small"
                    danger
                    icon={<StopOutlined />}
                    onClick={() => xacNhanVoHieuHoa(row)}
                  />
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        open={modalMo}
        title={dangSua ? `Sửa "${dangSua.name}"` : 'Thêm chức danh'}
        onCancel={() => setModalMo(false)}
        onOk={() => form.submit()}
        confirmLoading={luu.isPending}
        okText="Lưu"
        cancelText="Huỷ"
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
            name="code"
            label="Mã chức danh"
            rules={[
              { required: true, message: 'Vui lòng nhập mã chức danh' },
              {
                pattern: /^[A-Z0-9-]+$/,
                message: 'Chỉ gồm chữ in hoa, số và dấu gạch ngang',
              },
            ]}
          >
            <Input placeholder="VD: KT-KSTK" />
          </Form.Item>

          <Form.Item
            name="name"
            label="Tên chức danh"
            rules={[{ required: true, message: 'Vui lòng nhập tên chức danh' }]}
          >
            <Input placeholder="VD: Kỹ sư triển khai" />
          </Form.Item>

          <Form.Item
            name="departmentId"
            label="Thuộc phòng ban"
            extra="Để trống nếu chức danh này dùng chung cho nhiều phòng"
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Chọn phòng ban"
              options={luaChonPhongBan}
            />
          </Form.Item>

          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Không bắt buộc" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
