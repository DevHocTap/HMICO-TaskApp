import { Card, Tag, Typography } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  RiseOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { laySoLieuDashboard, layXuHuong } from '../api/report';
import type { KyDanhGia } from '../types/scorecard';
import { TheSoLieu } from './TheSoLieu';
import { TheHieuSuatPhong, TheXepLoai } from './TheBaoCao';
import { giaiDoanCuaKy, ngayTrongThang } from '../utils/period';
import { diemTomTat, phanTram } from '../utils/format';
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

/**
 * Khối điều hành một kỳ — stepper ba giai đoạn, bốn thẻ có so tháng trước,
 * phân bố xếp loại, xếp hạng phòng. Dùng chung cho Tổng quan (trang chủ, vai
 * quản lý) và Báo cáo kỳ; tự tải `/reports/dashboard` và `/reports/trend`.
 *
 * Mọi chỗ hiện trung bình đều PHẢI kèm "tính trên N/M phiếu đã chốt".
 */
export function BangDieuHanhKy({ ky }: { ky: KyDanhGia }) {
  const { data } = useQuery({
    queryKey: ['reports', 'dashboard', ky.id],
    queryFn: () => laySoLieuDashboard(ky.id),
  });
  const { data: xuHuong = [] } = useQuery({
    queryKey: ['reports', 'trend', ky.id],
    queryFn: () => layXuHuong(ky.id, 6),
  });
  if (!data) return null;

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
      ten: 'Nhân viên tự chấm',
      ngay: ky.selfScoreDeadline,
      xong: daTuCham,
      nhan: 'Đã nộp tự chấm',
    },
    {
      so: 2,
      ten: 'Trưởng bộ phận chấm & chốt',
      ngay: ky.managerScoreDeadline,
      xong: daChot,
      nhan: 'Đã chốt điểm',
    },
    {
      so: 3,
      ten: 'HCNS tiếp nhận & chốt sổ',
      ngay: ky.submitDeadline,
      xong: daNhan,
      nhan: 'Đã tiếp nhận',
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

  return (
    <>
      {/* ---------------------------------------------- stepper */}
      <Card
        title={tieuDeThe(
          'Tiến độ quy trình đánh giá',
          `${tong} phiếu trong kỳ`,
        )}
        extra={
          giaiDoan.han && giaiDoan.conNgay !== null ? (
            <Tag
              icon={<ClockCircleOutlined />}
              color={giaiDoan.conNgay <= 2 ? 'gold' : 'default'}
            >
              Hạn giai đoạn {giaiDoan.so}:{' '}
              {giaiDoan.conNgay < 0
                ? `quá ${-giaiDoan.conNgay} ngày`
                : giaiDoan.conNgay === 0
                  ? 'hôm nay'
                  : `còn ${giaiDoan.conNgay} ngày`}
            </Tag>
          ) : (
            <Tag>{giaiDoan.ten}</Tag>
          )
        }
        style={{ marginBottom: 20 }}
      >
        <div className="stepper">
          {buoc.map((b) => {
            const pt = phanTram(b.xong, tong);
            const dang = giaiDoan.so === b.so;
            const daQua = giaiDoan.so > b.so;
            const trangThai = daQua
              ? pt === 100
                ? {
                    text: 'Đã hoàn thành',
                    color: 'success',
                    icon: <CheckCircleOutlined />,
                  }
                : {
                    text: `Còn ${tong - b.xong} phiếu`,
                    color: 'error',
                    icon: <WarningOutlined />,
                  }
              : dang
                ? {
                    text: 'Đang diễn ra',
                    color: 'processing',
                    icon: <ClockCircleOutlined />,
                  }
                : {
                    text: 'Sắp tới',
                    color: 'default',
                    icon: <ClockCircleOutlined />,
                  };
            return (
              <div
                key={b.so}
                className={`stepper-buoc${dang ? ' stepper-buoc-dang' : ''}`}
              >
                <div className="stepper-buoc-dau">
                  <span className="eyebrow">
                    Giai đoạn {b.so} · ngày {ngayTrongThang(b.ngay)}
                  </span>
                  <Tag color={trangThai.color} icon={trangThai.icon}>
                    {trangThai.text}
                  </Tag>
                </div>
                <div className="stepper-buoc-ten">{b.ten}</div>
                <div className="stepper-buoc-so">
                  <span>{b.nhan}</span>
                  <strong>
                    {b.xong} / {tong} ({pt}%)
                  </strong>
                </div>
                <div className="the-so-lieu-thanh">
                  <span
                    style={{
                      width: `${pt}%`,
                      background:
                        daQua && pt < 100
                          ? mauNhan
                          : dang
                            ? mauChuDao
                            : mauXanhLa,
                    }}
                  />
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

      <div className="dashboard-luoi">
        <TheXepLoai data={data} />
        <TheHieuSuatPhong data={data} />
      </div>
    </>
  );
}
