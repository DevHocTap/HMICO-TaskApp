import { useState } from 'react';
import {
  Alert,
  Card,
  Col,
  Empty,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { laySoLieuDashboard } from '../../api/report';
import { layKyDanhGia } from '../../api/scorecard';
import { layThongBaoLoi } from '../../api/client';
import type { DiemTrungBinhPhong, XepLoaiKpi } from '../../types/report';
import { MAU_XEP_LOAI, NHAN_XEP_LOAI } from '../../types/scorecard';

const NHAN_TRANG_THAI: Record<string, string> = {
  PENDING: 'Chưa chấm',
  SELF_SCORED: 'Chờ QL chấm',
  REJECTED: 'Bị trả lại',
  MANAGER_SCORED: 'Đã chốt điểm',
  RECEIVED: 'HCNS đã nhận',
};

const THU_TU_XEP_LOAI: XepLoaiKpi[] = [
  'NOT_ACHIEVED',
  'NEEDS_IMPROVEMENT',
  'COMPLETED',
  'EXCEEDED',
];

/**
 * Dashboard tổng hợp một kỳ.
 *
 * KHÔNG dùng thư viện biểu đồ: `Statistic`, `Progress` và `Table` của Ant
 * Design đủ cho ba con số này, và thêm một thư viện nữa là thêm 200 kB vào
 * gói vốn đã 1,4 MB.
 *
 * Mọi chỗ hiện trung bình đều PHẢI kèm "tính trên N/M phiếu đã chốt". Một
 * con số trung bình trần trụi trên màn hình trông như sự thật của cả phòng,
 * kể cả khi nó tính từ đúng hai phiếu.
 */
export function DashboardPage() {
  const [periodId, setPeriodId] = useState<string | undefined>();

  const { data: cacKy = [] } = useQuery({
    queryKey: ['periods', 'MONTH'],
    queryFn: () => layKyDanhGia('MONTH'),
  });

  const kyDangXem = periodId ?? cacKy[0]?.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reports', 'dashboard', kyDangXem],
    queryFn: () => laySoLieuDashboard(kyDangXem!),
    enabled: Boolean(kyDangXem),
  });

  const tyLeChot =
    data && data.soPhieuTrongKy > 0
      ? Math.round((data.soPhieuDaChot / data.soPhieuTrongKy) * 100)
      : 0;

  const cot: ColumnsType<DiemTrungBinhPhong> = [
    { title: 'Phòng ban', dataIndex: 'departmentName' },
    {
      title: 'Phiếu đã chốt',
      dataIndex: 'soPhieuDaChot',
      width: 130,
      align: 'right',
    },
    {
      title: 'Điểm trung bình',
      dataIndex: 'diemTrungBinh',
      width: 160,
      align: 'right',
      render: (v: string | null, dong) =>
        v === null ? (
          <Typography.Text type="secondary">chưa có</Typography.Text>
        ) : (
          <Space size={4}>
            <Typography.Text strong>{v.replace('.', ',')}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              / {dong.soPhieuDaChot} phiếu
            </Typography.Text>
          </Space>
        ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space align="center" wrap style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Tổng hợp KPI
        </Typography.Title>
        <Select
          style={{ minWidth: 200 }}
          placeholder="Chọn kỳ"
          value={kyDangXem}
          onChange={setPeriodId}
          options={cacKy.map((k) => ({ value: k.id, label: k.name }))}
        />
      </Space>

      {isError && (
        <Alert
          type="error"
          showIcon
          message="Không đọc được số liệu"
          description={layThongBaoLoi(error)}
        />
      )}

      <Card size="small" loading={isLoading}>
        <Row gutter={[24, 16]}>
          <Col xs={12} md={6}>
            <Statistic title="Phiếu trong kỳ" value={data?.soPhieuTrongKy ?? 0} />
          </Col>
          <Col xs={12} md={6}>
            <Statistic
              title="Đã chốt điểm"
              value={data?.soPhieuDaChot ?? 0}
              suffix={`/ ${data?.soPhieuTrongKy ?? 0}`}
              valueStyle={{ color: '#1677ff' }}
            />
          </Col>
          <Col xs={24} md={12}>
            <Typography.Text type="secondary">Tiến độ chốt điểm</Typography.Text>
            <Progress percent={tyLeChot} status={tyLeChot === 100 ? 'success' : 'active'} />
          </Col>
        </Row>
      </Card>

      <Card size="small" title="Phiếu theo trạng thái" loading={isLoading}>
        <Space size="large" wrap>
          {Object.entries(data?.theoTrangThai ?? {}).map(([ma, so]) => (
            <Statistic
              key={ma}
              title={NHAN_TRANG_THAI[ma] ?? ma}
              value={so}
              valueStyle={so === 0 ? { color: 'rgba(0,0,0,0.35)' } : undefined}
            />
          ))}
        </Space>
      </Card>

      <Card
        size="small"
        title="Phân bố xếp loại"
        loading={isLoading}
        extra={
          <Typography.Text type="secondary">
            tính trên {data?.soPhieuDaChot ?? 0}/{data?.soPhieuTrongKy ?? 0} phiếu đã chốt
          </Typography.Text>
        }
      >
        {data && data.soPhieuDaChot === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa phiếu nào chốt điểm trong kỳ này"
          />
        ) : (
          <Space size="large" wrap>
            {THU_TU_XEP_LOAI.map((xl) => (
              <Statistic
                key={xl}
                title={<Tag color={MAU_XEP_LOAI[xl]}>{NHAN_XEP_LOAI[xl]}</Tag>}
                value={data?.phanBoXepLoai?.[xl] ?? 0}
              />
            ))}
          </Space>
        )}
      </Card>

      <Card
        size="small"
        title="Điểm trung bình theo phòng"
        loading={isLoading}
        extra={
          <Typography.Text type="secondary">
            tính trên {data?.soPhieuDaChot ?? 0}/{data?.soPhieuTrongKy ?? 0} phiếu đã chốt
          </Typography.Text>
        }
      >
        {data && data.diemTrungBinhTheoPhong.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa phòng nào có phiếu chốt điểm"
          />
        ) : (
          <Table
            rowKey="departmentId"
            size="small"
            columns={cot}
            dataSource={data?.diemTrungBinhTheoPhong ?? []}
            pagination={false}
          />
        )}
      </Card>

      <Typography.Text type="secondary">
        Điểm trung bình tính theo từng phòng, KHÔNG cộng dồn lên phòng cha —
        trung bình của các trung bình không phải trung bình chung.
      </Typography.Text>
    </Space>
  );
}
