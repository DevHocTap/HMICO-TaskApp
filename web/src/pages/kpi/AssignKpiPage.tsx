import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  chepTuKyTruoc,
  guiKyHangLoat,
  layBangGiaoKpi,
  layKyDanhGia,
  sinhMotPhieu,
  sinhPhieuHangLoat,
} from '../../api/scorecard';
import { layCayPhongBan } from '../../api/org';
import { layThongBaoLoi } from '../../api/client';
import {
  MAU_TRANG_THAI_GIAO,
  NHAN_TRANG_THAI_GIAO,
  type DongBangGiaoKpi,
  type KetQuaHangLoat,
} from '../../types/scorecard';
import type { DepartmentNode } from '../../types/org';
import { useAuth } from '../../auth/useAuth';

/** Cây phòng ban -> danh sách phẳng cho ô chọn, giữ thụt lề theo cấp. */
function lamPhang(nodes: DepartmentNode[], cap = 0): Array<{ value: string; label: string }> {
  return nodes.flatMap((n) => [
    { value: n.id, label: `${'  '.repeat(cap)}${n.name}` },
    ...lamPhang(n.children, cap + 1),
  ]);
}

function ngayVN(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso));
}

export function AssignKpiPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [idKy, setIdKy] = useState<string>();
  const [idPhong, setIdPhong] = useState<string>();
  const [dangChon, setDangChon] = useState<string[]>([]);
  const [ketQua, setKetQua] = useState<KetQuaHangLoat | null>(null);
  const [moChep, setMoChep] = useState(false);
  const [idKyNguon, setIdKyNguon] = useState<string>();

  const { data: cacKy = [] } = useQuery({
    queryKey: ['periods', 'MONTH'],
    queryFn: () => layKyDanhGia('MONTH'),
  });
  const { data: cayPhong = [] } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: layCayPhongBan,
  });

  // Mặc định chọn kỳ chứa hôm nay; không có thì lấy kỳ mới nhất.
  const kyMacDinh = useMemo(() => {
    const homNay = new Date().toISOString().slice(0, 10);
    return (
      cacKy.find((k) => k.startDate.slice(0, 10) <= homNay && homNay <= k.endDate.slice(0, 10))
        ?.id ?? cacKy[0]?.id
    );
  }, [cacKy]);
  const kyDangChon = idKy ?? kyMacDinh;
  const ky = cacKy.find((k) => k.id === kyDangChon);

  const luaChonPhong = useMemo(() => lamPhang(cayPhong), [cayPhong]);
  // MANAGER chỉ có một nhánh nên chọn sẵn; BGĐ để trống thì thấy trưởng bộ phận.
  const phongDangChon =
    idPhong ?? (user?.role === 'MANAGER' ? luaChonPhong[0]?.value : undefined);

  const { data: dong = [], isFetching } = useQuery({
    queryKey: ['scorecards', 'assignment-board', kyDangChon, phongDangChon],
    queryFn: () =>
      layBangGiaoKpi({ periodId: kyDangChon!, departmentId: phongDangChon }),
    enabled: Boolean(kyDangChon),
  });

  const chuaCoPhieu = dong.filter((d) => !d.scorecardId);
  const banNhap = dong.filter((d) => d.assignStatus === 'DRAFT');

  function xong(ten: string) {
    return (kq: KetQuaHangLoat) => {
      setKetQua(kq);
      setDangChon([]);
      message.success(`${ten}: ${kq.created} phiếu`);
      void queryClient.invalidateQueries({ queryKey: ['scorecards'] });
    };
  }
  const bao = (e: unknown) => message.error(layThongBaoLoi(e));

  const sinhHangLoat = useMutation({
    mutationFn: (userIds?: string[]) =>
      sinhPhieuHangLoat({
        departmentId: phongDangChon!,
        periodId: kyDangChon!,
        userIds,
      }),
    onSuccess: xong('Đã sinh'),
    onError: bao,
  });

  const chep = useMutation({
    mutationFn: () =>
      chepTuKyTruoc({
        departmentId: phongDangChon!,
        sourcePeriodId: idKyNguon!,
        targetPeriodId: kyDangChon!,
      }),
    onSuccess: (kq) => {
      setMoChep(false);
      xong('Đã chép')(kq);
    },
    onError: bao,
  });

  /**
   * Tạo phiếu cho MỘT người.
   *
   * Đây là đường DUY NHẤT dùng được trong hai ca mà nút hàng loạt bó tay:
   *
   * - **Ban giám đốc giao KPI cho trưởng bộ phận** (quy tắc nghiệp vụ mục
   *   5.0). `POST /scorecards/batch` không mở cho `EXECUTIVE` — họ chỉ gọi
   *   được đường một-người này.
   * - **Chức danh chưa có mẫu KPI.** Trưởng phòng và phó phòng không có
   *   mẫu; lô hàng loạt bỏ qua họ kèm câu "dùng đường sinh phiếu rỗng".
   *
   * Thử sinh TỪ MẪU trước. Backend từ chối vì chưa có mẫu thì mới hỏi người
   * dùng có muốn tạo phiếu trống để tự nhập không — không tự động lùi, vì
   * phiếu trống với phiếu theo mẫu là hai thứ khác nhau, người giao KPI phải
   * biết mình đang tạo cái nào.
   */
  const sinhMot = useMutation({
    mutationFn: ({ userId, phieuRong }: { userId: string; phieuRong: boolean }) =>
      sinhMotPhieu({ userId, periodId: kyDangChon!, emptyTemplate: phieuRong }),
    onSuccess: (phieu) => {
      message.success('Đã tạo phiếu. Mở ra để soạn nội dung KPI.');
      void queryClient.invalidateQueries({ queryKey: ['scorecards'] });
      navigate(`/kpi/scorecards/${phieu.id}`);
    },
    onError: (e, bien) => {
      const loi = layThongBaoLoi(e);
      if (bien.phieuRong || !loi.includes('chưa có mẫu KPI')) {
        message.error(loi);
        return;
      }
      Modal.confirm({
        title: 'Chức danh này chưa có mẫu KPI',
        content:
          'Tạo phiếu trống để bạn tự nhập tiêu chí? Phiếu sẽ có sẵn mục ' +
          '"Chấp hành nội quy", còn phần công việc để trống chờ bạn soạn.',
        okText: 'Tạo phiếu trống',
        cancelText: 'Huỷ',
        onOk: () => sinhMot.mutate({ userId: bien.userId, phieuRong: true }),
      });
    },
  });

  const guiKy = useMutation({
    mutationFn: () =>
      guiKyHangLoat({ departmentId: phongDangChon!, periodId: kyDangChon! }),
    onSuccess: xong('Đã gửi ký'),
    onError: bao,
  });

  const cot: ColumnsType<DongBangGiaoKpi> = [
    { title: 'Mã', dataIndex: 'employeeCode', width: 90 },
    {
      title: 'Họ tên',
      dataIndex: 'ownerName',
      render: (ten: string, d) => (
        <Space size={6}>
          {d.scorecardId ? (
            <Button
              type="link"
              style={{ padding: 0 }}
              onClick={() => navigate(`/kpi/scorecards/${d.scorecardId}`)}
            >
              {ten}
            </Button>
          ) : (
            <span>{ten}</span>
          )}
          {d.isDepartmentManager && <Tag color="blue">Trưởng bộ phận</Tag>}
        </Space>
      ),
    },
    { title: 'Chức danh', dataIndex: 'jobTitleName', render: (v) => v ?? '—' },
    { title: 'Phòng ban', dataIndex: 'departmentName' },
    {
      title: 'Trạng thái',
      dataIndex: 'assignStatus',
      width: 150,
      render: (tt: DongBangGiaoKpi['assignStatus']) =>
        tt ? (
          <Tag color={MAU_TRANG_THAI_GIAO[tt]}>{NHAN_TRANG_THAI_GIAO[tt]}</Tag>
        ) : (
          <Tag color="error">Chưa có phiếu</Tag>
        ),
    },
    {
      title: 'Tổng trọng số',
      dataIndex: 'totalWeight',
      width: 120,
      align: 'right',
      render: (w: string | null) => (w === null ? '—' : `${Number(w)}%`),
    },
    { title: 'Người chấm', dataIndex: 'evaluatorName', render: (v) => v ?? '—' },
    {
      title: 'Ngày ký nhận',
      dataIndex: 'acceptedAt',
      width: 120,
      render: (v: string | null) => ngayVN(v),
    },
    {
      title: '',
      width: 200,
      render: (_, d) =>
        d.scorecardId ? (
          <Space size="small">
            <Button
              size="small"
              onClick={() => navigate(`/kpi/scorecards/${d.scorecardId}`)}
            >
              Mở phiếu
            </Button>
            {/* Chỉ hiện khi đã ký nhận: chấm điểm phiếu chưa ký sẽ bị backend
                từ chối, bày nút ra chỉ để người dùng bấm vào rồi nhận lỗi. */}
            {d.assignStatus === 'ACCEPTED' && (
              <Button
                size="small"
                type="link"
                style={{ padding: 0 }}
                onClick={() => navigate(`/kpi/scorecards/${d.scorecardId}/scoring`)}
              >
                Chấm điểm
              </Button>
            )}
          </Space>
        ) : (
          <Button
            size="small"
            type="primary"
            ghost
            disabled={ky?.isLocked}
            loading={sinhMot.isPending && sinhMot.variables?.userId === d.userId}
            onClick={() => sinhMot.mutate({ userId: d.userId, phieuRong: false })}
          >
            Tạo phiếu
          </Button>
        ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space align="center" wrap style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Giao KPI
        </Typography.Title>
        <Space wrap>
          <Select
            style={{ width: 200 }}
            placeholder="Kỳ đánh giá"
            value={kyDangChon}
            onChange={(v) => {
              setIdKy(v);
              setDangChon([]);
              setKetQua(null);
            }}
            options={cacKy.map((k) => ({
              value: k.id,
              label: k.isLocked ? `${k.name} (đã khoá)` : k.name,
            }))}
          />
          <Select
            style={{ width: 260 }}
            placeholder={user?.role === 'EXECUTIVE' ? 'Trưởng bộ phận toàn công ty' : 'Phòng ban'}
            allowClear
            value={phongDangChon}
            onChange={(v) => {
              setIdPhong(v);
              setDangChon([]);
              setKetQua(null);
            }}
            options={luaChonPhong}
          />
        </Space>
      </Space>

      {ky?.isLocked && (
        <Alert
          type="warning"
          showIcon
          message={`Kỳ ${ky.name} đã khoá sổ`}
          description="Không sinh phiếu hay gửi ký được nữa. Cần sửa thì đề nghị HCNS hoặc ban giám đốc mở lại kỳ."
        />
      )}

      {!phongDangChon && user?.role === 'EXECUTIVE' && (
        <Alert
          type="info"
          showIcon
          message="Đang xem trưởng bộ phận toàn công ty"
          description={
            <>
              Đây là nhóm ban giám đốc chịu trách nhiệm giao KPI. Dùng nút{' '}
              <b>Tạo phiếu</b> trên từng dòng — các nút hàng loạt làm theo phòng
              nên không áp dụng cho nhóm này. Chọn một phòng ban ở trên để xem
              nhân viên của phòng đó.
            </>
          }
        />
      )}

      <Card>
        <Space wrap>
          <Button
            type="primary"
            disabled={!phongDangChon || ky?.isLocked || chuaCoPhieu.length === 0}
            loading={sinhHangLoat.isPending}
            onClick={() =>
              sinhHangLoat.mutate(dangChon.length > 0 ? dangChon : undefined)
            }
          >
            {dangChon.length > 0
              ? `Sinh phiếu cho ${dangChon.length} người đã chọn`
              : `Sinh phiếu cho ${chuaCoPhieu.length} người chưa có`}
          </Button>
          <Button
            disabled={!phongDangChon || ky?.isLocked}
            onClick={() => setMoChep(true)}
          >
            Chép từ kỳ trước
          </Button>
          <Button
            disabled={!phongDangChon || ky?.isLocked || banNhap.length === 0}
            loading={guiKy.isPending}
            onClick={() => guiKy.mutate()}
          >
            Gửi {banNhap.length} phiếu đi ký nhận
          </Button>
        </Space>
        {!phongDangChon && (
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
            Chọn một phòng ban để sinh phiếu — các thao tác hàng loạt làm theo phòng.
          </Typography.Paragraph>
        )}
      </Card>

      {ketQua && (
        <Alert
          type={ketQua.skipped > 0 ? 'warning' : 'success'}
          showIcon
          closable
          onClose={() => setKetQua(null)}
          message={`Tạo ${ketQua.created} phiếu, bỏ qua ${ketQua.skipped} người`}
          description={
            ketQua.skippedDetails.length > 0 && (
              <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
                {ketQua.skippedDetails.map((n) => (
                  <li key={n.userId}>
                    <b>{n.fullName}</b> — {n.reason}
                  </li>
                ))}
              </ul>
            )
          }
        />
      )}

      <Card loading={isFetching && dong.length === 0}>
        {dong.length === 0 && !isFetching ? (
          <Empty description="Không có nhân viên nào trong phạm vi này" />
        ) : (
          <Table
            rowKey="userId"
            size="middle"
            columns={cot}
            dataSource={dong}
            pagination={false}
            scroll={{ x: 'max-content' }}
            rowSelection={{
              selectedRowKeys: dangChon,
              onChange: (keys) => setDangChon(keys as string[]),
              // Chỉ chọn được người CHƯA có phiếu: nút hàng loạt là để sinh
              // phiếu, chọn người đã có phiếu chỉ tổ nhận lại lý do "Đã có phiếu".
              getCheckboxProps: (d) => ({ disabled: Boolean(d.scorecardId) }),
            }}
            rowClassName={(d) => (d.scorecardId ? '' : 'dong-chua-co-phieu')}
          />
        )}
      </Card>

      <Modal
        open={moChep}
        title="Chép phiếu KPI từ kỳ trước"
        okText="Chép"
        cancelText="Huỷ"
        confirmLoading={chep.isPending}
        okButtonProps={{ disabled: !idKyNguon }}
        onCancel={() => setMoChep(false)}
        onOk={() => chep.mutate()}
      >
        <Typography.Paragraph type="secondary">
          Chép nội dung KPI của phòng này từ một kỳ trước sang {ky?.name}. Phiếu mới
          ở trạng thái đang soạn, KHÔNG mang theo điểm hay chữ ký của kỳ cũ. Người
          đã có phiếu trong kỳ này sẽ bị bỏ qua.
        </Typography.Paragraph>
        <Select
          style={{ width: '100%' }}
          placeholder="Chọn kỳ nguồn"
          value={idKyNguon}
          onChange={setIdKyNguon}
          options={cacKy
            .filter((k) => k.id !== kyDangChon)
            .map((k) => ({ value: k.id, label: k.name }))}
        />
      </Modal>
    </Space>
  );
}
