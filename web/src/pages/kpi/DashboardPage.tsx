import { useState } from 'react';
import { App, Select, TreeSelect } from 'antd';
import {
  CheckOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  InfoCircleOutlined,
  LockOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  docLoiBlob,
  laySoLieuDashboard,
  layTienDoNop,
  taiExcelTongHop,
} from '../../api/report';
import { khoaKy, layDanhSachPhieu } from '../../api/scorecard';
import { layCayPhongBan } from '../../api/org';
import { layThongBaoLoi } from '../../api/client';
import type { XepLoaiKpi } from '../../types/report';
import type { PhieuTomTat, ResultStatus, XepLoai } from '../../types/scorecard';
import { NHAN_TRANG_THAI_CHAM, NHAN_XEP_LOAI } from '../../types/scorecard';
import type { DepartmentNode } from '../../types/org';
import { ThanhTab } from '../../components/ThanhTab';
import { useAuth } from '../../auth/useAuth';
import { coTheChotSo } from '../../auth/permissions';
import { useKyDangXem } from '../../contexts/KyDangXem';
import { chuVietTat, giaiDoanCuaKy, ngayTrongThang } from '../../utils/period';
import { diemTomTat, ngayVN, phanTram } from '../../utils/format';
import './bao-cao-ky.css';

/** Màu bốn hạng theo mẫu: blue-600 · sky-500 · amber-500 · rose-500. */
const HANG: Record<XepLoaiKpi, { mau: string; lop: string }> = {
  EXCEEDED: { mau: '#2563eb', lop: 'xanh' },
  COMPLETED: { mau: '#0ea5e9', lop: 'sky' },
  NEEDS_IMPROVEMENT: { mau: '#f59e0b', lop: 'cam' },
  NOT_ACHIEVED: { mau: '#f43f5e', lop: 'do' },
};
const THU_TU: XepLoaiKpi[] = ['EXCEEDED', 'COMPLETED', 'NEEDS_IMPROVEMENT', 'NOT_ACHIEVED'];
const MAU_AVATAR = ['#2563eb', '#0284c7', '#1d4ed8', '#475569', '#334155'];
const LOP_TRANG_THAI: Record<ResultStatus, string> = {
  PENDING: 'bc-pill-xam',
  SELF_SCORED: 'bc-pill-cam',
  MANAGER_SCORED: 'bc-pill-xanh',
  REJECTED: 'bc-pill-do',
  RECEIVED: 'bc-pill-xanh-la',
};

const SO_DONG = 10;

function lamPhang(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((n) => [n, ...lamPhang(n.children)]);
}

function sangCay(
  nodes: DepartmentNode[],
): { value: string; title: string; children?: ReturnType<typeof sangCay> }[] {
  return nodes.map((n) => ({
    value: n.id,
    title: n.name,
    children: n.children.length > 0 ? sangCay(n.children) : undefined,
  }));
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
  const [locPhong, setLocPhong] = useState<string | undefined>();
  const [locXepLoai, setLocXepLoai] = useState<XepLoai | undefined>();
  const [locTrangThai, setLocTrangThai] = useState<ResultStatus | undefined>();
  const [trang, setTrang] = useState(1);

  // Kỳ đang xem dùng chung với ô chọn "Kỳ:" ở header
  const { cacKy, ky, datKyId } = useKyDangXem();
  const kyDangXem = ky?.id;

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

  // Chip chỉ cho phòng CÓ PHIẾU trong kỳ (không lấy đơn vị cha chỉ cộng dồn),
  // tối đa 6 — 12 chip tràn hai hàng là lý do sửa (13/09). Phòng còn lại
  // chọn qua ô cây bên phải.
  const dsTienDo = tienDo?.departments ?? [];
  const laCha = new Set(dsTienDo.map((d) => d.parentId).filter(Boolean));
  const phongCoPhieu = dsTienDo
    .filter(
      (d) => !laCha.has(d.departmentId) && d.tongNhanSu - d.chuaCoPhieu > 0,
    )
    .sort(
      (a, b) => b.tongNhanSu - b.chuaCoPhieu - (a.tongNhanSu - a.chuaCoPhieu),
    )
    .slice(0, 6);
  const phongChip = lamPhang(cayPhong).filter((d) =>
    phongCoPhieu.some((p) => p.departmentId === d.id),
  );

  const trangThaiHoSo = (r: PhieuTomTat) => {
    const tre = r.resultStatus === 'PENDING' && quaTuCham && r.assignStatus === 'ACCEPTED';
    if (tre) return { ten: 'Quá hạn tự nộp', lop: 'bc-pill-do' };
    if (r.assignStatus !== 'ACCEPTED') return { ten: 'Chưa ký nhận', lop: 'bc-pill-xam' };
    return { ten: NHAN_TRANG_THAI_CHAM[r.resultStatus], lop: LOP_TRANG_THAI[r.resultStatus] };
  };
  const mauAvatar = (ten: string) => MAU_AVATAR[[...ten].reduce((a, c) => a + c.charCodeAt(0), 0) % MAU_AVATAR.length]!;
  const tongPhieuBang = phieu?.total ?? 0;
  const tuDong = tongPhieuBang === 0 ? 0 : (trang - 1) * SO_DONG + 1;
  const denDong = Math.min(trang * SO_DONG, tongPhieuBang);
  const soTrang = Math.max(1, Math.ceil(tongPhieuBang / SO_DONG));
  const phongTheoDiem = (data?.diemTrungBinhTheoPhong ?? [])
    .filter((p) => p.diemTrungBinh !== null)
    .sort((a, b) => Number(b.diemTrungBinh) - Number(a.diemTrungBinh));

  return (
    <div className="bc">
      {/* ===== tiêu đề + nút */}
      <div className="bc-dau">
        <div>
          <ThanhTab nhom="bao-cao" />
          <div className="bc-dau-ten">
            <h1>Tổng hợp kỳ đánh giá &amp; xếp loại — {ky.name.toLowerCase()}</h1>
            <span className={`bc-tt ${ky.isLocked ? 'bc-tt-xam' : giaiDoan.so === 3 ? 'bc-tt-do' : 'bc-tt-sky'}`}>
              {ky.isLocked ? 'Đã chốt sổ' : giaiDoan.so === 4 ? giaiDoan.ten : `Ngày ${ngayTrongThang(giaiDoan.han)} — ${giaiDoan.ten}`}
            </span>
          </div>
          <p className="bc-mo-ta">Số liệu thẩm định chính thức cho hành chính và ban giám đốc trước khi chốt sổ tháng.</p>
        </div>
        <div className="bc-nut-nhom">
          <Select
            className="bc-select-ky"
            value={kyDangXem}
            onChange={(v) => {
              datKyId(v);
              setTrang(1);
            }}
            options={cacKy.map((k) => ({ value: k.id, label: k.name }))}
          />
          <button type="button" className="bc-nut bc-nut-trang" disabled={xuat.isPending} onClick={() => xuat.mutate()}>
            <DownloadOutlined /> Xuất dữ liệu (.xlsx)
          </button>
          {coTheChotSo(user?.role) && !ky.isLocked && (
            <button
              type="button"
              className="bc-nut bc-nut-xanh"
              disabled={khoa.isPending}
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
              <LockOutlined /> Khoá sổ kỳ đánh giá
            </button>
          )}
        </div>
      </div>

      {data && tt && (
        <>
          {/* ===== 4 thẻ số liệu */}
          <section className="bc-4">
            <div className="bc-the">
              <div>
                <div className="bc-the-dau">
                  <span className="bc-nhan">Tiến độ thẩm định hồ sơ</span>
                  <span className="bc-o-icon bc-o-xanh"><SafetyCertificateOutlined /></span>
                </div>
                <div className="bc-so-dong">
                  <span className="bc-so">{daChot}</span>
                  <span className="bc-so-phu">/ {tong} phiếu đã chốt</span>
                </div>
                <div className="bc-phan-tram">{phanTram(daChot, tong)}%</div>
                <div className="bc-thanh"><span style={{ width: `${phanTram(daChot, tong)}%` }} /></div>
              </div>
              <div className="bc-the-chan">
                <strong>{tt.RECEIVED} HCNS đã tiếp nhận</strong> · {tt.MANAGER_SCORED} chờ tiếp nhận
              </div>
            </div>

            <div className="bc-the">
              <div>
                <div className="bc-the-dau">
                  <span className="bc-nhan">Trễ hạn tự nộp</span>
                  <span className="bc-o-icon bc-o-cam"><WarningOutlined /></span>
                </div>
                <div className="bc-so-dong">
                  <span className={`bc-so${treTuCham > 0 ? ' bc-so-do' : ''}`}>{treTuCham}</span>
                  <span className="bc-so-phu">nhân sự</span>
                </div>
                <div className={`bc-dong-phu ${treTuCham > 0 ? 'bc-chu-do' : 'bc-chu-xanh-la'}`}>
                  {treTuCham > 0 ? <WarningOutlined /> : <CheckOutlined />}{' '}
                  {treTuCham > 0 ? `Chưa nộp: ${phongTre.slice(0, 3).join(', ')}${phongTre.length > 3 ? '…' : ''}` : 'Tiến độ tự đánh giá đúng hạn'}
                </div>
              </div>
              <div className="bc-the-chan">
                {quaTuCham ? `Hạn tự chấm ${ngayVN(ky.selfScoreDeadline)} đã qua` : `Hạn tự chấm ${ngayVN(ky.selfScoreDeadline)} chưa tới`}
              </div>
            </div>

            <div className="bc-the">
              <div>
                <div className="bc-the-dau">
                  <span className="bc-nhan">Bị trả lại, chờ chấm lại</span>
                  <span className="bc-o-icon bc-o-tim"><SyncOutlined /></span>
                </div>
                <div className="bc-so-dong">
                  <span className={`bc-so${biTraLai > 0 ? ' bc-so-do' : ''}`}>{biTraLai}</span>
                  <span className="bc-so-phu">hồ sơ</span>
                </div>
                <div className="bc-dong-phu">{biTraLai > 0 ? 'Trưởng bộ phận đã trả lại, nhân viên đang chấm lại' : 'Không phát sinh yêu cầu chấm lại'}</div>
              </div>
              <div className="bc-the-chan">{biTraLai > 0 ? `${biTraLai} hồ sơ đang chờ nhân viên chấm lại` : 'Không có hồ sơ bị trả lại'}</div>
            </div>

            <div className="bc-the bc-the-toi">
              <div className="bc-toi-quang" />
              <div>
                <div className="bc-the-dau">
                  <span className="bc-nhan bc-nhan-sang">Hạn chốt sổ</span>
                  <ClockCircleOutlined style={{ color: '#94a3b8' }} />
                </div>
                <div className="bc-so-dong">
                  <span className="bc-so bc-so-sang">
                    {ky.isLocked ? 'Đã khoá' : conToiChotSo === null ? '—' : conToiChotSo < 0 ? `Quá ${-conToiChotSo}` : conToiChotSo === 0 ? 'Hôm nay' : conToiChotSo}
                  </span>
                  {!ky.isLocked && conToiChotSo !== null && conToiChotSo !== 0 && <span className="bc-so-phu bc-so-phu-sang">ngày</span>}
                </div>
                <p className="bc-toi-phu">{ky.isLocked ? 'Kỳ đã chốt sổ, không sửa điểm được nữa' : `Gửi hành chính bản cuối ${ngayVN(ky.submitDeadline)}`}</p>
              </div>
              <div className="bc-the-chan bc-the-chan-toi">
                Hệ thống <span>KHÔNG</span> tự khoá — HCNS hoặc ban giám đốc bấm khoá sổ.
              </div>
            </div>
          </section>

          {/* ===== 4 thẻ hạng */}
          <section className="bc-4">
            {THU_TU.map((xl) => {
              const so = data.phanBoXepLoai[xl];
              const tb = data.diemTrungBinhTheoXepLoai[xl];
              return (
                <div key={xl} className={`bc-hang bc-hang-${HANG[xl].lop}`}>
                  <div className="bc-the-dau">
                    <span className={`bc-hang-ten bc-hang-ten-${HANG[xl].lop}`}>{NHAN_XEP_LOAI[xl]}</span>
                    <span className={`bc-hang-pt${so > 0 ? ' bc-hang-pt-dam' : ''}`}>{daChot > 0 ? `${phanTram(so, daChot)}%` : '—'}</span>
                  </div>
                  <div className="bc-hang-so">
                    <span>{so}</span>
                    <small>nhân sự</small>
                  </div>
                  <div className="bc-hang-tb">
                    <span>Điểm trung bình</span>
                    {tb === null ? <span className="bc-hang-tb-trong">—</span> : <strong>{diemTomTat(tb)} <span>/ 100</span></strong>}
                  </div>
                </div>
              );
            })}
          </section>

          {/* ===== phân bố + hiệu suất phòng */}
          <section className="bc-2">
            <div className="bc-khoi">
              <div className="bc-khoi-dau">
                <div>
                  <h3>Phân bố xếp loại</h3>
                  <p>Tính trên {daChot}/{tong} phiếu đã chốt</p>
                </div>
              </div>
              <div className="bc-chu-giai">
                {THU_TU.map((xl) => (
                  <span key={xl}>
                    <i style={{ background: HANG[xl].mau }} /> {NHAN_XEP_LOAI[xl]} <strong>{data.phanBoXepLoai[xl]}</strong>
                  </span>
                ))}
              </div>
              <div className="bc-thanh-chia">
                {daChot > 0 &&
                  THU_TU.map((xl) =>
                    data.phanBoXepLoai[xl] > 0 ? (
                      <span
                        key={xl}
                        style={{ width: `${(data.phanBoXepLoai[xl] / daChot) * 100}%`, background: HANG[xl].mau }}
                        title={`${NHAN_XEP_LOAI[xl]}: ${phanTram(data.phanBoXepLoai[xl], daChot)}% (${data.phanBoXepLoai[xl]} người)`}
                      />
                    ) : null,
                  )}
              </div>
              <div className="bc-o-4">
                {THU_TU.map((xl) => {
                  const so = data.phanBoXepLoai[xl];
                  return (
                    <div key={xl} className={`bc-o${so > 0 ? ` bc-o-${HANG[xl].lop}` : ''}`}>
                      <span className="bc-o-ten">{NHAN_XEP_LOAI[xl]}</span>
                      <span className="bc-o-so">{daChot > 0 ? phanTram(so, daChot) : 0}%</span>
                      <span className="bc-o-nguoi">{so} người</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bc-khoi">
              <div>
                <div className="bc-khoi-dau">
                  <div>
                    <h3>Hiệu suất theo phòng ban</h3>
                    <p>Tính trên {daChot}/{tong} phiếu đã chốt</p>
                  </div>
                  <Link to="/kpi/progress" className="bc-link">
                    Chi tiết <RightOutlined />
                  </Link>
                </div>
                {phongTheoDiem.length === 0 ? (
                  <div className="bc-rong">Chưa phòng nào có phiếu chốt điểm</div>
                ) : (
                  <div className="bc-phong-ds">
                    {phongTheoDiem.map((p, i) => {
                      const diem = Number(p.diemTrungBinh);
                      const duoi = diem < 80;
                      return (
                        <div key={p.departmentId} className="bc-phong">
                          <div className="bc-phong-dau">
                            <div className="bc-phong-ten">
                              <span className="bc-stt">{i + 1}</span>
                              <span>
                                <b>{p.departmentName}</b>
                                <small>{p.soPhieuDaChot} phiếu đã chốt</small>
                              </span>
                            </div>
                            <span className={`bc-phong-diem${duoi ? ' bc-chu-do' : ''}`}>{diemTomTat(p.diemTrungBinh)}</span>
                          </div>
                          <div className="bc-thanh bc-thanh-8">
                            <span style={{ width: `${Math.min(diem, 100)}%`, background: duoi ? '#f43f5e' : '#2563eb' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="bc-chu-thich">
                <InfoCircleOutlined />
                <span>Đỏ: dưới ngưỡng 80. KHÔNG cộng dồn lên phòng cha — trung bình của các trung bình không phải trung bình chung.</span>
              </div>
            </div>
          </section>

          {/* ===== bộ lọc + bảng nhân sự */}
          <section className="bc-bang">
            <div className="bc-loc">
              <div className="bc-loc-trai">
                <span className="bc-nhan" style={{ marginRight: 8 }}>Bộ lọc:</span>
                <button type="button" className={`bc-chip${!locPhong ? ' bc-chip-chon' : ''}`} onClick={() => { setLocPhong(undefined); setTrang(1); }}>
                  Tất cả phòng ban
                </button>
                {phongChip.map((d) => (
                  <button key={d.id} type="button" className={`bc-chip${locPhong === d.id ? ' bc-chip-chon' : ''}`} onClick={() => { setLocPhong(d.id); setTrang(1); }}>
                    {d.name}
                  </button>
                ))}
              </div>
              <div className="bc-loc-phai">
                <TreeSelect
                  allowClear
                  showSearch
                  size="small"
                  treeNodeFilterProp="title"
                  placeholder="Phòng khác…"
                  style={{ width: 170 }}
                  value={locPhong && !phongChip.some((d) => d.id === locPhong) ? locPhong : undefined}
                  treeData={sangCay(cayPhong)}
                  onChange={(v: string | undefined) => { setLocPhong(v); setTrang(1); }}
                />
                <Select
                  allowClear
                  size="small"
                  placeholder="Tất cả xếp loại"
                  style={{ width: 150 }}
                  value={locXepLoai}
                  onChange={(v) => { setLocXepLoai(v); setTrang(1); }}
                  options={THU_TU.map((xl) => ({ value: xl, label: NHAN_XEP_LOAI[xl] }))}
                />
                <Select
                  allowClear
                  size="small"
                  placeholder="Trạng thái: Tất cả"
                  style={{ width: 200 }}
                  value={locTrangThai}
                  onChange={(v) => { setLocTrangThai(v); setTrang(1); }}
                  options={(Object.keys(NHAN_TRANG_THAI_CHAM) as ResultStatus[]).map((k) => ({ value: k, label: NHAN_TRANG_THAI_CHAM[k] }))}
                />
              </div>
            </div>
            <div className="bc-cuon">
              <table className="bc-table">
                <thead>
                  <tr>
                    <th>Mã NV &amp; Họ tên</th>
                    <th>Phòng ban</th>
                    <th style={{ textAlign: 'center' }}>NV chấm</th>
                    <th style={{ textAlign: 'center' }}>QL chốt</th>
                    <th>Xếp loại</th>
                    <th>Trạng thái hồ sơ</th>
                    <th>Quản lý phụ trách</th>
                    <th style={{ textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {dangTaiPhieu && !phieu ? (
                    <tr><td colSpan={8} className="bc-rong">Đang tải…</td></tr>
                  ) : (phieu?.data ?? []).length === 0 ? (
                    <tr><td colSpan={8} className="bc-rong">Không có phiếu nào khớp bộ lọc</td></tr>
                  ) : (
                    (phieu?.data ?? []).map((r) => {
                      const th = trangThaiHoSo(r);
                      const ten = r.ownerName ?? '—';
                      return (
                        <tr key={r.id}>
                          <td>
                            <div className="bc-nv">
                              <span className="bc-avatar" style={{ background: mauAvatar(ten) }}>{chuVietTat(ten)}</span>
                              <div>
                                <div className="bc-nv-ten">{ten}</div>
                                <div className="bc-nv-ma">{r.employeeCode ?? '—'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="bc-td-mo">{r.departmentName}</td>
                          <td style={{ textAlign: 'center' }} className={r.selfTotalScore === null ? 'bc-td-trong' : 'bc-td-dam'}>
                            {r.selfTotalScore === null ? '—' : diemTomTat(r.selfTotalScore)}
                          </td>
                          <td style={{ textAlign: 'center' }} className={r.managerTotalScore === null ? 'bc-td-trong' : r.grade === 'NOT_ACHIEVED' ? 'bc-td-do' : 'bc-td-xanh'}>
                            {r.managerTotalScore === null ? '—' : diemTomTat(r.managerTotalScore)}
                          </td>
                          <td>
                            {r.grade ? (
                              <span className={`bc-pill bc-pill-hang-${HANG[r.grade].lop}`}>{NHAN_XEP_LOAI[r.grade]}</span>
                            ) : (
                              <span className="bc-pill bc-pill-xam">Chưa xếp</span>
                            )}
                          </td>
                          <td>
                            <span className={`bc-pill ${th.lop}`}>{th.ten}</span>
                          </td>
                          <td className="bc-td-ql">{r.evaluatorName ?? <span className="bc-td-trong">—</span>}</td>
                          <td style={{ textAlign: 'right' }}>
                            <Link to={`/kpi/scorecards/${r.id}/scoring`} className="bc-xem" title="Xem chi tiết">
                              <EyeOutlined />
                            </Link>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="bc-bang-chan">
              <div>
                Hiển thị <strong>{tuDong === 0 ? 0 : `${tuDong}–${denDong}`}</strong> trên <strong>{tongPhieuBang}</strong> hồ sơ {ky.name.toLowerCase()}
              </div>
              <div className="bc-trang">
                <button type="button" disabled={trang <= 1} onClick={() => setTrang(trang - 1)}>Trước</button>
                <span>{trang}{soTrang > 1 ? ` / ${soTrang}` : ''}</span>
                <button type="button" disabled={trang >= soTrang} onClick={() => setTrang(trang + 1)}>Sau</button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
