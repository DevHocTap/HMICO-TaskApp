import { Button, Card, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  LockOutlined,
  PlusOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { laySoLieuDashboard, layXuHuong } from '../api/report';
import type { KyDanhGia } from '../types/scorecard';
import type { Role } from '../types/auth';
import { TheSoLieu } from './TheSoLieu';
import { TheHieuSuatChucDanh, TheHieuSuatPhong, TheXepLoai } from './TheBaoCao';
import { TheXuHuong } from './TheXuHuong';
import { MocTienDoThang } from './MocTienDoThang';
import { TheQuyTac } from './TheQuyTac';
import { VongTienDo } from './bieu-do/VongTron';
import { useCaiDat } from '../auth/useTrongSo';
import { giaiDoanCuaKy, ngayTrongThang } from '../utils/period';
import { diemTomTat, ngayVN, phanTram } from '../utils/format';
import { mauChuDao, mauNhan, mauXanhLa } from '../config/theme';

/** Ô "+3,8 so với tháng 09" — xanh khi tăng, đỏ khi giảm, xám khi bằng. */
function SoSanh({
  hienTai,
  truoc,
  tenKyTruoc,
  donVi = '',
}: {
  hienTai: number | null;
  truoc: number | null;
  tenKyTruoc?: string;
  donVi?: string;
}) {
  if (hienTai === null || truoc === null || !tenKyTruoc) {
    return <span className="delta-bang">chưa có kỳ trước để so</span>;
  }
  const lech = Math.round((hienTai - truoc) * 10) / 10;
  const lop = lech > 0 ? 'delta-tang' : lech < 0 ? 'delta-giam' : 'delta-bang';
  return (
    <>
      <span className={lop}>
        {lech > 0 ? '+' : ''}
        {lech.toLocaleString('vi-VN')}
        {donVi}
      </span>
      <span>so với {tenKyTruoc.toLowerCase()}</span>
    </>
  );
}

interface Props {
  ky: KyDanhGia;
  kySau: KyDanhGia | undefined;
  role: Role;
  /** "Phòng Kỹ thuật" với trưởng phòng, "toàn công ty" với HCNS / BGĐ / quản trị. */
  tenPhamVi: string;
  /** Số nhân sự trong phạm vi — nút "N nhân sự" ở đầu trang; bỏ trống thì ẩn nút. */
  soNhanSu?: number;
}

/**
 * Bảng điều hành một kỳ cho vai quản lý (Tổng quan, mẫu 13/09): đầu trang có
 * ba nút việc, bốn thẻ, quy trình ba giai đoạn, xu hướng + mốc tiến độ, xếp
 * loại + hiệu suất nhóm + quy tắc. Tự tải `/reports/dashboard` và
 * `/reports/trend`.
 *
 * Mọi chỗ hiện trung bình đều PHẢI kèm "tính trên N/M phiếu đã chốt".
 */
export function BangDieuHanhKy({ ky, kySau, role, tenPhamVi, soNhanSu }: Props) {
  const { data } = useQuery({
    queryKey: ['reports', 'dashboard', ky.id],
    queryFn: () => laySoLieuDashboard(ky.id),
  });
  const { data: xuHuong = [] } = useQuery({
    queryKey: ['reports', 'trend', ky.id],
    queryFn: () => layXuHuong(ky.id, 6),
  });
  const caiDat = useCaiDat();
  if (!data) return null;
  const chiTieu = caiDat?.nguongXepLoai.canCaiThien ?? 80;

  const homNay = dayjs();
  const giaiDoan = giaiDoanCuaKy(ky, homNay);
  const tt = data.theoTrangThai;
  const tong = data.soPhieuTrongKy;
  const daChot = data.soPhieuDaChot;
  const daTuCham = tt.SELF_SCORED + tt.MANAGER_SCORED + tt.RECEIVED;
  const daNhan = tt.RECEIVED;
  const soDat = data.phanBoXepLoai.COMPLETED + data.phanBoXepLoai.EXCEEDED;

  // Trung bình toàn phạm vi = tổng điểm / tổng phiếu, KHÔNG phải TB của các TB
  const tongDiem = data.diemTrungBinhTheoPhong.reduce(
    (a, p) =>
      a + (p.diemTrungBinh ? Number(p.diemTrungBinh) * p.soPhieuDaChot : 0),
    0,
  );
  const tbToanPhamVi = daChot > 0 ? tongDiem / daChot : null;

  // Kỳ trước = điểm áp chót của dãy xu hướng (dãy kết thúc ở kỳ đang xem)
  const kyTruoc = xuHuong.length >= 2 ? xuHuong[xuHuong.length - 2]! : null;
  const tbKyTruoc = kyTruoc?.diemTrungBinh
    ? Number(kyTruoc.diemTrungBinh)
    : null;
  const tienDoKyTruoc =
    kyTruoc && kyTruoc.soPhieuTrongKy > 0
      ? phanTram(kyTruoc.soPhieuDaChot, kyTruoc.soPhieuTrongKy)
      : null;

  // Cần chú ý: trễ hạn theo giai đoạn đã qua, và phiếu bị trả lại
  const quaTuCham = ky.selfScoreDeadline
    ? homNay.isAfter(dayjs(ky.selfScoreDeadline), 'day')
    : false;
  const quaTruongCham = ky.managerScoreDeadline
    ? homNay.isAfter(dayjs(ky.managerScoreDeadline), 'day')
    : false;
  const treTuCham = quaTuCham ? tt.PENDING : 0;
  const treChamDiem = quaTruongCham ? tt.SELF_SCORED : 0;
  const biTraLai = tt.REJECTED;
  const canChuY = treTuCham + treChamDiem + biTraLai;

  const buoc = [
    {
      so: 1,
      ten: 'Tự chấm cá nhân',
      ngay: ky.selfScoreDeadline,
      xong: daTuCham,
      donVi: 'nhân sự',
      phu: 'Nhân viên nộp cột tự chấm',
    },
    {
      so: 2,
      ten: 'Trưởng bộ phận chấm',
      ngay: ky.managerScoreDeadline,
      xong: daChot,
      donVi: 'phiếu',
      phu: 'Chốt điểm chính thức',
    },
    {
      so: 3,
      ten: 'Nghiệm thu HCNS',
      ngay: ky.submitDeadline,
      xong: daNhan,
      donVi: 'phiếu',
      phu: 'Lưu hồ sơ & tổng hợp',
    },
  ];

  const tieuDeThe = (ten: string, phu?: string) => (
    <span className="viec-tieu-de">
      {ten}
      {phu && (
        <Typography.Text
          type="secondary"
          style={{ fontSize: 13, fontWeight: 400 }}
        >
          {phu}
        </Typography.Text>
      )}
    </span>
  );
  const ghiChuChot = `tính trên ${daChot}/${tong} phiếu đã chốt`;

  // Nút "việc đang chờ" ở đầu trang: trưởng BP / BGĐ chấm phiếu đã tự chấm,
  // HCNS / quản trị tiếp nhận phiếu đã chốt.
  const choToi =
    role === 'MANAGER' || role === 'EXECUTIVE'
      ? { so: tt.SELF_SCORED, ten: 'Chấm điểm', link: '/kpi/assign' }
      : { so: tt.MANAGER_SCORED, ten: 'Tiếp nhận', link: '/kpi/progress' };
  const thang = dayjs(ky.startDate).format('MM/YYYY');
  const laPhong = role === 'MANAGER';

  return (
    <>
      {/* ---------------------------------------------- đầu trang */}
      <header className="dieu-hanh-dau">
        <div>
          <span className="dieu-hanh-eyebrow">
            <Tag color="blue" className="tag-tron">
              Tháng {thang}
            </Tag>
            <Typography.Text type="secondary">
              <ClockCircleOutlined /> Hạn nộp {ngayVN(ky.submitDeadline)}
            </Typography.Text>
          </span>
          <Typography.Title level={1} style={{ margin: '6px 0 0' }}>
            Bảng điều hành KPI:{' '}
            <span style={{ color: mauChuDao }}>{tenPhamVi}</span>
          </Typography.Title>
        </div>
        <div className="dieu-hanh-nut">
          {soNhanSu !== undefined && (
            <Link to="/admin/users">
              <Button shape="round" size="large" icon={<TeamOutlined />}>
                {soNhanSu} nhân sự{laPhong ? '' : ' toàn công ty'}
              </Button>
            </Link>
          )}
          <Link to={choToi.link}>
            <Button
              shape="round"
              size="large"
              icon={<EditOutlined />}
              danger={choToi.so > 0}
            >
              {choToi.ten} ({choToi.so} chờ)
            </Button>
          </Link>
          <Link to="/kpi/assign">
            <Button type="primary" shape="round" size="large" icon={<PlusOutlined />}>
              Giao KPI tháng mới
            </Button>
          </Link>
        </div>
      </header>

      {/* ---------------------------------------------- 4 thẻ */}
      <div className="the-so-lieu-luoi">
        <TheSoLieu
          nhan="Tỷ lệ hoàn thành"
          icon={<RiseOutlined />}
          so={daChot > 0 ? `${phanTram(soDat, daChot)}%` : '—'}
          donVi={daChot > 0 ? '/ 100%' : undefined}
          phai={
            daChot > 0 ? (
              <VongTienDo phanTram={phanTram(soDat, daChot)} mau={mauChuDao} />
            ) : undefined
          }
          khongCoSo={daChot === 0}
          chuThich={
            daChot > 0
              ? `${soDat} đạt · ${daChot - soDat} cần cải thiện hoặc chưa đạt`
              : 'Chưa phiếu nào chốt điểm'
          }
        />
        <TheSoLieu
          nhan="Điểm trung bình"
          icon={<StarOutlined />}
          so={tbToanPhamVi === null ? '—' : diemTomTat(tbToanPhamVi.toFixed(2))}
          donVi={
            tbToanPhamVi === null ? undefined : (
              <Tag
                className="tag-tron"
                color={tbToanPhamVi >= chiTieu ? 'success' : 'error'}
                style={{ marginInlineStart: 4 }}
              >
                {tbToanPhamVi >= chiTieu ? 'Đạt' : 'Dưới chỉ tiêu'}
              </Tag>
            )
          }
          phanTram={tbToanPhamVi ?? 0}
          khongCoSo={tbToanPhamVi === null}
          soSanh={
            <SoSanh
              hienTai={tbToanPhamVi}
              truoc={tbKyTruoc}
              tenKyTruoc={kyTruoc?.period.name}
            />
          }
          chuThich={ghiChuChot}
        />
        <TheSoLieu
          nhan="Tiến độ chốt điểm"
          icon={<SafetyCertificateOutlined />}
          so={daChot}
          donVi={`/ ${tong}`}
          phanTram={phanTram(daChot, tong)}
          daXong={tong > 0 && daChot === tong}
          soSanh={
            <>
              <span className="delta-bang">{phanTram(daChot, tong)}% hoàn tất</span>
              <SoSanh
                hienTai={phanTram(daChot, tong)}
                truoc={tienDoKyTruoc}
                tenKyTruoc={kyTruoc?.period.name}
                donVi="%"
              />
            </>
          }
          chuThich={`${tong - daChot} phiếu chưa chốt · ${daNhan} HCNS đã tiếp nhận`}
        />
        <TheSoLieu
          nhan="Cần chú ý / vi phạm hạn"
          icon={canChuY > 0 ? <WarningOutlined /> : <CheckCircleOutlined />}
          so={canChuY}
          donVi={
            <Tag
              className="tag-tron"
              color={canChuY > 0 ? 'error' : 'success'}
              style={{ marginInlineStart: 4 }}
            >
              {canChuY > 0 ? 'Cần xử lý' : 'Chuẩn tiến độ'}
            </Tag>
          }
          phanTram={canChuY > 0 ? 100 : 0}
          canChuY={canChuY > 0}
          daXong={canChuY === 0}
          soSanh={
            canChuY > 0 ? (
              <>
                {treTuCham > 0 && (
                  <span className="delta-giam">{treTuCham} trễ tự chấm</span>
                )}
                {treChamDiem > 0 && (
                  <span className="delta-giam">{treChamDiem} trễ chấm</span>
                )}
                {biTraLai > 0 && (
                  <span className="delta-giam">{biTraLai} bị trả lại</span>
                )}
              </>
            ) : (
              <span className="delta-tang">Không có phiếu quá hạn</span>
            )
          }
          chuThich="Trễ tính theo mốc của kỳ; bị trả lại đang chờ nhân viên chấm lại"
        />
      </div>

      {/* ---------------------------------------------- quy trình 3 giai đoạn */}
      <Card
        title={tieuDeThe(
          'Quy trình thẩm định 3 giai đoạn',
          `${tong} phiếu trong kỳ`,
        )}
        extra={
          <span className="dieu-hanh-han-chot">
            <LockOutlined />
            Hạn chốt sổ: <strong>{ngayVN(ky.submitDeadline)}</strong>
            {giaiDoan.han && giaiDoan.conNgay !== null && (
              <Tag
                icon={<ClockCircleOutlined />}
                color={giaiDoan.conNgay <= 2 ? 'gold' : 'default'}
                style={{ marginInlineStart: 8 }}
              >
                Giai đoạn {giaiDoan.so}:{' '}
                {giaiDoan.conNgay < 0
                  ? `quá ${-giaiDoan.conNgay} ngày`
                  : giaiDoan.conNgay === 0
                    ? 'hôm nay'
                    : `còn ${giaiDoan.conNgay} ngày`}
              </Tag>
            )}
          </span>
        }
      >
        <div className="stepper">
          {buoc.map((b) => {
            const pt = phanTram(b.xong, tong);
            const dang = giaiDoan.so === b.so;
            const daQua = giaiDoan.so > b.so;
            const trangThai = daQua
              ? pt === 100
                ? { text: 'Hoàn thành', color: 'success', icon: <CheckCircleOutlined /> }
                : { text: `Còn ${tong - b.xong}`, color: 'error', icon: <WarningOutlined /> }
              : dang
                ? { text: 'Đang chạy', color: 'processing', icon: <ClockCircleOutlined /> }
                : b.so === giaiDoan.so + 1
                  ? { text: 'Tiếp theo', color: 'default', icon: undefined }
                  : { text: 'Chờ số liệu', color: 'default', icon: undefined };
            const han = b.ngay ? dayjs(b.ngay) : null;
            const conNgay = han ? han.diff(homNay, 'day') : null;
            const mauThanh = daQua && pt < 100 ? mauNhan : dang ? mauChuDao : pt === 100 ? mauXanhLa : '#94a3b8';
            return (
              <div
                key={b.so}
                className={`stepper-buoc${dang ? ' stepper-buoc-dang' : ''}`}
              >
                <div className="stepper-buoc-dau">
                  <span className="eyebrow" style={{ color: dang ? mauChuDao : undefined }}>
                    {b.so}. {b.ten}
                  </span>
                  <Tag color={trangThai.color} icon={trangThai.icon} className="tag-tron">
                    {trangThai.text}
                  </Tag>
                </div>
                <div className="stepper-buoc-so">
                  <strong style={{ fontSize: 20, color: dang ? mauChuDao : '#111827' }}>
                    {b.xong} / {tong}{' '}
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#4b5563' }}>{b.donVi}</span>
                  </strong>
                  <strong>{pt}%</strong>
                </div>
                <div className="the-so-lieu-thanh">
                  <span style={{ width: `${pt}%`, background: mauThanh }} />
                </div>
                <div className="stepper-buoc-chan">
                  <span>
                    {dang && conNgay !== null
                      ? conNgay < 0
                        ? `Quá ${-conNgay} ngày`
                        : conNgay === 0
                          ? 'Hạn hôm nay'
                          : `Còn ${conNgay} ngày`
                      : b.phu}
                  </span>
                  <span>Hạn: {ngayTrongThang(b.ngay)}/{dayjs(ky.startDate).format('MM')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---------------------------------------------- 4 thẻ */}
      <div className="the-so-lieu-luoi">
        <TheSoLieu
          nhan="Hoàn thành trở lên"
          icon={<RiseOutlined />}
          so={daChot > 0 ? phanTram(soDat, daChot) : '—'}
          donVi="%"
          phanTram={phanTram(soDat, daChot)}
          chuThich={`${soDat} đạt · ${daChot - soDat} cần cải thiện hoặc chưa đạt · ${ghiChuChot}`}
        />
        <TheSoLieu
          nhan="Điểm trung bình"
          icon={<StarOutlined />}
          so={tbToanPhamVi === null ? '—' : diemTomTat(tbToanPhamVi.toFixed(2))}
          donVi="/ 100"
          phanTram={tbToanPhamVi ?? 0}
          soSanh={
            <SoSanh
              hienTai={tbToanPhamVi}
              truoc={tbKyTruoc}
              tenKyTruoc={kyTruoc?.period.name}
            />
          }
          chuThich={ghiChuChot}
        />
        <TheSoLieu
          nhan="Tiến độ chốt điểm"
          icon={<SafetyCertificateOutlined />}
          so={daChot}
          donVi={`/ ${tong}`}
          phanTram={phanTram(daChot, tong)}
          soSanh={
            <>
              <span className="delta-bang">{phanTram(daChot, tong)}%</span>
              <SoSanh
                hienTai={phanTram(daChot, tong)}
                truoc={tienDoKyTruoc}
                tenKyTruoc={kyTruoc?.period.name}
                donVi="%"
              />
            </>
          }
          chuThich={`${tong - daChot} phiếu chưa chốt · ${daNhan} HCNS đã tiếp nhận`}
        />
        <TheSoLieu
          nhan="Cần chú ý xử lý"
          icon={<WarningOutlined />}
          so={canChuY}
          donVi="phiếu"
          phanTram={canChuY > 0 ? 100 : 0}
          canChuY={canChuY > 0}
          soSanh={
            canChuY > 0 ? (
              <>
                {treTuCham > 0 && (
                  <span className="delta-giam">{treTuCham} trễ tự chấm</span>
                )}
                {treChamDiem > 0 && (
                  <span className="delta-giam">{treChamDiem} trễ chấm</span>
                )}
                {biTraLai > 0 && (
                  <span className="delta-giam">{biTraLai} bị trả lại</span>
                )}
              </>
            ) : (
              <span className="delta-tang">Không có phiếu bất thường</span>
            )
          }
          chuThich="Trễ tính theo mốc của kỳ; bị trả lại đang chờ nhân viên chấm lại"
        />
      </div>

      {/* ---------------------------------------------- hai cột: trái rộng, phải hẹp */}
      <div className="tong-quan-luoi">
        <div className="tong-quan-cot">
          <TheXuHuong xuHuong={xuHuong} tenPhamVi={tenPhamVi} chiTieu={chiTieu} />
          <div className="dashboard-luoi">
            <TheXepLoai data={data} dang="vong" />
            {laPhong ? <TheHieuSuatChucDanh data={data} /> : <TheHieuSuatPhong data={data} />}
          </div>
        </div>
        <div className="tong-quan-cot">
          <MocTienDoThang ky={ky} kySau={kySau} />
          <TheQuyTac />
        </div>
      </div>
    </>
  );
}
