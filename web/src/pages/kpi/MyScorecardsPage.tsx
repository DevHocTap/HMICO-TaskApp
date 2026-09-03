import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  kyNhanPhieu,
  layChiTietPhieu,
  layPhieuCuaToi,
  neuYKienPhieu,
} from '../../api/scorecard';
import { layThongBaoLoi } from '../../api/client';
import {
  MAU_TRANG_THAI_GIAO,
  NHAN_TRANG_THAI_GIAO,
  type DongPhieuKpi,
  type PhieuKpi,
} from '../../types/scorecard';
import { TEN_MUC } from '../../types/kpi-template';

const DINH_DANG_NGAY: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
};

/** Ngày giờ theo múi giờ Việt Nam — máy chủ có thể chạy UTC. */
function ngayVN(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', DINH_DANG_NGAY).format(new Date(iso));
}

export function MyScorecardsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [idDangXem, setIdDangXem] = useState<string | null>(null);
  const [moNeuYKien, setMoNeuYKien] = useState(false);
  const [lyDo, setLyDo] = useState('');

  const { data: danhSach = [], isLoading } = useQuery({
    queryKey: ['scorecards', 'my'],
    queryFn: () => layPhieuCuaToi(),
  });

  const { data: chiTiet, isFetching: dangTaiChiTiet } = useQuery({
    queryKey: ['scorecards', 'detail', idDangXem],
    queryFn: () => layChiTietPhieu(idDangXem!),
    enabled: Boolean(idDangXem),
  });

  function lamMoi() {
    void queryClient.invalidateQueries({ queryKey: ['scorecards'] });
  }

  const kyNhan = useMutation({
    mutationFn: (id: string) => kyNhanPhieu(id),
    onSuccess: () => {
      message.success('Đã ký nhận phiếu KPI');
      lamMoi();
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  const neuYKien = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      neuYKienPhieu(id, reason),
    onSuccess: () => {
      message.success('Đã gửi ý kiến cho người giao KPI');
      setMoNeuYKien(false);
      setLyDo('');
      lamMoi();
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  const cotDanhSach: ColumnsType<PhieuKpi> = [
    {
      title: 'Kỳ đánh giá',
      dataIndex: ['period', 'name'],
      render: (ten: string, dong) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => setIdDangXem(dong.id)}>
          {ten}
        </Button>
      ),
    },
    { title: 'Chức danh', dataIndex: 'jobTitleName' },
    { title: 'Phòng ban', dataIndex: 'departmentName' },
    {
      title: 'Trạng thái',
      dataIndex: 'assignStatus',
      render: (tt: PhieuKpi['assignStatus']) => (
        <Tag color={MAU_TRANG_THAI_GIAO[tt]}>{NHAN_TRANG_THAI_GIAO[tt]}</Tag>
      ),
    },
    {
      title: 'Ngày ký nhận',
      dataIndex: 'acceptedAt',
      render: (v: string | null) => ngayVN(v),
    },
  ];

  /**
   * Cây tiêu chí: cấp 1 in đậm, KPI con thụt vào.
   *
   * Trọng số cấp 1 là TUYỆT ĐỐI (cộng lại thành 100), còn cấp 2 là TƯƠNG ĐỐI
   * trong nhóm (cộng lại thành 100). Ghi rõ đơn vị ở nhãn cột để không ai
   * cộng nhầm hai loại với nhau.
   */
  const cotItem: ColumnsType<DongPhieuKpi> = [
    {
      title: 'Tiêu chí',
      dataIndex: 'name',
      render: (ten: string, dong) =>
        dong.parentId ? (
          <span style={{ paddingInlineStart: 20 }}>{ten}</span>
        ) : (
          <Typography.Text strong>{ten}</Typography.Text>
        ),
    },
    { title: 'Mục tiêu', dataIndex: 'measurementText', width: 160 },
    { title: 'Cách đo', dataIndex: 'measureMethod', width: 260 },
    {
      title: 'Trọng số',
      dataIndex: 'weight',
      width: 100,
      align: 'right',
      render: (w: string, dong) => `${Number(w)}${dong.parentId ? '% nhóm' : '%'}`,
    },
    { title: 'Thang điểm', dataIndex: 'maxScale', width: 100, align: 'right' },
  ];

  function dungCayItem(items: DongPhieuKpi[]): DongPhieuKpi[] {
    const cha = items.filter((i) => !i.parentId);
    const ra: DongPhieuKpi[] = [];
    for (const c of cha) {
      ra.push(c);
      ra.push(...items.filter((i) => i.parentId === c.id));
    }
    return ra;
  }

  const choKyNhan = chiTiet?.assignStatus === 'PROPOSED';

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        Phiếu KPI của tôi
      </Typography.Title>

      <Card loading={isLoading}>
        {danhSach.length === 0 && !isLoading ? (
          <Empty description="Bạn chưa được giao phiếu KPI nào" />
        ) : (
          <Table
            rowKey="id"
            size="middle"
            columns={cotDanhSach}
            dataSource={danhSach}
            pagination={false}
          />
        )}
      </Card>

      {idDangXem && (
        <Card
          loading={dangTaiChiTiet}
          title={`Phiếu KPI — ${chiTiet?.period.name ?? ''}`}
          extra={<Button onClick={() => setIdDangXem(null)}>Đóng</Button>}
        >
          {chiTiet && (
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              {choKyNhan && (
                <Alert
                  type="info"
                  showIcon
                  message="Phiếu này đang chờ bạn ký nhận"
                  description="Đọc kỹ trước khi ký. Nếu có chỗ chưa hợp lý, hãy nêu ý kiến kèm lý do để người giao KPI sửa lại."
                />
              )}
              {chiTiet.assignStatus === 'DISPUTED' && chiTiet.disputeReason && (
                <Alert
                  type="warning"
                  showIcon
                  message="Bạn đã nêu ý kiến, đang chờ người giao KPI xử lý"
                  description={chiTiet.disputeReason}
                />
              )}

              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="Chức danh">
                  {chiTiet.jobTitleName}
                </Descriptions.Item>
                <Descriptions.Item label="Phòng ban">
                  {chiTiet.departmentName}
                </Descriptions.Item>
                <Descriptions.Item label="Người chấm">
                  {chiTiet.evaluator?.fullName ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item label="Trạng thái">
                  <Tag color={MAU_TRANG_THAI_GIAO[chiTiet.assignStatus]}>
                    {NHAN_TRANG_THAI_GIAO[chiTiet.assignStatus]}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Gửi ký">
                  {ngayVN(chiTiet.proposedAt)}
                </Descriptions.Item>
                <Descriptions.Item label="Ký nhận">
                  {ngayVN(chiTiet.acceptedAt)}
                </Descriptions.Item>
              </Descriptions>

              {(['BSC_WORK', 'COMPLIANCE'] as const).map((muc) => {
                const cua = chiTiet.items.filter((i) => i.section === muc);
                if (cua.length === 0) return null;
                return (
                  <div key={muc}>
                    <Typography.Text strong>{TEN_MUC[muc]}</Typography.Text>
                    <Table
                      rowKey="id"
                      size="small"
                      style={{ marginTop: 8 }}
                      columns={cotItem}
                      dataSource={dungCayItem(cua)}
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                    />
                  </div>
                );
              })}

              {choKyNhan && (
                <Space>
                  <Button
                    type="primary"
                    loading={kyNhan.isPending}
                    onClick={() => kyNhan.mutate(chiTiet.id)}
                  >
                    Ký nhận
                  </Button>
                  <Button danger onClick={() => setMoNeuYKien(true)}>
                    Nêu ý kiến
                  </Button>
                </Space>
              )}
            </Space>
          )}
        </Card>
      )}

      <Modal
        open={moNeuYKien}
        title="Nêu ý kiến về phiếu KPI"
        okText="Gửi ý kiến"
        cancelText="Huỷ"
        confirmLoading={neuYKien.isPending}
        onCancel={() => setMoNeuYKien(false)}
        okButtonProps={{ disabled: lyDo.trim().length < 5 }}
        onOk={() =>
          idDangXem && neuYKien.mutate({ id: idDangXem, reason: lyDo.trim() })
        }
      >
        <Typography.Paragraph type="secondary">
          Nêu rõ chỗ chưa hợp lý để người giao KPI biết phải sửa gì. Phiếu sẽ quay
          lại cho họ chỉnh, không bị huỷ.
        </Typography.Paragraph>
        <Input.TextArea
          rows={4}
          maxLength={2000}
          showCount
          value={lyDo}
          onChange={(e) => setLyDo(e.target.value)}
          placeholder="Ví dụ: trọng số tiêu chí 2 quá cao so với khối lượng thực tế tháng này."
        />
      </Modal>
    </Space>
  );
}
