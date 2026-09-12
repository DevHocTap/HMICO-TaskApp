import { Card, Timeline, Typography } from 'antd';
import { NHAN_HANH_DONG, type SuKienPhieu } from '../types/scorecard';
import { ngayGioVN } from '../utils/format';

/**
 * Lịch sử phiếu — đọc từ `ScorecardEvent`, KHÔNG đọc `rejectedAt`/`rejectReason`
 * trên phiếu (hai cột đó chỉ là bản sao của lần gần nhất, xem no-ky-thuat.md).
 */
export function LichSuPhieu({ events }: { events: SuKienPhieu[] }) {
  if (events.length === 0) return null;
  return (
    <Card title="Lịch sử phiếu">
      <Timeline
        items={events.map((e) => ({
          color: e.action === 'CREATE' ? 'gray' : e.action === 'REJECT' ? 'red' : 'blue',
          children: (
            <div className="ten-va-phu">
              <Typography.Text strong>{NHAN_HANH_DONG[e.action] ?? e.action}</Typography.Text>
              <small>
                {e.actor?.fullName ?? 'Hệ thống'} · {ngayGioVN(e.createdAt)}
              </small>
              {e.comment && <Typography.Text>{e.comment}</Typography.Text>}
            </div>
          ),
        }))}
      />
    </Card>
  );
}
