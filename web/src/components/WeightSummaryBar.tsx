import { Card, Space, Tag, Typography } from 'antd';
import { CheckCircleFilled, WarningFilled } from '@ant-design/icons';
import { hienSo, tongTrongSo } from '../utils/weight';
import { TEN_MUC, TONG_TRONG_SO, type EditorItem, type KpiSection } from '../types/kpi-template';

interface Props {
  items: EditorItem[];
  section: KpiSection;
}

/**
 * Thanh tổng trọng số, luôn hiện trên đầu màn soạn mẫu.
 *
 * Đây là thứ quan trọng nhất của màn hình này. Người dùng phải thấy mình
 * sai NGAY LÚC GÕ, không phải lúc bấm Xuất bản rồi phải dò lại 37 dòng để
 * tìm chỗ lệch.
 *
 * Cộng bằng số nguyên đơn vị (xem utils/weight.ts): cộng bằng số thực sẽ
 * báo đỏ cho một mẫu hoàn toàn đúng.
 */
export function WeightSummaryBar({ items, section }: Props) {
  const cap1 = items.filter((i) => i.parentKey === null && i.section === section);
  const tong = tongTrongSo(cap1.map((i) => i.weight));
  const can = TONG_TRONG_SO[section];
  const dung = tong === can;
  const lech = Math.round((tong - can) * 100) / 100;

  return (
    <Card
      size="small"
      style={{
        borderColor: dung ? '#52c41a' : '#faad14',
        background: dung ? '#f6ffed' : '#fffbe6',
      }}
    >
      <Space size="middle" wrap align="center">
        {dung ? (
          <CheckCircleFilled style={{ color: '#52c41a', fontSize: 20 }} />
        ) : (
          <WarningFilled style={{ color: '#faad14', fontSize: 20 }} />
        )}

        <Typography.Text strong style={{ fontSize: 16 }}>
          {TEN_MUC[section]}:{' '}
          <span style={{ color: dung ? '#52c41a' : '#d46b08' }}>
            {hienSo(tong)}/{can}
          </span>
        </Typography.Text>

        {!dung && (
          <Tag color="warning" style={{ fontSize: 14 }}>
            {lech < 0
              ? `còn thiếu ${hienSo(Math.abs(lech))}`
              : `đang thừa ${hienSo(lech)}`}
          </Tag>
        )}

        <Typography.Text type="secondary">
          {cap1.length} tiêu chí
        </Typography.Text>
      </Space>
    </Card>
  );
}
