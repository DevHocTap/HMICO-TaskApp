import { App } from 'antd';
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  BookOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  CheckOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  HistoryOutlined,
  HourglassOutlined,
  PaperClipOutlined,
  PlusCircleOutlined,
  RiseOutlined,
  SafetyOutlined,
  StarOutlined,
  TeamOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  docLoiBlob,
  laySoLieuDashboard,
  layTomTatTrangChu,
  layXuHuong,
  taiExcelTongHop,
} from '../api/report';
import { layViecCuaToi } from '../api/scorecard';
import { layThongBaoLoi } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { useCaiDat } from '../auth/useTrongSo';
import { useKyDangXem } from '../contexts/KyDangXem';
import { PhieuCanXuLyGap } from '../components/PhieuCanXuLyGap';
import { DuongVung } from '../components/bieu-do/DuongVung';
import { MocTienDoThang } from '../components/MocTienDoThang';
import { NHAN_XEP_LOAI } from '../types/scorecard';
import type { KyDanhGia } from '../types/scorecard';
import type { XepLoaiKpi } from '../types/report';
import { giaiDoanCuaKy, kyKeTiep, ngayTrongThang } from '../utils/period';
import { diemTomTat, ngayVN, phanTram } from '../utils/format';
import './tong-quan.css';

/** Bảng màu đúng mẫu: emerald / blue / amber / rose. */
const MAU_XEP_LOAI: Record<XepLoaiKpi, { mau: string; lop: string }> = {
  EXCEEDED: { mau: '#10b981', lop: 'xanh-la' },
  COMPLETED: { mau: '#2563eb', lop: 'xanh' },
  NEEDS_IMPROVEMENT: { mau: '#f59e0b', lop: 'cam' },
  NOT_ACHIEVED: { mau: '#f43f5e', lop: 'do' },
};
const THU_TU: XepLoaiKpi[] = ['EXCEEDED', 'COMPLETED', 'NEEDS_IMPROVEMENT', 'NOT_ACHIEVED'];
/** Mỗi nhóm một màu như mẫu: blue-600, indigo-600, emerald-600, rồi xoay vòng. */
const MAU_NHOM = ['#2563eb', '#4f46e5', '#059669', '#d97706', '#0891b2'];

function kyTruocCua(cacKy: KyDanhGia[], ky: KyDanhGia): KyDanhGia | undefined {
  const i = cacKy.findIndex((k) => k.id === ky.id);
  return i >= 0 ? cacKy[i + 1] : undefined;
}
const nhanThang = (ky: KyDanhGia | undefined) => (ky ? `T${dayjs(ky.startDate).format('MM')}` : '');
const nhanMa = (code: string) => `T${code.slice(5, 7)}`;

/**
 * Tổng quan cho vai quản lý — dựng theo đúng mã HTML mẫu bảng điều hành
 * (13/09). Kỳ đang xem lấy từ ô chọn "Kỳ:" ở header.
 */
export function TongQuanQuanLy() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const { cacKy, ky, datKyId } = useKyDangXem();
  const caiDat = useCaiDat();

  const { data } = useQuery({
    queryKey: ['reports', 'dashboard', ky?.id],
    queryFn: () => laySoLieuDashboard(ky!.id),
    enabled: Boolean(ky),
  });
  const { data: xuHuong = [] } = useQuery({
    queryKey: ['reports', 'trend', ky?.id],
    queryFn: () => layXuHuong(ky!.id, 6),
    enabled: Boolean(ky),
  });
  const { data: tomTat } = useQuery({ queryKey: ['reports', 'home-summary'], queryFn: layTomTatTrangChu });
  const { data: viec = [] } = useQuery({ queryKey: ['scorecards', 'pending-my-action'], queryFn: layViecCuaToi });
  const taiExcel = useMutation({
    mutationFn: () => taiExcelTongHop(ky!.id),
    onSuccess: (ten) => message.success(`Đã tải ${ten}`),
    onError: async (e) => message.error((await docLoiBlob(e)) ?? layThongBaoLoi(e)),
  });

  if (!ky || !data || !user) return null;

  const homNay = dayjs();
  const kySau = kyKeTiep(cacKy, ky);
  const kyTruoc = kyTruocCua(cacKy, ky);
  const giaiDoan = giaiDoanCuaKy(ky, homNay);
  const nguong = caiDat?.nguongXepLoai ?? { canCaiThien: 80, hoanThanh: 90, vuot: 100 };
  const chiTieu = nguong.canCaiThien;
  const thangKy = dayjs(ky.startDate).format('MM');

  const tt = data.theoTrangThai;
  const tong = data.soPhieuTrongKy;
  const daChot = data.soPhieuDaChot;
  const daTuCham = tt.SELF_SCORED + tt.MANAGER_SCORED + tt.RECEIVED;
  const soDat = data.phanBoXepLoai.COMPLETED + data.phanBoXepLoai.EXCEEDED;

  // Trung bình toàn phạm vi = tổng điểm / tổng phiếu (không phải TB của các TB)
  const tongDiem = data.diemTrungBinhTheoPhong.reduce(
    (a, p) => a + (p.diemTrungBinh ? Number(p.diemTrungBinh) * p.soPhieuDaChot : 0),
    0,
  );
  const tb = daChot > 0 ? tongDiem / daChot : null;
  const xepLoaiCua = (d: number): XepLoaiKpi =>
    d > nguong.vuot ? 'EXCEEDED' : d >= nguong.hoanThanh ? 'COMPLETED' : d >= nguong.canCaiThien ? 'NEEDS_IMPROVEMENT' : 'NOT_ACHIEVED';
  const diemKyTruoc = xuHuong.length >= 2 ? xuHuong[xuHuong.length - 2]!.diemTrungBinh : null;
  const lech = tb !== null && diemKyTruoc !== null ? Math.round((tb - Number(diemKyTruoc)) * 10) / 10 : null;

  const quaTuCham = ky.selfScoreDeadline ? homNay.isAfter(dayjs(ky.selfScoreDeadline), 'day') : false;
  const quaTruongCham = ky.managerScoreDeadline ? homNay.isAfter(dayjs(ky.managerScoreDeadline), 'day') : false;
  const treTuCham = quaTuCham ? tt.PENDING : 0;
  const treCham = quaTruongCham ? tt.SELF_SCORED : 0;
  const canChuY = treTuCham + treCham + tt.REJECTED;

  const laPhong = user.role === 'MANAGER';
  const tenPhamVi = laPhong && user.departmentName ? user.departmentName : 'Toàn công ty';
  const tenNgan = tenPhamVi.replace(/^Phòng\s+/i, '');
  const soNhanSu =
    tomTat?.role === 'MANAGER' || tomTat?.role === 'HR' ? tomTat.soNhanSu : tomTat?.role === 'ADMIN' ? tomTat.taiKhoanHoatDong : undefined;
  const choToi =
    user.role === 'MANAGER' || user.role === 'EXECUTIVE'
      ? { so: tt.SELF_SCORED, ten: 'Chấm điểm', link: '/kpi/assign' }
      : { so: tt.MANAGER_SCORED, ten: 'Tiếp nhận', link: '/kpi/progress' };

  const giaiDoanList = [
    { so: 1, ten: 'Tự chấm cá nhân', xong: daTuCham, donVi: 'nhân sự', han: ky.selfScoreDeadline, phu: 'Chờ nhân viên nộp' },
    { so: 2, ten: 'Trưởng bộ phận', xong: daChot, donVi: 'phiếu', han: ky.managerScoreDeadline, phu: 'Chờ nộp tiếp' },
    { so: 3, ten: 'Nghiệm thu HCNS', xong: tt.RECEIVED, donVi: 'phiếu', han: ky.submitDeadline, phu: 'Lưu trữ & Xếp hạng' },
  ];

  const nhom = (laPhong
    ? data.diemTrungBinhTheoChucDanh.map((c) => ({ ten: c.jobTitleName, diem: c.diemTrungBinh }))
    : data.diemTrungBinhTheoPhong.map((p) => ({ ten: p.departmentName, diem: p.diemTrungBinh }))
  )
    .filter((n) => n.diem !== null)
    .sort((a, b) => Number(b.diem) - Number(a.diem));
  const nhomDat = nhom.filter((n) => Number(n.diem) >= chiTieu).length;

  const diemXuHuong = xuHuong.map((k) => ({
    nhan: nhanMa(k.period.code),
    giaTri: k.diemTrungBinh === null ? null : Number(k.diemTrungBinh),
    phu: `${k.soPhieuDaChot}/${k.soPhieuTrongKy} phiếu đã chốt`,
  }));

  return (
    <div className="tq">
      {/* ===== Thanh tiêu đề + nút nhanh */}
      <div className="tq-bang-dau">
        <div>
          <div className="tq-eyebrow">
            <span className="tq-nhan-thang">Tháng {dayjs(ky.startDate).format('MM/YYYY')}</span>
            <span className="tq-cham-xam">•</span>
            <span className="tq-nhan-han">
              <HourglassOutlined /> Hạn nộp {ngayTrongThang(ky.submitDeadline)}/{thangKy}
            </span>
          </div>
          <h1 className="tq-h1">
            Bảng điều hành KPI: <span>{tenPhamVi}</span>
          </h1>
        </div>
        <div className="tq-nut-nhanh">
          {soNhanSu !== undefined && (
            <Link to="/admin/users" className="tq-nut tq-nut-xam">
              <TeamOutlined /> {soNhanSu} nhân sự {laPhong ? tenNgan : 'toàn công ty'}
            </Link>
          )}
          <Link to={choToi.link} className="tq-nut tq-nut-trang">
            <CheckSquareOutlined className="tq-icon-xanh" /> {choToi.ten} ({choToi.so} chờ)
          </Link>
          <Link to="/kpi/assign" className="tq-nut tq-nut-xanh">
            <PlusCircleOutlined /> Giao KPI tháng mới
          </Link>
        </div>
      </div>

      {/* ===== 4 thẻ số liệu */}
      <div className="tq-the-luoi">
        <div className="tq-the tq-the-ngang">
          <div>
            <p className="tq-nhan">Tỷ lệ hoàn thành</p>
            <div className="tq-so-dong">
              <span className="tq-so">{daChot > 0 ? `${phanTram(soDat, daChot)}%` : '—'}</span>
              <span className="tq-so-phu">/ 100%</span>
            </div>
            <p className="tq-ghi-chu tq-ghi-chu-xanh-la">
              <span className="tq-cham-nho" />
              {daChot > 0 ? `${soDat} đạt / ${daChot - soDat} cần cải thiện` : 'Chưa có phiếu chốt'}
            </p>
          </div>
          <div className="tq-vong">
            <svg viewBox="0 0 36 36">
              <path className="tq-vong-nen" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              <path
                className="tq-vong-gia-tri"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                strokeDasharray={`${daChot > 0 ? phanTram(soDat, daChot) : 0}, 100`}
              />
            </svg>
            <span>{daChot > 0 ? phanTram(soDat, daChot) : 0}%</span>
          </div>
        </div>

        <div className="tq-the tq-the-ngang">
          <div>
            <p className="tq-nhan">Điểm trung bình</p>
            <div className="tq-so-dong">
              <span className="tq-so">{tb === null ? '—' : diemTomTat(tb.toFixed(2))}</span>
              {tb !== null && <span className={`tq-huy-hieu tq-huy-hieu-${MAU_XEP_LOAI[xepLoaiCua(tb)].lop}`}>{NHAN_XEP_LOAI[xepLoaiCua(tb)]}</span>}
            </div>
            <p className="tq-ghi-chu">
              {lech !== null ? (
                <>
                  <RiseOutlined className={lech >= 0 ? 'tq-chu-xanh-la' : 'tq-chu-do'} />
                  <b className={lech >= 0 ? 'tq-chu-xanh-la' : 'tq-chu-do'}>
                    {lech > 0 ? '+' : ''}
                    {lech.toLocaleString('vi-VN')}
                  </b>
                  so với kỳ trước
                </>
              ) : (
                `Tính trên ${daChot}/${tong} phiếu đã chốt`
              )}
            </p>
          </div>
          <div className="tq-o-icon tq-o-icon-xanh">
            <CheckCircleOutlined />
          </div>
        </div>

        <div className="tq-the tq-the-doc">
          <div className="tq-the-hang">
            <p className="tq-nhan">Tiến độ chốt điểm</p>
            <span className="tq-so-nho">
              {daChot} <small>/ {tong}</small>
            </span>
          </div>
          <div className="tq-thanh tq-thanh-8">
            <span style={{ width: `${phanTram(daChot, tong)}%` }} />
          </div>
          <div className="tq-the-hang tq-ghi-chu">
            <span className="tq-chu-cam">
              <span className="tq-cham-nho tq-cham-cam" /> {phanTram(daChot, tong)}% hoàn tất
            </span>
            <span className="tq-chu-mo">{tong - daChot} phiếu chưa chốt</span>
          </div>
        </div>

        <div className="tq-the tq-the-ngang">
          <div>
            <p className="tq-nhan">Cần chú ý / Vi phạm</p>
            <div className="tq-so-dong">
              <span className="tq-so">{canChuY}</span>
              <span className={`tq-vien ${canChuY > 0 ? 'tq-vien-do' : 'tq-vien-xanh-la'}`}>
                {canChuY > 0 ? <WarningFilled /> : <CheckCircleFilled />} {canChuY > 0 ? 'Cần xử lý' : 'Chuẩn tiến độ'}
              </span>
            </div>
            <p className="tq-ghi-chu">
              {canChuY === 0
                ? 'Không có hồ sơ quá hạn'
                : [treTuCham > 0 && `${treTuCham} trễ tự chấm`, treCham > 0 && `${treCham} trễ chấm`, tt.REJECTED > 0 && `${tt.REJECTED} bị trả lại`]
                    .filter(Boolean)
                    .join(' · ')}
            </p>
          </div>
          <div className={`tq-o-icon ${canChuY > 0 ? 'tq-o-icon-do' : 'tq-o-icon-xanh-la'}`}>
            <SafetyOutlined />
          </div>
        </div>
      </div>

      {/* ===== Quy trình 3 giai đoạn */}
      <div className="tq-khoi">
        <div className="tq-khoi-dau tq-khoi-dau-ke">
          <h2 className="tq-h2">
            <ApartmentOutlined className="tq-icon-xanh" /> Quy trình thẩm định 3 giai đoạn (Pipeline)
          </h2>
          <span className="tq-ghi-chu-12">
            <span className="tq-cham-nho tq-cham-xanh" /> Hạn chốt sổ: <b>{ngayVN(ky.submitDeadline)}</b>
          </span>
        </div>
        <div className="tq-gd-luoi">
          {giaiDoanList.map((g) => {
            const pt = phanTram(g.xong, tong);
            const dang = giaiDoan.so === g.so;
            const daQua = giaiDoan.so > g.so;
            const conNgay = g.han ? dayjs(g.han).diff(homNay, 'day') : null;
            const nhan = daQua
              ? pt === 100 ? 'Hoàn thành' : `Còn ${tong - g.xong}`
              : dang ? 'Đang chạy' : g.so === giaiDoan.so + 1 ? 'Tiếp theo' : 'Chờ số liệu';
            return (
              <div key={g.so} className={`tq-gd${dang ? ' tq-gd-dang' : ''}${daQua && pt < 100 ? ' tq-gd-tre' : ''}`}>
                <div className="tq-the-hang">
                  <span className="tq-gd-ten">
                    {g.so}. {g.ten}
                  </span>
                  <span className="tq-gd-pill">{nhan}</span>
                </div>
                <div className="tq-the-hang tq-gd-so">
                  <span>
                    {g.xong} / {tong} <small>{g.donVi}</small>
                  </span>
                  <b>{pt}%</b>
                </div>
                <div className="tq-thanh tq-thanh-6">
                  <span style={{ width: `${pt}%` }} />
                </div>
                <div className="tq-the-hang tq-gd-chan">
                  <span>
                    {dang && conNgay !== null ? (
                      <>
                        <ClockCircleOutlined />{' '}
                        {conNgay < 0 ? `Quá ${-conNgay} ngày` : conNgay === 0 ? 'Hạn hôm nay' : `Còn ${conNgay} ngày`}
                      </>
                    ) : (
                      g.phu
                    )}
                  </span>
                  <span>
                    Hạn: {ngayTrongThang(g.han)}/{thangKy}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== Hai cột 8/4 */}
      <div className="tq-12">
        <div className="tq-trai">
          {/* Xu hướng */}
          <div className="tq-khoi">
            <div className="tq-khoi-dau" style={{ marginBottom: 16 }}>
              <div>
                <h3 className="tq-h3">
                  <span className="tq-cham-nho tq-cham-xanh" /> Xu hướng điểm KPI {tenPhamVi} (
                  {diemXuHuong[0]?.nhan ?? nhanThang(ky)} – {nhanThang(ky)})
                </h3>
                <p className="tq-ghi-chu-12">So sánh thực tế với mức chỉ tiêu tối thiểu ({chiTieu} điểm)</p>
              </div>
              <div className="tq-chu-giai">
                <span>
                  <i className="tq-vach-xanh" /> <b>Thực tế{tb !== null ? ` (${diemTomTat(tb.toFixed(2))})` : ''}</b>
                </span>
                <span>
                  <i className="tq-vach-do" /> Mục tiêu ({chiTieu})
                </span>
              </div>
            </div>
            <div className="tq-bd-khung">
              {diemXuHuong.length === 0 ? (
                <div className="tq-rong">Chưa có kỳ nào để vẽ</div>
              ) : (
                <>
                  <DuongVung diem={diemXuHuong} mau="#2563eb" chiTieu={{ giaTri: chiTieu, mau: '#f43f5e' }} cao={190} />
                  <div className={`tq-truc${diemXuHuong.length === 1 ? ' tq-truc-mot' : ''}`}>
                    {diemXuHuong.map((d, i) => (
                      <span key={d.nhan} className={i === diemXuHuong.length - 1 ? 'tq-truc-cuoi' : ''}>
                        {d.nhan}
                        {d.giaTri !== null ? ` (${d.giaTri.toLocaleString('vi-VN', { maximumFractionDigits: 1 })})` : ' (—)'}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Xếp loại + hiệu suất nhóm */}
          <div className="tq-2">
            <div className="tq-khoi tq-khoi-doc">
              <div className="tq-khoi-dau" style={{ marginBottom: 8 }}>
                <h3 className="tq-h3">Phân bổ xếp loại KPI</h3>
                <span className="tq-nhan-xam">{daChot} phiếu đã chốt</span>
              </div>
              {daChot === 0 ? (
                <div className="tq-rong">Chưa phiếu nào chốt điểm</div>
              ) : (
                <div className="tq-donut-o">
                  <div className="tq-donut">
                    <svg viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="14" fill="none" stroke="#f1f5f9" strokeWidth="5" />
                      {(() => {
                        let lech = 0;
                        return THU_TU.map((xl) => {
                          const so = data.phanBoXepLoai[xl];
                          if (so === 0) return null;
                          const dai = (so / daChot) * 88;
                          const el = (
                            <circle
                              key={xl}
                              cx="18"
                              cy="18"
                              r="14"
                              fill="none"
                              stroke={MAU_XEP_LOAI[xl].mau}
                              strokeWidth="5"
                              strokeDasharray={`${dai} 88`}
                              strokeDashoffset={-lech}
                            />
                          );
                          lech += dai;
                          return el;
                        });
                      })()}
                    </svg>
                    <div className="tq-donut-giua">
                      <span>{daChot}</span>
                      <small>Đã chốt</small>
                    </div>
                  </div>
                </div>
              )}
              <div className="tq-donut-chu-giai">
                {THU_TU.map((xl) => {
                  const so = data.phanBoXepLoai[xl];
                  const lop = MAU_XEP_LOAI[xl].lop;
                  return (
                    <div key={xl} className={`tq-cg-dong${so > 0 ? ` tq-cg-${lop}` : ''}`}>
                      <span>
                        <i style={{ background: MAU_XEP_LOAI[xl].mau }} /> {NHAN_XEP_LOAI[xl]}
                      </span>
                      <b>
                        {daChot > 0 ? phanTram(so, daChot) : 0}%{so > 0 ? ` (${so})` : ''}
                      </b>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="tq-khoi tq-khoi-doc">
              <div className="tq-khoi-dau" style={{ marginBottom: 8 }}>
                <h3 className="tq-h3">Hiệu suất {laPhong ? 'nhóm chức danh' : 'theo phòng ban'}</h3>
                <Link to="/kpi/dashboard" className="tq-link">
                  Chi tiết →
                </Link>
              </div>
              <div className="tq-nhom">
                {nhom.length === 0 ? (
                  <div className="tq-rong">Chưa {laPhong ? 'chức danh' : 'phòng'} nào có phiếu chốt điểm</div>
                ) : (
                  nhom.map((n, i) => {
                    const mau = MAU_NHOM[i % MAU_NHOM.length]!;
                    return (
                      <div key={n.ten}>
                        <div className="tq-the-hang tq-nhom-dau">
                          <span>{n.ten}</span>
                          <b style={{ color: mau }}>{diemTomTat(n.diem)}</b>
                        </div>
                        <div className="tq-thanh tq-thanh-8">
                          <span style={{ width: `${Math.min(Number(n.diem), 100)}%`, background: mau }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="tq-the-hang tq-chan-ke">
                <span>Chỉ tiêu định biên: {chiTieu}</span>
                {nhom.length > 0 && (
                  <span className={nhomDat === nhom.length ? 'tq-chu-xanh-la' : 'tq-chu-do'}>
                    <CheckOutlined /> {nhomDat === nhom.length ? `Cả ${nhom.length} nhóm đạt chuẩn` : `${nhom.length - nhomDat}/${nhom.length} nhóm dưới chuẩn`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Hàng đợi */}
          {viec.length === 0 ? (
            <div className="tq-khoi tq-hang-doi">
              <div className="tq-hang-doi-trai">
                <div className="tq-o-icon tq-o-icon-xanh-la tq-o-icon-40">
                  <CheckCircleOutlined />
                </div>
                <div>
                  <p className="tq-hang-doi-ten">Hàng đợi trống • Không có việc nào đang chờ bạn</p>
                  <p className="tq-ghi-chu">
                    {kySau?.assignDeadline
                      ? `Đợt giao KPI ${nhanThang(kySau)} của trưởng bộ phận, hạn ${ngayVN(kySau.assignDeadline)}.`
                      : 'Không có email nhắc, không chuông — mở trang này là thấy đủ việc.'}
                  </p>
                </div>
              </div>
              <div className="tq-hang-doi-nut">
                {kyTruoc && (
                  <button type="button" className="tq-nut-nho tq-nut-nho-xam" onClick={() => datKyId(kyTruoc.id)}>
                    <HistoryOutlined /> Lịch sử {nhanThang(kyTruoc)}
                  </button>
                )}
                <Link to="/kpi/progress" className="tq-nut-nho tq-nut-nho-xanh">
                  <ArrowRightOutlined /> Tiến độ nộp
                </Link>
              </div>
            </div>
          ) : (
            <div className="tq-khoi tq-hang-doi tq-hang-doi-co-viec">
              <div className="tq-o-icon tq-o-icon-do tq-o-icon-40">
                <WarningFilled />
              </div>
              <div className="tq-viec-ds">
                {viec.map((v) => (
                  <div key={v.type} className="tq-viec">
                    <span className="tq-viec-chu">{v.message}</span>
                    {v.isOverdue ? (
                      <span className="tq-huy-hieu tq-huy-hieu-do">Quá hạn</span>
                    ) : v.daysUntilDeadline !== null ? (
                      <span className="tq-huy-hieu">Còn {v.daysUntilDeadline} ngày</span>
                    ) : null}
                    <Link to={v.link} className="tq-nut-nho tq-nut-nho-xanh">
                      Xử lý <ArrowRightOutlined />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          <PhieuCanXuLyGap ky={ky} />
        </div>

        {/* ===== Cột phải */}
        <div className="tq-phai">
          <MocTienDoThang ky={ky} kySau={kySau} />

          <div className="tq-khoi">
            <div className="tq-khoi-dau tq-khoi-dau-ke-nho">
              <h3 className="tq-h3">
                <BookOutlined className="tq-icon-cam" /> Quy chế &amp; biểu mẫu
              </h3>
            </div>
            <div className="tq-qc">
              <div className="tq-qc-dong">
                <div className="tq-qc-trai">
                  <StarOutlined className="tq-icon-xanh" />
                  <div>
                    <p className="tq-qc-ten">Thang xếp loại</p>
                    <p className="tq-qc-phu">
                      ≥{nguong.hoanThanh} Hoàn thành | {nguong.canCaiThien}–{(nguong.hoanThanh - 0.01).toLocaleString('vi-VN')} Cần cải thiện | &lt;{nguong.canCaiThien} Chưa đạt
                    </p>
                  </div>
                </div>
                <span className="tq-huy-hieu">Chuẩn</span>
              </div>
              <div className="tq-qc-dong">
                <div className="tq-qc-trai">
                  <PaperClipOutlined className="tq-icon-xanh-la" />
                  <div>
                    <p className="tq-qc-ten">Minh chứng bắt buộc</p>
                    <p className="tq-qc-phu">Ghi chú khi chấm vượt thang · lý do khi trả lại</p>
                  </div>
                </div>
                <span className="tq-huy-hieu tq-huy-hieu-xanh-la">Bắt buộc</span>
              </div>
            </div>
            <button type="button" className="tq-nut-toi" onClick={() => taiExcel.mutate()} disabled={taiExcel.isPending}>
              <span>
                <FileExcelOutlined className="tq-icon-xanh-nhat" /> Tải bảng tổng hợp {nhanThang(ky)} (.xlsx)
              </span>
              <DownloadOutlined />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
