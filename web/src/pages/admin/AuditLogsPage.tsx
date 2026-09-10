import { useState } from 'react';
import {
  Alert,
  Card,
  DatePicker,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { layNhatKy } from '../../api/audit';
import {
  NHAN_LOAI,
  NHAN_THAO_TAC,
  type BoLocNhatKy,
  type DongNhatKy,
} from '../../types/audit';
import { useAuth } from '../../auth/useAuth';

const DINH_DANG_GIO: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh',
};

/** Máy chủ có thể chạy UTC — luôn quy về giờ Việt Nam khi hiện. */
function gioVN(iso: string): string {
  return new Intl.DateTimeFormat('vi-VN', DINH_DANG_GIO).format(new Date(iso));
}

const nhan = (bang: Record<string, string>, ma: string) => bang[ma] ?? ma;

/**
 * Nhật ký thao tác — màn CHỈ ĐỌC.
 *
 * ADMIN thấy mọi loại; ban giám đốc chỉ thấy phiếu KPI (ai sửa điểm, ai
 * nộp, ai duyệt). Giới hạn đó do BACKEND áp, không phải do màn hình ẩn bớt:
 * `entityTypes` trong kết quả trả về chính là danh sách backend cho phép,
 * màn hình chỉ dựng ô lọc theo đó.
 *
 * `before` / `after` render trong `<pre>`, KHÔNG dùng `dangerouslySetInnerHTML`.
 * Nội dung trong đó là dữ liệu người dùng nhập (tên KPI, lý do trả lại), và
 * refresh token đang nằm ở localStorage nên một lỗ XSS là mất phiên 7 ngày.
 */
export function AuditLogsPage() {
  const { user } = useAuth();
  const [loc, setLoc] = useState<BoLocNhatKy>({ page: 1, limit: 20 });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit-logs', loc],
    queryFn: () => layNhatKy(loc),
  });

  function doiLoc(thayDoi: Partial<BoLocNhatKy>) {
    // Đổi bộ lọc thì về trang 1: giữ nguyên trang 5 khi kết quả chỉ còn 2
    // trang sẽ ra bảng rỗng, và người dùng tưởng không có dữ liệu.
    setLoc((truoc) => ({ ...truoc, ...thayDoi, page: 1 }));
  }

  const loaiChon = data?.entityTypes ?? Object.keys(NHAN_LOAI);

  const cot: ColumnsType<DongNhatKy> = [
    {
      title: 'Thời điểm',
      dataIndex: 'createdAt',
      width: 175,
      render: (v: string) => gioVN(v),
    },
    {
      title: 'Người thực hiện',
      dataIndex: 'actor',
      width: 220,
      render: (a: DongNhatKy['actor']) =>
        a ? (
          <div>
            <div>{a.fullName}</div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {a.employeeCode}
            </Typography.Text>
          </div>
        ) : (
          // actorId null = thao tác của hệ thống, hoặc đăng nhập bằng email
          // không tồn tại nên chưa biết là ai.
          <Typography.Text type="secondary">Không xác định</Typography.Text>
        ),
    },
    {
      title: 'Thao tác',
      dataIndex: 'action',
      width: 200,
      render: (a: string) => (
        <Tag color={a === 'LOGIN_FAILED' ? 'error' : a === 'LOGIN' ? 'default' : 'blue'}>
          {nhan(NHAN_THAO_TAC, a)}
        </Tag>
      ),
    },
    {
      title: 'Đối tượng',
      dataIndex: 'entityType',
      width: 170,
      render: (t: string, dong) => (
        <div>
          <div>{nhan(NHAN_LOAI, t)}</div>
          <Typography.Text type="secondary" style={{ fontSize: 11 }} copyable>
            {dong.entityId}
          </Typography.Text>
        </div>
      ),
    },
    { title: 'Địa chỉ IP', dataIndex: 'ipAddress', width: 130, render: (v) => v ?? '—' },
  ];

  /** Chi tiết trước/sau, mở ra khi bấm vào dòng. */
  function chiTiet(dong: DongNhatKy) {
    const khoi = (tieuDe: string, giaTri: unknown) =>
      giaTri === null || giaTri === undefined ? null : (
        <div style={{ minWidth: 260 }}>
          <Typography.Text strong>{tieuDe}</Typography.Text>
          <pre
            style={{
              margin: '4px 0 0',
              padding: 8,
              background: 'rgba(0,0,0,0.03)',
              borderRadius: 4,
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {JSON.stringify(giaTri, null, 2)}
          </pre>
        </div>
      );

    if (dong.before === null && dong.after === null) {
      return <Typography.Text type="secondary">Thao tác này không ghi dữ liệu kèm theo.</Typography.Text>;
    }
    return (
      <Space align="start" wrap size="large">
        {khoi('Trước', dong.before)}
        {khoi('Sau', dong.after)}
      </Space>
    );
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        Nhật ký thao tác
      </Typography.Title>

      {user?.role === 'EXECUTIVE' && (
        <Alert
          type="info"
          showIcon
          message="Ban giám đốc xem nhật ký phiếu KPI"
          description="Ai chấm điểm, ai nộp, ai duyệt và ai trả lại phiếu. Nhật ký nhân sự và đăng nhập không nằm trong phạm vi này."
        />
      )}

      <Card size="small">
        <Space wrap>
          <Select
            allowClear
            placeholder="Đối tượng"
            style={{ width: 200 }}
            value={loc.entityType}
            onChange={(v) => doiLoc({ entityType: v })}
            options={loaiChon.map((t) => ({ value: t, label: nhan(NHAN_LOAI, t) }))}
          />
          <Input
            allowClear
            placeholder="Mã thao tác, ví dụ MANAGER_SCORE"
            style={{ width: 240 }}
            value={loc.action}
            onChange={(e) => doiLoc({ action: e.target.value.trim() || undefined })}
          />
          <DatePicker.RangePicker
            format="DD/MM/YYYY"
            onChange={(v) =>
              doiLoc({
                from: v?.[0]?.format('YYYY-MM-DD'),
                to: v?.[1]?.format('YYYY-MM-DD'),
              })
            }
          />
        </Space>
      </Card>

      {isError && (
        <Alert type="error" showIcon message="Không đọc được nhật ký" description={String(error)} />
      )}

      <Card size="small">
        {!isLoading && data?.data.length === 0 ? (
          <Empty description="Không có bản ghi nào khớp bộ lọc" />
        ) : (
          <Table
            rowKey="id"
            size="small"
            loading={isLoading}
            columns={cot}
            dataSource={data?.data ?? []}
            scroll={{ x: 'max-content' }}
            expandable={{ expandedRowRender: chiTiet }}
            pagination={{
              current: data?.page ?? 1,
              pageSize: data?.limit ?? 20,
              total: data?.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: ['20', '50', '100'],
              showTotal: (t) => `${t} bản ghi`,
              onChange: (page, limit) => setLoc((truoc) => ({ ...truoc, page, limit })),
            }}
          />
        )}
      </Card>
    </Space>
  );
}
