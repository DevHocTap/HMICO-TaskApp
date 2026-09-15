import { useState } from 'react';
import { TieuDeTrang } from '../../components/TieuDeTrang';
import { ThanhTab } from '../../components/ThanhTab';
import {
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { LockOutlined, PlusOutlined, UnlockOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { khoaKy, layKyDanhGia, moKy, taoKyDanhGia } from '../../api/scorecard';
import type { KyMoiInput } from '../../api/scorecard';
import { layThongBaoLoi } from '../../api/client';
import type { KyDanhGia } from '../../types/scorecard';
import { useAuth } from '../../auth/useAuth';
import { coTheChotSo, coTheTaoKy } from '../../auth/permissions';

const NHAN_LOAI: Record<KyDanhGia['type'], string> = {
  MONTH: 'Tháng',
  QUARTER: 'Quý',
  YEAR: 'Năm',
};

/** Ngày lịch thuần — cắt chuỗi, KHÔNG qua `new Date()`.
 *
 * Bốn cột mốc là `@db.Date`, backend trả `2026-09-25T00:00:00.000Z`. Đưa
 * qua `new Date()` rồi định dạng theo giờ máy là mời lệch một ngày ở mọi
 * múi giờ âm — đúng loại lỗi đã sửa ở `tinhTinhTrangHanNop()`.
 */
function ngayLich(iso: string | null): string {
  if (!iso) return '—';
  const [nam, thang, ngay] = iso.slice(0, 10).split('-');
  return `${ngay}/${thang}/${nam}`;
}

export function PeriodsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [moTao, setMoTao] = useState(false);
  const [form] = Form.useForm<KyMoiInput>();

  const chotSoDuoc = coTheChotSo(user?.role);
  const taoDuoc = coTheTaoKy(user?.role);

  const { data: cacKy = [], isLoading } = useQuery({
    queryKey: ['periods', 'tat-ca'],
    queryFn: () => layKyDanhGia(),
  });

  function lamMoi() {
    void queryClient.invalidateQueries({ queryKey: ['periods'] });
  }
  const bao = (e: unknown) => message.error(layThongBaoLoi(e));

  const doiKhoa = useMutation({
    mutationFn: ({ id, khoa }: { id: string; khoa: boolean }) =>
      khoa ? khoaKy(id) : moKy(id),
    onSuccess: (_, { khoa }) => {
      message.success(khoa ? 'Đã chốt sổ kỳ này' : 'Đã mở lại kỳ');
      lamMoi();
    },
    onError: bao,
  });

  const tao = useMutation({
    mutationFn: (v: KyMoiInput) => taoKyDanhGia(v),
    onSuccess: () => {
      message.success('Đã tạo kỳ đánh giá');
      setMoTao(false);
      form.resetFields();
      lamMoi();
    },
    onError: bao,
  });

  const cot: ColumnsType<KyDanhGia> = [
    { title: 'Mã', dataIndex: 'code', width: 110 },
    {
      title: 'Kỳ đánh giá',
      dataIndex: 'name',
      render: (ten: string, k) => (
        <Space size={6}>
          <Typography.Text strong={k.type === 'MONTH'}>{ten}</Typography.Text>
          <Tag>{NHAN_LOAI[k.type]}</Tag>
          {k.isLocked && <Tag color="error">Đã chốt sổ</Tag>}
        </Space>
      ),
    },
    {
      title: 'Từ ngày',
      dataIndex: 'startDate',
      width: 105,
      render: (v: string) => ngayLich(v),
    },
    {
      title: 'Đến ngày',
      dataIndex: 'endDate',
      width: 105,
      render: (v: string) => ngayLich(v),
    },
    {
      title: 'Lên KPI',
      dataIndex: 'assignDeadline',
      width: 105,
      render: (v: string | null) => ngayLich(v),
    },
    {
      title: 'Tự đánh giá',
      dataIndex: 'selfScoreDeadline',
      width: 110,
      render: (v: string | null) => ngayLich(v),
    },
    {
      title: 'TP chấm',
      dataIndex: 'managerScoreDeadline',
      width: 105,
      render: (v: string | null) => ngayLich(v),
    },
    {
      title: 'Gửi HCNS',
      dataIndex: 'submitDeadline',
      width: 105,
      render: (v: string | null) => ngayLich(v),
    },
    {
      title: 'Số phiếu',
      dataIndex: 'scorecardCount',
      width: 90,
      align: 'right',
    },
    {
      title: 'Nguồn',
      dataIndex: 'createdById',
      width: 130,
      render: (id: string | null, k) =>
        id ? (
          <Typography.Text type="secondary">
            {k.createdByName ?? 'Người tạo'}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary">Tự sinh</Typography.Text>
        ),
    },
    {
      title: '',
      width: 130,
      render: (_, k) => {
        if (!chotSoDuoc) return null;
        // CHỈ kỳ THÁNG khoá được: điểm quý là trung bình cộng ba tháng, và
        // khoá kỳ cha KHÔNG lan xuống kỳ con. Backend chặn, chỗ này ẩn nút
        // để không mời người dùng bấm một thứ không có tác dụng.
        if (k.type !== 'MONTH') return null;
        return k.isLocked ? (
          <Popconfirm
            title="Mở lại kỳ đã chốt sổ?"
            description="Điểm của kỳ này sẽ sửa được trở lại. Lần mở được ghi vào nhật ký kèm tên bạn."
            okText="Mở lại"
            cancelText="Huỷ"
            onConfirm={() => doiKhoa.mutate({ id: k.id, khoa: false })}
          >
            <Button size="small" icon={<UnlockOutlined />}>
              Mở lại
            </Button>
          </Popconfirm>
        ) : (
          <Popconfirm
            title={`Chốt sổ ${k.name}?`}
            description={`${k.scorecardCount} phiếu của kỳ này sẽ không sửa được nữa. Muốn sửa phải mở lại kỳ.`}
            okText="Chốt sổ"
            cancelText="Huỷ"
            onConfirm={() => doiKhoa.mutate({ id: k.id, khoa: true })}
          >
            <Button size="small" danger icon={<LockOutlined />}>
              Chốt sổ
            </Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <ThanhTab nhom="he-thong" />
      <TieuDeTrang
        tieuDe="Kỳ đánh giá"
        phai={
          taoDuoc && (
            <Button
              type="primary"
              shape="round"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => setMoTao(true)}
            >
              Tạo kỳ thủ công
            </Button>
          )
        }
      />

      <Card loading={isLoading}>
        <Table
          rowKey="id"
          size="middle"
          columns={cot}
          dataSource={cacKy}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        open={moTao}
        title="Tạo kỳ đánh giá thủ công"
        okText="Tạo kỳ"
        cancelText="Huỷ"
        confirmLoading={tao.isPending}
        onCancel={() => setMoTao(false)}
        onOk={() => form.submit()}
      >
        <Typography.Paragraph type="secondary">
          Chỉ dùng khi cần một kỳ mà tác vụ tự sinh không tạo — ví dụ kỳ của
          tháng đã qua. Ngày nhập dạng <b>YYYY-MM-DD</b>; bốn mốc chỉ điền cho
          kỳ THÁNG.
        </Typography.Paragraph>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ type: 'MONTH' }}
          onFinish={(v) =>
            tao.mutate(
              // Bỏ ô trống thay vì gửi chuỗi rỗng: backend từ chối chuỗi
              // không đúng dạng YYYY-MM-DD, kể cả chuỗi rỗng.
              Object.fromEntries(
                Object.entries(v).filter(
                  ([, x]) => x !== undefined && x !== '',
                ),
              ) as KyMoiInput,
            )
          }
        >
          <Form.Item name="code" label="Mã kỳ" rules={[{ required: true }]}>
            <Input placeholder="2026-07" />
          </Form.Item>
          <Form.Item name="name" label="Tên kỳ" rules={[{ required: true }]}>
            <Input placeholder="Tháng 07/2026" />
          </Form.Item>
          <Form.Item name="type" label="Loại kỳ" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'MONTH', label: 'Tháng' },
                { value: 'QUARTER', label: 'Quý' },
                { value: 'YEAR', label: 'Năm' },
              ]}
            />
          </Form.Item>
          <Space size="middle" style={{ display: 'flex' }}>
            <Form.Item
              name="startDate"
              label="Từ ngày"
              rules={[{ required: true }]}
            >
              <Input placeholder="2026-07-01" />
            </Form.Item>
            <Form.Item
              name="endDate"
              label="Đến ngày"
              rules={[{ required: true }]}
            >
              <Input placeholder="2026-07-31" />
            </Form.Item>
          </Space>
          <Form.Item noStyle shouldUpdate={(a, b) => a.type !== b.type}>
            {({ getFieldValue }) =>
              getFieldValue('type') === 'MONTH' && (
                <>
                  <Space size="middle" style={{ display: 'flex' }}>
                    <Form.Item name="assignDeadline" label="Hạn lên KPI">
                      <Input placeholder="2026-06-25" />
                    </Form.Item>
                    <Form.Item name="selfScoreDeadline" label="Hạn tự đánh giá">
                      <Input placeholder="2026-07-25" />
                    </Form.Item>
                  </Space>
                  <Space size="middle" style={{ display: 'flex' }}>
                    <Form.Item name="managerScoreDeadline" label="Hạn TP chấm">
                      <Input placeholder="2026-07-29" />
                    </Form.Item>
                    <Form.Item name="submitDeadline" label="Hạn gửi HCNS">
                      <Input placeholder="2026-07-30" />
                    </Form.Item>
                  </Space>
                </>
              )
            }
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
