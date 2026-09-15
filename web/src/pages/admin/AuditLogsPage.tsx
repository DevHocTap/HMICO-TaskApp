import { useState } from 'react';
import { ThanhTab } from '../../components/ThanhTab';
import {
  Alert,
  App,
  Button,
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
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery } from '@tanstack/react-query';
import { layNhatKy, taiExcelNhatKy } from '../../api/audit';
import { docLoiBlob } from '../../api/report';
import { layThongBaoLoi } from '../../api/client';
import { TieuDeTrang } from '../../components/TieuDeTrang';
import {
  NHAN_LOAI,
  type BoLocNhatKy,
  type DongNhatKy,
} from '../../types/audit';

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
  const { message } = App.useApp();
  const [loc, setLoc] = useState<BoLocNhatKy>({ page: 1, limit: 20 });

  const xuat = useMutation({
    mutationFn: () => taiExcelNhatKy(loc),
    onSuccess: (ten) => message.success(`Đã tải ${ten}`),
    onError: async (e) =>
      message.error((await docLoiBlob(e)) ?? layThongBaoLoi(e)),
  });

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
      width: 160,
      render: (v: string) => (
        <Typography.Text type="secondary">{gioVN(v)}</Typography.Text>
      ),
    },
    {
      title: 'Người thực hiện',
      dataIndex: 'actor',
      width: 200,
      render: (a: DongNhatKy['actor']) =>
        a ? (
          <Typography.Text strong>{a.fullName}</Typography.Text>
        ) : (
          // actorId null = thao tác của hệ thống, hoặc đăng nhập bằng email
          // không tồn tại nên chưa biết là ai.
          <Typography.Text type="secondary">Không xác định</Typography.Text>
        ),
    },
    {
      title: 'Thao tác',
      dataIndex: 'moTa',
      render: (moTa: string, dong) => (
        <Typography.Text
          type={dong.action === 'LOGIN_FAILED' ? 'danger' : undefined}
        >
          {moTa}
        </Typography.Text>
      ),
    },
    {
      title: 'Đối tượng',
      dataIndex: 'nhanDoiTuong',
      width: 140,
      align: 'right',
      render: (t: string, dong) => (
        <Tag
          className={`tag-tron${dong.entityType === 'Scorecard' || dong.entityType === 'Auth' ? ' tag-chua-co' : ''}`}
        >
          {t}
        </Tag>
      ),
    },
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

    return (
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Mã thao tác <code>{dong.action}</code> · Mã đối tượng{' '}
          <Typography.Text copyable style={{ fontSize: 12 }}>
            {dong.entityId}
          </Typography.Text>{' '}
          · IP {dong.ipAddress ?? '—'}
          {dong.actor && ` · ${dong.actor.employeeCode} · ${dong.actor.email}`}
        </Typography.Text>
        {dong.before === null && dong.after === null ? (
          <Typography.Text type="secondary">
            Thao tác này không ghi dữ liệu kèm theo.
          </Typography.Text>
        ) : (
          <Space align="start" wrap size="large">
            {khoi('Trước', dong.before)}
            {khoi('Sau', dong.after)}
          </Space>
        )}
      </Space>
    );
  }

  return (
    <div>
      <ThanhTab nhom="he-thong" />
      <TieuDeTrang
        tieuDe="Nhật ký thao tác"
        phai={
          <Button
            shape="round"
            size="large"
            icon={<DownloadOutlined />}
            loading={xuat.isPending}
            disabled={!data || data.total === 0}
            onClick={() => xuat.mutate()}
          >
            Xuất Excel
          </Button>
        }
      />

      <div className="chip-loc-hang">
        <Select
          allowClear
          className="chon-tron"
          size="large"
          placeholder="Đối tượng"
          style={{ width: 200 }}
          value={loc.entityType}
          onChange={(v) => doiLoc({ entityType: v })}
          options={loaiChon.map((t) => ({
            value: t,
            label: nhan(NHAN_LOAI, t),
          }))}
        />
        <Input
          allowClear
          className="o-tim-tron"
          size="large"
          placeholder="Mã thao tác, ví dụ MANAGER_SCORE"
          style={{ width: 280 }}
          value={loc.action}
          onChange={(e) =>
            doiLoc({ action: e.target.value.trim() || undefined })
          }
        />
        <DatePicker.RangePicker
          size="large"
          className="o-tim-tron"
          format="DD/MM/YYYY"
          onChange={(v) =>
            doiLoc({
              from: v?.[0]?.format('YYYY-MM-DD'),
              to: v?.[1]?.format('YYYY-MM-DD'),
            })
          }
        />
      </div>

      {isError && (
        <Alert
          type="error"
          showIcon
          message="Không đọc được nhật ký"
          description={String(error)}
        />
      )}

      <Card styles={{ body: { padding: 0 } }}>
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
            expandable={{
              expandedRowRender: chiTiet,
              expandRowByClick: true,
              showExpandColumn: false,
            }}
            rowClassName="dong-bam-duoc"
            pagination={{
              current: data?.page ?? 1,
              pageSize: data?.limit ?? 20,
              total: data?.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: ['20', '50', '100'],
              showTotal: (t) => `${t} bản ghi`,
              onChange: (page, limit) =>
                setLoc((truoc) => ({ ...truoc, page, limit })),
            }}
          />
        )}
      </Card>
    </div>
  );
}
