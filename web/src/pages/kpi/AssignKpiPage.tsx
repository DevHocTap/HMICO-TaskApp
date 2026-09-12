import { useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Modal,
  Select,
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
  NHAN_TRANG_THAI_GIAO_NGUOI_GIAO,
  type DongBangGiaoKpi,
  type KetQuaHangLoat,
} from '../../types/scorecard';
import type { DepartmentNode } from '../../types/org';
import { useAuth } from '../../auth/useAuth';
import { TieuDeTrang } from '../../components/TieuDeTrang';
import { mauNhan } from '../../config/theme';
import { diemTomTat } from '../../utils/format';

/** Cây phòng ban -> danh sách phẳng cho ô chọn, giữ thụt lề theo cấp. */
function lamPhang(
  nodes: DepartmentNode[],
  cap = 0,
): Array<{ value: string; label: string }> {
  return nodes.flatMap((n) => [
    { value: n.id, label: `${'  '.repeat(cap)}${n.name}` },
    ...lamPhang(n.children, cap + 1),
  ]);
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
      cacKy.find(
        (k) =>
          k.startDate.slice(0, 10) <= homNay &&
          homNay <= k.endDate.slice(0, 10),
      )?.id ?? cacKy[0]?.id
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
    mutationFn: ({
      userId,
      phieuRong,
    }: {
      userId: string;
      phieuRong: boolean;
    }) =>
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
    {
      title: 'Mã',
      dataIndex: 'employeeCode',
      width: 90,
      render: (v: string) => (
        <Typography.Text type="secondary">{v}</Typography.Text>
      ),
    },
    {
      title: 'Họ tên',
      dataIndex: 'ownerName',
      render: (ten: string, d) => (
        <span className="ten-va-phu">
          <span>
            {d.scorecardId ? (
              <Button
                type="link"
                style={{ padding: 0, height: 'auto', fontWeight: 700 }}
                onClick={() => navigate(`/kpi/scorecards/${d.scorecardId}`)}
              >
                {ten}
              </Button>
            ) : (
              <Typography.Text strong>{ten}</Typography.Text>
            )}
          </span>
          {/* Phòng ban là dòng phụ: cùng phòng thì lặp, còn BGĐ xem trưởng bộ
              phận toàn công ty thì đây là chỗ duy nhất phân biệt họ */}
          <small>
            {d.isDepartmentManager ? 'Trưởng bộ phận' : d.departmentName}
          </small>
        </span>
      ),
    },
    { title: 'Chức danh', dataIndex: 'jobTitleName', render: (v) => v ?? '—' },
    {
      title: 'Trạng thái',
      dataIndex: 'assignStatus',
      width: 150,
      render: (tt: DongBangGiaoKpi['assignStatus']) =>
        tt ? (
          <Tag color={MAU_TRANG_THAI_GIAO[tt]} className="tag-tron">
            {NHAN_TRANG_THAI_GIAO_NGUOI_GIAO[tt]}
          </Tag>
        ) : (
          <Tag color="gold" className="tag-tron">
            Chưa có phiếu
          </Tag>
        ),
    },
    {
      title: 'Chấm điểm',
      key: 'chamDiem',
      width: 210,
      // Ai đã được chấm, ai chưa — phản hồi 12/09: bảng chỉ có trạng thái ký nhận
      // nên người chấm không phân biệt được phiếu nào còn phải làm.
      render: (_: unknown, d) => {
        if (
          !d.scorecardId ||
          d.assignStatus !== 'ACCEPTED' ||
          !d.resultStatus
        ) {
          return <Typography.Text type="secondary">—</Typography.Text>;
        }
        const laToiCham = d.evaluatorId === user?.id;
        const diem = (v: string | null) => (v === null ? '—' : diemTomTat(v));
        switch (d.resultStatus) {
          case 'PENDING':
            return <Tag>Chưa tự chấm</Tag>;
          case 'REJECTED':
            return <Tag color="error">Bị trả lại · chờ chấm lại</Tag>;
          case 'SELF_SCORED':
            return (
              <span className="ten-va-phu">
                <Tag color="gold" style={{ width: 'fit-content' }}>
                  {laToiCham ? 'Chờ bạn chấm' : 'Chờ trưởng BP chấm'}
                </Tag>
                <small>Tự chấm {diem(d.selfTotalScore)}</small>
              </span>
            );
          case 'MANAGER_SCORED':
            return (
              <span className="ten-va-phu">
                <Tag color="success" style={{ width: 'fit-content' }}>
                  Đã chốt {diem(d.managerTotalScore)}
                </Tag>
                <small>Tự chấm {diem(d.selfTotalScore)} · chờ HCNS</small>
              </span>
            );
          default:
            return (
              <span className="ten-va-phu">
                <Tag color="green" style={{ width: 'fit-content' }}>
                  HCNS đã nhận · {diem(d.managerTotalScore)}
                </Tag>
                <small>Tự chấm {diem(d.selfTotalScore)}</small>
              </span>
            );
        }
      },
    },
    {
      title: 'Trọng số',
      dataIndex: 'totalWeight',
      width: 100,
      align: 'right',
      // Dưới 100% tô hồng: phiếu chưa gửi ký được, người giao cần nhìn thấy ngay
      render: (w: string | null) =>
        w === null ? (
          '—'
        ) : (
          <Typography.Text
            strong
            style={{ color: Number(w) < 100 ? mauNhan : undefined }}
          >
            {Number(w)}%
          </Typography.Text>
        ),
    },
    {
      title: 'Người chấm',
      dataIndex: 'evaluatorName',
      ellipsis: true,
      render: (v) => v ?? '—',
    },
    {
      title: '',
      width: 130,
      align: 'right',
      render: (_, d) =>
        d.scorecardId ? (
          // Đã ký nhận thì mở thẳng màn chấm — chấm điểm phiếu chưa ký sẽ bị
          // backend từ chối, nên chỉ mở màn soạn.
          <Button
            shape="round"
            type={
              d.resultStatus === 'SELF_SCORED' && d.evaluatorId === user?.id
                ? 'primary'
                : 'default'
            }
            onClick={() =>
              navigate(
                d.assignStatus === 'ACCEPTED'
                  ? `/kpi/scorecards/${d.scorecardId}/scoring`
                  : `/kpi/scorecards/${d.scorecardId}`,
              )
            }
          >
            {d.assignStatus !== 'ACCEPTED'
              ? 'Mở phiếu'
              : d.resultStatus === 'SELF_SCORED' && d.evaluatorId === user?.id
                ? 'Chấm điểm'
                : d.resultStatus === 'MANAGER_SCORED' ||
                    d.resultStatus === 'RECEIVED'
                  ? 'Xem điểm'
                  : 'Mở phiếu'}
          </Button>
        ) : (
          <Button
            shape="round"
            disabled={ky?.isLocked}
            loading={
              sinhMot.isPending && sinhMot.variables?.userId === d.userId
            }
            onClick={() =>
              sinhMot.mutate({ userId: d.userId, phieuRong: false })
            }
          >
            Tạo phiếu
          </Button>
        ),
    },
  ];

  const xemTruongBoPhan = !phongDangChon && user?.role === 'EXECUTIVE';

  return (
    <div>
      <TieuDeTrang
        tieuDe="Giao KPI"
        moTa="Mỗi nhân viên một dòng — kể cả người chưa có phiếu. Thao tác hàng loạt làm theo phòng."
        phai={
          <>
            <Select
              className="chon-tron"
              size="large"
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
              className="chon-tron"
              size="large"
              style={{ width: 260 }}
              placeholder={
                user?.role === 'EXECUTIVE'
                  ? 'Trưởng bộ phận toàn công ty'
                  : 'Phòng ban'
              }
              allowClear
              value={phongDangChon}
              onChange={(v) => {
                setIdPhong(v);
                setDangChon([]);
                setKetQua(null);
              }}
              options={luaChonPhong}
            />
          </>
        }
      />

      {ky?.isLocked && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Kỳ ${ky.name} đã khoá sổ`}
          description="Không sinh phiếu hay gửi ký được nữa. Cần sửa thì đề nghị HCNS hoặc ban giám đốc mở lại kỳ."
        />
      )}

      <div className="giao-kpi-thanh">
        <Typography.Text strong>
          {xemTruongBoPhan
            ? 'Trưởng bộ phận toàn công ty — dùng nút "Tạo phiếu" trên từng dòng, các nút hàng loạt làm theo phòng.'
            : !phongDangChon
              ? 'Chọn một phòng ban để dùng các thao tác hàng loạt.'
              : chuaCoPhieu.length > 0
                ? `${chuaCoPhieu.length} người chưa có phiếu trong kỳ`
                : 'Mọi người trong phòng đã có phiếu'}
        </Typography.Text>
        <div className="giao-kpi-thanh-nut">
          <Button
            shape="round"
            size="large"
            disabled={!phongDangChon || ky?.isLocked}
            onClick={() => setMoChep(true)}
          >
            Chép từ kỳ trước
          </Button>
          <Button
            shape="round"
            size="large"
            disabled={
              !phongDangChon || ky?.isLocked || chuaCoPhieu.length === 0
            }
            loading={sinhHangLoat.isPending}
            onClick={() =>
              sinhHangLoat.mutate(dangChon.length > 0 ? dangChon : undefined)
            }
          >
            {dangChon.length > 0
              ? `Sinh phiếu cho ${dangChon.length} người đã chọn`
              : 'Sinh phiếu từ mẫu chức danh'}
          </Button>
          <Button
            type="primary"
            shape="round"
            size="large"
            disabled={!phongDangChon || ky?.isLocked || banNhap.length === 0}
            loading={guiKy.isPending}
            onClick={() => guiKy.mutate()}
          >
            Gửi {banNhap.length} phiếu đi ký nhận
          </Button>
        </div>
      </div>

      {ketQua && (
        <Alert
          type={ketQua.skipped > 0 ? 'warning' : 'success'}
          showIcon
          closable
          style={{ marginBottom: 16 }}
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

      <Card
        loading={isFetching && dong.length === 0}
        styles={{ body: { padding: 0 } }}
      >
        {dong.length === 0 && !isFetching ? (
          <Empty
            style={{ padding: 32 }}
            description="Không có nhân viên nào trong phạm vi này"
          />
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
      <Typography.Text
        type="secondary"
        style={{ display: 'block', marginTop: 12, fontSize: 13 }}
      >
        Phiếu chỉ gửi đi ký nhận được khi tổng trọng số đủ 70% mục BSC và 30%
        mục chấp hành nội quy.
      </Typography.Text>

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
          Chép nội dung KPI của phòng này từ một kỳ trước sang {ky?.name}. Phiếu
          mới ở trạng thái đang soạn, KHÔNG mang theo điểm hay chữ ký của kỳ cũ.
          Người đã có phiếu trong kỳ này sẽ bị bỏ qua.
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
    </div>
  );
}
