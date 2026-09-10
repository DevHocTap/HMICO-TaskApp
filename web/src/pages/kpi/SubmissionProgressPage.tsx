import { useMemo, useState } from 'react';
import { Alert, Card, Empty, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { layTienDoNop } from '../../api/report';
import { layKyDanhGia } from '../../api/scorecard';
import { layThongBaoLoi } from '../../api/client';
import {
  dungCayPhong,
  moiIdPhong,
  type DongTienDo,
  type DongTienDoCay,
} from '../../types/report';

/**
 * Số 0 hiện nhạt để mắt bám vào số khác 0.
 *
 * Bảng 14 dòng × 7 cột là 98 con số; phần lớn là 0. In đậm hết như nhau thì
 * mắt phải quét từng ô mới thấy chỗ cần xử lý.
 */
function so(giaTri: number, nhanManh = false) {
  if (giaTri === 0) return <Typography.Text type="secondary">0</Typography.Text>;
  return nhanManh ? (
    <Typography.Text strong type="warning">
      {giaTri}
    </Typography.Text>
  ) : (
    <Typography.Text>{giaTri}</Typography.Text>
  );
}

/**
 * Bảng theo dõi tiến độ nộp — thứ HCNS dùng hằng tháng.
 *
 * Đây là chỗ hệ thống hơn Excel rõ nhất: HCNS thấy phòng nào chưa nộp mà
 * không phải đi đòi từng phòng.
 *
 * Số liệu ĐÃ CỘNG DỒN Ở BACKEND. Giao diện chỉ dựng cây để hiện, không tự
 * cộng lại — hai chỗ cùng cộng một con số thì sẽ có lúc lệch.
 */
export function SubmissionProgressPage() {
  const [periodId, setPeriodId] = useState<string | undefined>();

  // CHỈ kỳ tháng: phiếu KPI không gắn vào kỳ quý hay kỳ năm, và backend trả
  // 400 nếu truyền lên. Lọc ngay ở ô chọn để người dùng không chọn được thứ
  // chắc chắn lỗi.
  const { data: cacKy = [] } = useQuery({
    queryKey: ['periods', 'MONTH'],
    queryFn: () => layKyDanhGia('MONTH'),
  });

  const kyDangXem = periodId ?? cacKy[0]?.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reports', 'submission-progress', kyDangXem],
    queryFn: () => layTienDoNop(kyDangXem!),
    enabled: Boolean(kyDangXem),
  });

  const cay = useMemo(
    () => (data ? dungCayPhong(data.departments) : []),
    [data],
  );
  const moHet = useMemo(
    () => (data ? moiIdPhong(data.departments) : []),
    [data],
  );

  const canXuLy = (d: DongTienDo) => d.chuaCoPhieu > 0 || d.chuaKyNhan > 0;

  const cot: ColumnsType<DongTienDoCay> = [
    {
      title: 'Phòng ban',
      dataIndex: 'departmentName',
      render: (ten: string, dong) => (
        <Space size={6}>
          <span>{ten}</span>
          {canXuLy(dong) && <Tag color="warning">cần xử lý</Tag>}
        </Space>
      ),
    },
    {
      title: 'Nhân sự',
      dataIndex: 'tongNhanSu',
      width: 90,
      align: 'right',
      render: (v: number) => so(v),
    },
    {
      title: 'Chưa có phiếu',
      dataIndex: 'chuaCoPhieu',
      width: 120,
      align: 'right',
      // Hai cột này là VIỆC PHẢI LÀM TRƯỚC HẠN, không phải việc đang chờ
      // người khác — nên tô đậm khi khác 0.
      render: (v: number) => so(v, true),
    },
    {
      title: 'Chưa ký nhận',
      dataIndex: 'chuaKyNhan',
      width: 120,
      align: 'right',
      render: (v: number) => so(v, true),
    },
    {
      title: 'Chờ tự chấm',
      dataIndex: 'choTuCham',
      width: 115,
      align: 'right',
      render: (v: number) => so(v),
    },
    {
      title: 'Chờ QL chấm',
      dataIndex: 'choTruongCham',
      width: 115,
      align: 'right',
      render: (v: number) => so(v),
    },
    {
      title: 'Chờ tiếp nhận',
      dataIndex: 'choTiepNhan',
      width: 120,
      align: 'right',
      render: (v: number) => so(v),
    },
    {
      title: 'Đã nộp',
      dataIndex: 'daNop',
      width: 95,
      align: 'right',
      render: (v: number) =>
        v === 0 ? <Typography.Text type="secondary">0</Typography.Text> : <Tag color="success">{v}</Tag>,
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space align="center" wrap style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Tiến độ nộp KPI
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
          message="Không đọc được báo cáo"
          description={layThongBaoLoi(error)}
        />
      )}

      <Card size="small">
        {!isLoading && cay.length === 0 ? (
          <Empty description="Chưa có phòng ban nào trong phạm vi của bạn" />
        ) : (
          <Table
            rowKey="departmentId"
            size="small"
            loading={isLoading}
            columns={cot}
            dataSource={cay}
            pagination={false}
            scroll={{ x: 'max-content' }}
            // Mở hết mọi nhánh: bảng này để LƯỚT QUA tìm chỗ cần xử lý, bắt
            // người dùng bấm mở từng phòng là làm hỏng đúng công dụng đó.
            expandable={{ defaultExpandedRowKeys: moHet }}
            rowClassName={(dong) => (canXuLy(dong) ? 'dong-can-xu-ly' : '')}
          />
        )}
      </Card>

      <Typography.Text type="secondary">
        Số của phòng cha đã bao gồm toàn bộ phòng con bên dưới.
      </Typography.Text>
    </Space>
  );
}
