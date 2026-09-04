import { Alert, Button, Card, Empty, Space, Tag, Typography } from 'antd';
import { ArrowRightOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { layViecCuaToi } from '../api/scorecard';
import type { ViecCanXuLy } from '../types/scorecard';
import { useAuth } from '../auth/useAuth';

/**
 * Nhãn thời hạn.
 *
 * `daysUntilDeadline` không bao giờ âm và `isOverdue` tách riêng, nên chỗ
 * này không phải đoán ý nghĩa của số âm. Xem `tinhTinhTrangHanNop()` ở
 * `src/modules/period/period-calendar.ts`.
 */
function nhanHan(viec: ViecCanXuLy) {
  if (viec.isOverdue) return <Tag color="error">Quá hạn</Tag>;
  if (viec.daysUntilDeadline === null) return null;
  if (viec.daysUntilDeadline <= 3)
    return <Tag color="warning">Còn {viec.daysUntilDeadline} ngày</Tag>;
  return <Tag>Còn {viec.daysUntilDeadline} ngày</Tag>;
}

export function HomePage() {
  const { user } = useAuth();
  const { data: viec = [], isLoading } = useQuery({
    queryKey: ['scorecards', 'pending-my-action'],
    queryFn: layViecCuaToi,
  });

  const quaHan = viec.filter((v) => v.isOverdue).length;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        Xin chào, {user?.fullName}
      </Typography.Title>

      {quaHan > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${quaHan} việc đã quá hạn`}
          description="Hạn lên KPI là ngày 25 của tháng trước. Làm sớm để nhân viên có KPI ngay từ đầu tháng."
        />
      )}

      <Card
        title="Việc của tôi"
        loading={isLoading}
        styles={{ body: viec.length === 0 ? undefined : { padding: 0 } }}
      >
        {viec.length === 0 ? (
          <Empty
            image={<CheckCircleOutlined style={{ fontSize: 40, color: '#52c41a' }} />}
            imageStyle={{ height: 48 }}
            description="Không có việc nào đang chờ bạn"
          />
        ) : (
          viec.map((v, i) => (
            <div
              key={v.type}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                padding: '14px 20px',
                borderTop: i === 0 ? undefined : '1px solid #f0f0f0',
              }}
            >
              <Space size={10} wrap>
                <Typography.Text strong style={{ fontSize: 15 }}>
                  {v.message}
                </Typography.Text>
                {nhanHan(v)}
              </Space>
              <Link to={v.link}>
                <Button type="primary" ghost icon={<ArrowRightOutlined />}>
                  Xử lý
                </Button>
              </Link>
            </div>
          ))
        )}
      </Card>

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Đây là toàn bộ hệ thống nhắc việc — không có thông báo qua email hay
        chuông đếm. Mở trang này là thấy đủ việc đang chờ mình.
      </Typography.Text>
    </Space>
  );
}
