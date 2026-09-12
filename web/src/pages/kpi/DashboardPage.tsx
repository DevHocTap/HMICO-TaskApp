import { useState } from 'react';
import {
  App,
  Avatar,
  Button,
  Card,
  Empty,
  Select,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ClockCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  LockOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  docLoiBlob,
  laySoLieuDashboard,
  layTienDoNop,
  taiExcelTongHop,
} from '../../api/report';
import { khoaKy, layDanhSachPhieu, layKyDanhGia } from '../../api/scorecard';
import { layCayPhongBan } from '../../api/org';
import { layThongBaoLoi } from '../../api/client';
import type { XepLoaiKpi } from '../../types/report';
import type { PhieuTomTat, ResultStatus, XepLoai } from '../../types/scorecard';
import {
  MAU_TRANG_THAI_CHAM,
  NHAN_TRANG_THAI_CHAM,
  NHAN_XEP_LOAI,
} from '../../types/scorecard';
import type { DepartmentNode } from '../../types/org';
import { TieuDeTrang } from '../../components/TieuDeTrang';
import { ThanhTab } from '../../components/ThanhTab';
import { TheSoLieu } from '../../components/TheSoLieu';
import {
  MAU_XEP_LOAI_BD,
  THU_TU_XEP_LOAI,
  TheHieuSuatPhong,
  TheXepLoai,
} from '../../components/TheBaoCao';
import { useAuth } from '../../auth/useAuth';
import { coTheChotSo } from '../../auth/permissions';
import {
  chuVietTat,
  giaiDoanCuaKy,
  kyChuaHomNay,
  ngayTrongThang,
} from '../../utils/period';
import { diemTomTat, ngayVN, phanTram } from '../../utils/format';
import { mauChuDao, mauNhan } from '../../config/theme';

const SO_DONG = 10;

/** Chip lọc phòng: các phòng cấp cao nhất trong phạm vi + phòng con của chúng, làm phẳng. */
function lamPhang(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((n) => [n, ...lamPhang(n.children)]);
}

/**
 * Báo cáo kỳ — màn chốt sổ của HCNS (bộ mẫu 12/09): tiến độ thẩm định, trễ
 * hạn, bị trả lại, hạn chốt sổ; bốn thẻ hạng có điểm TB; phân bố xếp loại và
 * hiệu suất phòng (dùng chung Tổng quan); bảng nhân sự lọc theo phòng / xếp
 * loại / trạng thái; nút Xuất .xlsx và Khoá sổ.
 *
 * KHÔNG có quỹ thưởng, bell curve, PIP — hệ thống không có các khái niệm đó.
 */
export function DashboardPage() {
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [periodId, setPeriodId] = useState<string | undefined>();
  const [locPhong, setLocPhong] = useState<string | undefined>();
  const [locXepLoai, setLocXepLoai] = useState<XepLoai | undefined>();
  const [locTrangThai, setLocTrangThai] = useState<ResultStatus | undefined>();
  const [trang, setTrang] = useState(1);

  const { data: cacKy = [] } = useQuery({
    queryKey: ['periods', 'MONTH'],
    queryFn: () => layKyDanhGia('MONTH'),
  });
  const kyDangXem = periodId ?? kyChuaHomNay(cacKy)?.id ?? cacKy[0]?.id;
  const ky = cacKy.find((k) => k.id === kyDangXem);

  const { data } = useQuery({
    queryKey: ['reports', 'dashboard', kyDangXem],
    queryFn: () => laySoLieuDashboard(kyDangXem!),
    enabled: Boolean(kyDangXem),
  });
  const { data: tienDo } = useQuery({
    queryKey: ['reports', 'submission-progress', kyDangXem],
    queryFn: () => layTienDoNop(kyDangXem!),
    enabled: Boolean(kyDangXem),
  });
  const { data: cayPhong = [] } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: layCayPhongBan,
  });
  const { data: phieu, isFetching: dangTaiPhieu } = useQuery({
    queryKey: [
      'scorecards',
      'bao-cao',
      kyDangXem,
      locPhong,
      locXepLoai,
      locTrangThai,
      trang,
    ],
    queryFn: () =>
      layDanhSachPhieu({
        periodId: kyDangXem!,
        departmentId: locPhong,
        grade: locXepLoai,
        resultStatus: locTrangThai,
        page: trang,
        limit: SO_DONG,
      }),
    enabled: Boolean(kyDangXem),
  });

  const xuat = useMutation({
    mutationFn: () => taiExcelTongHop(kyDangXem!),
    onSuccess: (ten) => message.success(`Đã tải ${ten}`),
    onError: async (e) =>
      message.error((await docLoiBlob(e)) ?? layThongBaoLoi(e)),
  });
  const khoa = useMutation({
    mutationFn: () => khoaKy(kyDangXem!),
    onSuccess: () => {
      message.success('Đã khoá sổ kỳ');
      void queryClient.invalidateQueries({ queryKey: ['periods'] });
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  if (!ky) return null;

  const homNay = dayjs();
  const giaiDoan = giaiDoanCuaKy(ky, homNay);
  const tt = data?.theoTrangThai;
  const tong = data?.soPhieuTrongKy ?? 0;
  const daChot = data?.soPhieuDaChot ?? 0;
  const quaTuCham = ky.selfScoreDeadline
    ? homNay.isAfter(dayjs(ky.selfScoreDeadline), 'day')
    : false;
  const treTuCham = quaTuCham && tt ? tt.PENDING : 0;
  // Phòng còn người chưa tự chấm — chỉ phòng lá (không cộng dồn) để nêu đúng tên
  const phongTre = quaTuCham
    ? (tienDo?.departments ?? [])
        .filter(
          (d) =>
            d.choTuCham > 0 &&
            !(tienDo?.departments ?? []).some(
              (c) => c.parentId === d.departmentId,
            ),
        )
        .map((d) => d.departmentName)
    : [];
  const biTraLai = tt?.REJECTED ?? 0;
  const conToiChotSo = ky.submitDeadline
    ? dayjs(ky.submitDeadline).startOf('day').diff(homNay.startOf('day'), 'day')
    : null;

  const cotPhieu: ColumnsType<PhieuTomTat> = [
    {
      title: 'Mã NV & họ tên',
      dataIndex: 'ownerName',
      render: (ten: string | null, r) => (
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Avatar
            size={34}
            style={{ background: '#dbe6ff', color: mauChuDao, fontWeight: 700 }}
          >
            {chuVietTat(ten ?? '?')}
          </Avatar>
          <span className="ten-va-phu">
            <Typography.Text strong>{ten ?? '—'}</Typography.Text>
            <small>{r.employeeCode ?? '—'}</small>
          </span>
        </span>
      ),
    },
    { title: 'Phòng ban', dataIndex: 'departmentName' },
    {
      title: 'NV chấm',
      dataIndex: 'selfTotalScore',
      align: 'right',
      width: 100,
      render: (v: string | null) =>
        v === null ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          diemTomTat(v)
        ),
    },
    {
      title: 'QL chốt',
      dataIndex: 'managerTotalScore',
      align: 'right',
      width: 100,
      render: (v: string | null, r) =>
        v === null ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          <Typography.Text
            strong
            style={{ color: r.grade === 'NOT_ACHIEVED' ? mauNhan : mauChuDao }}
          >
            {diemTomTat(v)}
          </Typography.Text>
        ),
    },
    {
      title: 'Xếp loại',
      dataIndex: 'grade',
      width: 150,
      render: (g: XepLoai | null) =>
        g ? (
          <Tag
            style={{
              background: `${MAU_XEP_LOAI_BD[g]}22`,
              color: MAU_XEP_LOAI_BD[g],
              border: 0,
              fontWeight: 700,
            }}
          >
            {NHAN_XEP_LOAI[g]}
          </Tag>
        ) : (
          <Tag>Chưa xếp</Tag>
        ),
    },
    {
      title: 'Trạng thái hồ sơ',
      dataIndex: 'resultStatus',
      width: 210,
      render: (rs: ResultStatus, r) => {
        const tre =
          rs === 'PENDING' && quaTuCham && r.assignStatus === 'ACCEPTED';
        if (tre)
          return (
            <Tag color="error" icon={<ClockCircleOutlined />}>
              Quá hạn tự nộp
            </Tag>
          );
        if (r.assignStatus !== 'ACCEPTED') return <Tag>Chưa ký nhận</Tag>;
        return (
          <Tag color={MAU_TRANG_THAI_CHAM[rs]}>{NHAN_TRANG_THAI_CHAM[rs]}</Tag>
        );
      },
    },
    {
      title: 'Quản lý phụ trách',
      dataIndex: 'evaluatorName',
      render: (v: string | null) =>
        v ?? <Typography.Text type="secondary">—</Typography.Text>,
    },
    {
      title: '',
      key: 'xem',
      width: 60,
      align: 'center',
      render: (_: unknown, r) => (
        <Tooltip title="Xem phiếu">
          <Link to={`/kpi/scorecards/${r.id}/scoring`}>
            <Button type="text" icon={<EyeOutlined />} aria-label="Xem phiếu" />
          </Link>
        </Tooltip>
      ),
    },
  ];

  const phongChip = lamPhang(cayPhong).filter(
    (d) => d.children.length === 0 || d.userCount > 0,
  );

  return (
    <div>
      <ThanhTab nhom="bao-cao" />
      <TieuDeTrang
        eyebrow="Báo cáo kỳ"
        tieuDe={
          <>
            Tổng hợp kỳ đánh giá & xếp loại — {ky.name.toLowerCase()}{' '}
            <Tag
              color={
                ky.isLocked
                  ? 'default'
                  : giaiDoan.so === 3
                    ? 'error'
                    : 'processing'
              }
              style={{ verticalAlign: 'middle', marginInlineStart: 8 }}
            >
              {ky.isLocked
                ? 'Đã chốt sổ'
                : giaiDoan.so === 4
                  ? giaiDoan.ten
                  : `Ngày ${ngayTrongThang(giaiDoan.han)} — ${giaiDoan.ten}`}
            </Tag>
          </>
        }
        moTa="Số liệu thẩm định chính thức cho hành chính và ban giám đốc trước khi chốt sổ tháng."
        phai={
          <>
            <Select
              className="chon-tron"
              size="large"
              style={{ width: 190 }}
              value={kyDangXem}
              onChange={(v) => {
                setPeriodId(v);
                setTrang(1);
              }}
              options={cacKy.map((k) => ({ value: k.id, label: k.name }))}
            />
            <Button
              shape="round"
              size="large"
              icon={<DownloadOutlined />}
              loading={xuat.isPending}
              onClick={() => xuat.mutate()}
            >
              Xuất dữ liệu (.xlsx)
            </Button>
            {coTheChotSo(user?.role) && !ky.isLocked && (
              <Button
                type="primary"
                shape="round"
                size="large"
                icon={<LockOutlined />}
                loading={khoa.isPending}
                onClick={() =>
                  modal.confirm({
                    title: `Khoá sổ ${ky.name}?`,
                    content: `Còn ${tong - daChot} phiếu chưa chốt điểm. Sau khi khoá, không ai chấm hay sửa điểm được nữa; muốn sửa phải mở lại kỳ ở màn Kỳ đánh giá.`,
                    okText: 'Khoá sổ',
                    okButtonProps: { danger: true },
                    cancelText: 'Huỷ',
                    onOk: () => khoa.mutateAsync(),
                  })
                }
              >
                Khoá sổ kỳ đánh giá
              </Button>
            )}
          </>
        }
      />

      {data && (
        <>
          <div className="the-so-lieu-luoi">
            <TheSoLieu
              nhan="Tiến độ thẩm định hồ sơ"
              icon={<SafetyCertificateOutlined />}
              so={daChot}
              donVi={`/ ${tong} phiếu đã chốt`}
              phanTram={phanTram(daChot, tong)}
              soSanh={
                <span className="delta-bang">{phanTram(daChot, tong)}%</span>
              }
              chuThich={`${tt!.RECEIVED} HCNS đã tiếp nhận · ${tt!.MANAGER_SCORED} chờ tiếp nhận`}
            />
            <TheSoLieu
              nhan="Trễ hạn tự nộp"
              icon={<WarningOutlined />}
              so={treTuCham}
              donVi="nhân sự"
              phanTram={treTuCham > 0 ? 100 : 0}
              canChuY={treTuCham > 0}
              chuThich={
                treTuCham > 0
                  ? `Chưa nộp điểm tự chấm (${phongTre.slice(0, 3).join(', ')}${phongTre.length > 3 ? '…' : ''})`
                  : quaTuCham
                    ? 'Mọi nhân sự đã nộp đúng hạn'
                    : `Hạn tự chấm ${ngayVN(ky.selfScoreDeadline)} chưa tới`
              }
            />
            <TheSoLieu
              nhan="Bị trả lại, chờ chấm lại"
              icon={<RollbackOutlined />}
              so={biTraLai}
              donVi="hồ sơ"
              phanTram={biTraLai > 0 ? 100 : 0}
              canChuY={biTraLai > 0}
              chuThich={
                biTraLai > 0
                  ? 'Trưởng bộ phận đã trả lại, nhân viên đang chấm lại'
                  : 'Không có hồ sơ bị trả lại'
              }
            />
            <div className="the-so-lieu the-so-lieu-toi">
              <div className="the-so-lieu-dau">
                <span
                  className="eyebrow"
                  style={{ color: 'rgba(255,255,255,0.7)' }}
                >
                  Hạn chốt sổ
                </span>
                <ClockCircleOutlined />
              </div>
              <div className="the-so-lieu-so" style={{ color: '#fff' }}>
                {ky.isLocked
                  ? 'Đã khoá'
                  : conToiChotSo === null
                    ? '—'
                    : conToiChotSo < 0
                      ? `Quá ${-conToiChotSo} ngày`
                      : conToiChotSo === 0
                        ? 'Hôm nay'
                        : `${conToiChotSo} ngày`}
              </div>
              <Typography.Text
                style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13 }}
              >
                {ky.isLocked
                  ? 'Kỳ đã chốt sổ, không sửa điểm được nữa'
                  : `Gửi hành chính bản cuối ${ngayVN(ky.submitDeadline)}`}
              </Typography.Text>
              <Typography.Text
                style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}
              >
                Hệ thống KHÔNG tự khoá — HCNS hoặc ban giám đốc bấm khoá sổ.
              </Typography.Text>
            </div>
          </div>

          {/* ---------------------------------------------- 4 thẻ hạng */}
          <div className="the-so-lieu-luoi" style={{ marginTop: 16 }}>
            {THU_TU_XEP_LOAI.map((xl: XepLoaiKpi) => {
              const so = data.phanBoXepLoai[xl];
              const tb = data.diemTrungBinhTheoXepLoai[xl];
              return (
                <div key={xl} className="the-hang">
                  <div className="the-hang-dau">
                    <span
                      className="the-hang-ten"
                      style={{
                        background: `${MAU_XEP_LOAI_BD[xl]}22`,
                        color: MAU_XEP_LOAI_BD[xl],
                      }}
                    >
                      {NHAN_XEP_LOAI[xl]}
                    </span>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {daChot > 0 ? `${phanTram(so, daChot)}%` : '—'}
                    </Typography.Text>
                  </div>
                  <div
                    className="the-hang-so"
                    style={{
                      color:
                        xl === 'NOT_ACHIEVED' && so > 0 ? mauNhan : undefined,
                    }}
                  >
                    {so} <small>nhân sự</small>
                  </div>
                  <div className="the-hang-tb">
                    <span>Điểm trung bình</span>
                    <strong>
                      {tb === null ? '—' : `${diemTomTat(tb)} / 100`}
                    </strong>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dashboard-luoi">
            <TheXepLoai data={data} />
            <TheHieuSuatPhong data={data} />
          </div>

          {/* ---------------------------------------------- bảng nhân sự */}
          <Card
            style={{ marginTop: 20 }}
            styles={{ body: { padding: 0 } }}
            title={
              <div
                className="chip-loc-hang"
                style={{ marginBottom: 0, fontWeight: 400 }}
              >
                <span className="eyebrow">Bộ lọc</span>
                <button
                  type="button"
                  className={`chip-loc${!locPhong ? ' chip-loc-chon' : ''}`}
                  onClick={() => {
                    setLocPhong(undefined);
                    setTrang(1);
                  }}
                >
                  Tất cả phòng ban
                </button>
                {phongChip.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`chip-loc${locPhong === d.id ? ' chip-loc-chon' : ''}`}
                    onClick={() => {
                      setLocPhong(d.id);
                      setTrang(1);
                    }}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            }
            extra={
              <span style={{ display: 'flex', gap: 8 }}>
                <Select
                  allowClear
                  placeholder="Tất cả xếp loại"
                  style={{ width: 170 }}
                  value={locXepLoai}
                  onChange={(v) => {
                    setLocXepLoai(v);
                    setTrang(1);
                  }}
                  options={THU_TU_XEP_LOAI.map((xl) => ({
                    value: xl,
                    label: NHAN_XEP_LOAI[xl],
                  }))}
                />
                <Select
                  allowClear
                  placeholder="Trạng thái: tất cả"
                  style={{ width: 220 }}
                  value={locTrangThai}
                  onChange={(v) => {
                    setLocTrangThai(v);
                    setTrang(1);
                  }}
                  options={(
                    Object.keys(NHAN_TRANG_THAI_CHAM) as ResultStatus[]
                  ).map((k) => ({ value: k, label: NHAN_TRANG_THAI_CHAM[k] }))}
                />
              </span>
            }
          >
            {phieu && phieu.data.length === 0 && !dangTaiPhieu ? (
              <Empty
                style={{ padding: 32 }}
                description="Không có phiếu nào khớp bộ lọc"
              />
            ) : (
              <Table<PhieuTomTat>
                rowKey="id"
                size="middle"
                loading={dangTaiPhieu}
                columns={cotPhieu}
                dataSource={phieu?.data ?? []}
                scroll={{ x: 'max-content' }}
                rowClassName={(r) =>
                  r.grade === 'NOT_ACHIEVED' ||
                  (r.resultStatus === 'PENDING' &&
                    quaTuCham &&
                    r.assignStatus === 'ACCEPTED')
                    ? 'dong-can-chu-y'
                    : ''
                }
                pagination={{
                  current: trang,
                  pageSize: SO_DONG,
                  total: phieu?.total ?? 0,
                  showSizeChanger: false,
                  showTotal: (t, [a, b]) =>
                    `Hiển thị ${a}–${b} trên tổng số ${t} phiếu ${ky.name.toLowerCase()}`,
                  onChange: setTrang,
                }}
              />
            )}
          </Card>
        </>
      )}
    </div>
  );
}
