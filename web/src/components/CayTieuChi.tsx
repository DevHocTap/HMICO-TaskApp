import { useMemo, useState } from 'react';
import { Button, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DongPhieuKpi } from '../types/scorecard';

/** Một dòng trong bảng cây: tiêu chí cấp 1 kèm `children`, hoặc KPI con. */
export interface DongCay extends DongPhieuKpi {
  children?: DongCay[];
}

/**
 * Cây từ danh sách phẳng: cha theo `displayOrder`, con xếp dưới cha theo
 * `displayOrder` của con. KHÔNG tin thứ tự backend trả: `displayOrder` của
 * cha và con là hai dãy riêng, trộn chung rồi sort là con đứng trước cha —
 * đúng lỗi từng thấy trên màn chi tiết phiếu (12/09/2026).
 */
export function dungCay(items: DongPhieuKpi[]): DongCay[] {
  const theoThuTu = (a: DongPhieuKpi, b: DongPhieuKpi) => a.displayOrder - b.displayOrder;
  return items
    .filter((i) => !i.parentId)
    .sort(theoThuTu)
    .map((cha) => {
      const con = items.filter((i) => i.parentId === cha.id).sort(theoThuTu);
      return { ...cha, children: con.length > 0 ? con : undefined };
    });
}

interface Props {
  items: DongPhieuKpi[];
  /** Mở sẵn mọi nhóm (mặc định gập, bấm vào tiêu chí lớn để xem KPI con). */
  moSan?: boolean;
}

/**
 * Bảng cây tiêu chí CHỈ ĐỌC — dùng ở màn chi tiết phiếu và "Phiếu KPI của
 * tôi". Cấp 1 là dòng đậm có nút gập/mở; KPI con chỉ hiện khi mở.
 *
 * Trọng số cấp 1 là TUYỆT ĐỐI (cộng lại thành 70 hoặc 30), cấp 2 là TƯƠNG
 * ĐỐI trong nhóm (cộng lại thành 100). Ghi rõ ở từng ô để không ai cộng
 * nhầm hai loại với nhau.
 */
export function CayTieuChi({ items, moSan = false }: Props) {
  const cay = useMemo(() => dungCay(items), [items]);
  const khoaCha = useMemo(() => cay.filter((c) => c.children).map((c) => c.id), [cay]);
  const [dangMo, setDangMo] = useState<string[]>(moSan ? khoaCha : []);

  const cot: ColumnsType<DongCay> = [
    {
      title: 'Tiêu chí',
      dataIndex: 'name',
      render: (ten: string, d) =>
        d.parentId ? (
          <span className="ten-va-phu">
            <span>{ten}</span>
            {d.description && <small>{d.description}</small>}
          </span>
        ) : (
          <span className="ten-va-phu">
            <Typography.Text strong>{ten}</Typography.Text>
            <small>
              {d.children ? `${d.children.length} KPI con` : 'Chấm trực tiếp'}
              {d.description ? ` · ${d.description}` : ''}
            </small>
          </span>
        ),
    },
    {
      title: 'Mục tiêu',
      dataIndex: 'measurementText',
      width: 150,
      render: (v: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Cách đo',
      dataIndex: 'measureMethod',
      width: 260,
      render: (v: string | null) => v ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: 'Trọng số',
      dataIndex: 'weight',
      width: 110,
      align: 'right',
      render: (w: string, d) =>
        d.parentId ? (
          <Typography.Text type="secondary">{Number(w)}% nhóm</Typography.Text>
        ) : (
          <Typography.Text strong>{Number(w)}%</Typography.Text>
        ),
    },
    { title: 'Thang', dataIndex: 'maxScale', width: 80, align: 'right' },
  ];

  const tatCaDangMo = khoaCha.length > 0 && dangMo.length === khoaCha.length;

  return (
    <div>
      {khoaCha.length > 0 && (
        <div style={{ textAlign: 'right', marginBottom: 8 }}>
          <Button type="link" size="small" onClick={() => setDangMo(tatCaDangMo ? [] : khoaCha)}>
            {tatCaDangMo ? 'Gập tất cả' : 'Mở tất cả'}
          </Button>
        </div>
      )}
      <Table<DongCay>
        rowKey="id"
        size="middle"
        pagination={false}
        scroll={{ x: 'max-content' }}
        columns={cot}
        dataSource={cay}
        rowClassName={(d) => (d.parentId ? 'dong-con' : 'dong-cha')}
        expandable={{
          expandedRowKeys: dangMo,
          onExpandedRowsChange: (keys) => setDangMo(keys as string[]),
          expandRowByClick: true,
          indentSize: 24,
        }}
      />
    </div>
  );
}
