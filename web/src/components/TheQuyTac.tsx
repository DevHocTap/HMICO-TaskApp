import { Button, Card, Tag, Typography } from 'antd';
import { FileTextOutlined, PercentageOutlined, TrophyOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useCaiDat, useTrongSo } from '../auth/useTrongSo';
import { MAX_SCALE } from '../types/kpi-template';

/**
 * Thẻ "Quy tắc chấm điểm" — số thật từ Cài đặt hệ thống, không phải văn bản
 * tải về (hệ thống chưa lưu file quy chế). Đổi ngưỡng ở Cài đặt là thẻ này
 * đổi theo.
 */
export function TheQuyTac() {
  const caiDat = useCaiDat();
  const trongSo = useTrongSo();
  // Mặc định trùng backend (`cai-dat-mac-dinh.ts`) để lúc chưa tải xong không hiện số lạ
  const n = caiDat?.nguongXepLoai ?? { canCaiThien: 80, hoanThanh: 90, vuot: 100 };
  const dong = [
    {
      icon: <TrophyOutlined />,
      ten: 'Thang xếp loại',
      phu: `Vượt > ${n.vuot} · Hoàn thành ${n.hoanThanh}–${n.vuot} · Cần cải thiện ${n.canCaiThien}–${(n.hoanThanh - 0.01).toFixed(2)} · Chưa đạt < ${n.canCaiThien}`,
      nhan: 'Cột trưởng BP',
    },
    {
      icon: <PercentageOutlined />,
      ten: `Trọng số hai mục ${trongSo.BSC_WORK}/${trongSo.COMPLIANCE}`,
      phu: `Mục 1 KPI công việc ${trongSo.BSC_WORK}% · Mục 2 chấp hành nội quy ${trongSo.COMPLIANCE}%`,
      nhan: 'Bắt buộc',
    },
    {
      icon: <FileTextOutlined />,
      ten: `Thang điểm ${MAX_SCALE.BSC_WORK} và ${MAX_SCALE.COMPLIANCE}`,
      phu: `KPI công việc chấm 0–${MAX_SCALE.BSC_WORK} (vượt tới ${MAX_SCALE.BSC_WORK * 1.2} kèm ghi chú), nội quy 0–${MAX_SCALE.COMPLIANCE}`,
      nhan: 'Ghi chú khi vượt',
    },
  ];
  return (
    <Card title={<span className="viec-tieu-de">Quy tắc &amp; thang điểm</span>}>
      <div className="quy-tac-danh-sach">
        {dong.map((d) => (
          <div key={d.ten} className="quy-tac-dong">
            <span className="quy-tac-icon">{d.icon}</span>
            <span className="ten-va-phu" style={{ flex: 1, minWidth: 0 }}>
              <Typography.Text strong>{d.ten}</Typography.Text>
              <small>{d.phu}</small>
            </span>
            <Tag className="tag-tron">{d.nhan}</Tag>
          </div>
        ))}
      </div>
      <Link to="/admin/kpi-templates">
        <Button block size="large" className="quy-tac-nut" icon={<FileTextOutlined />}>
          Xem mẫu KPI đang dùng
        </Button>
      </Link>
    </Card>
  );
}
