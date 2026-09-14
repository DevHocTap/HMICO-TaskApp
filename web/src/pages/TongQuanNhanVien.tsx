import {
  ArrowRightOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  FileTextOutlined,
  HourglassOutlined,
  LineChartOutlined,
  RiseOutlined,
  TrophyOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { layTomTatTrangChu } from '../api/report';
import { layPhieuChamDiem, layPhieuCuaToi, layViecCuaToi } from '../api/scorecard';
import { useAuth } from '../auth/useAuth';
import { useCaiDat } from '../auth/useTrongSo';
import { useKyDangXem } from '../contexts/KyDangXem';
import { DuongVung } from '../components/bieu-do/DuongVung';
import { MocTienDoThang } from '../components/MocTienDoThang';
import { NHAN_XEP_LOAI, type PhieuKpi, type XepLoai } from '../types/scorecard';
import { kyChuaHomNay, kyKeTiep, tenGoi, vietHoaDau } from '../utils/period';
import { diemTomTat, ngayVN } from '../utils/format';
import './tong-quan.css';

const XANH = '#2563eb';
const DA_CHOT = new Set(['MANAGER_SCORED', 'RECEIVED']);
/** Màu hạng như Tổng quan quản lý: emerald / blue / amber / rose. */
const MAU_HANG: Record<XepLoai, { mau: string; lop: string }> = {
  EXCEEDED: { mau: '#10b981', lop: 'xanh-la' },
  COMPLETED: { mau: '#2563eb', lop: 'xanh' },
  NEEDS_IMPROVEMENT: { mau: '#f59e0b', lop: 'cam' },
  NOT_ACHIEVED: { mau: '#f43f5e', lop: 'do' },
};

/**
 * Tổng quan cho NHÂN VIÊN (14/09) — cùng ngôn ngữ với bảng điều hành của vai
 * quản lý: thanh tiêu đề, 4 thẻ, phiếu kỳ này (3 bước + hai cột điểm), lịch
 * sử điểm 6 kỳ, mốc tiến độ tháng, việc của tôi. Kỳ luôn là kỳ chứa hôm nay.
 */
export function TongQuanNhanVien() {
  const { user } = useAuth();
  const { cacKy } = useKyDangXem();
  const caiDat = useCaiDat();
  const { data: tomTat } = useQuery({ queryKey: ['reports', 'home-summary'], queryFn: layTomTatTrangChu });
  const { data: danhSach = [] } = useQuery({ queryKey: ['scorecards', 'my'], queryFn: () => layPhieuCuaToi() });
  const { data: viec = [], isLoading: dangTaiViec } = useQuery({
    queryKey: ['scorecards', 'pending-my-action'],
    queryFn: layViecCuaToi,
  });

  const homNay = dayjs();
  const ky = kyChuaHomNay(cacKy, homNay);
  const kySau = ky ? kyKeTiep(cacKy, ky) : undefined;
  const phieu = ky ? danhSach.find((p) => p.periodId === ky.id) : undefined;
  const daKy = phieu?.assignStatus === 'ACCEPTED';

  // Điểm tự chấm dự kiến — chỉ khi đã ký nhận (chưa ký thì /scoring trả 409)
  const { data: chamDiem } = useQuery({
    queryKey: ['scorecards', 'scoring', phieu?.id],
    queryFn: () => layPhieuChamDiem(phieu!.id),
    enabled: Boolean(phieu) && daKy,
  });

  if (!user) return null;
  const staff = tomTat?.role === 'STAFF' ? tomTat : undefined;
  const chiTieu = caiDat?.nguongXepLoai.canCaiThien ?? 80;

  // ---- ba bước của phiếu kỳ này
  const b1 = daKy;
  const b2 = phieu ? phieu.resultStatus !== 'PENDING' && phieu.resultStatus !== 'REJECTED' : false;
  const b3 = phieu ? DA_CHOT.has(phieu.resultStatus) : false;
  const buoc = [
    {
      ten: '1. Ký nhận KPI',
      phu: phieu?.acceptedAt ? ngayVN(phieu.acceptedAt) : phieu?.proposedAt ? `Gửi ký ${ngayVN(phieu.proposedAt)}` : 'Chưa được giao',
      ket: b1 ? 'Đã xác nhận' : phieu?.assignStatus === 'PROPOSED' ? 'Chờ bạn ký' : phieu?.assignStatus === 'DISPUTED' ? 'Đã nêu ý kiến' : 'Chưa gửi ký',
      xong: b1,
      dang: Boolean(phieu) && !b1,
    },
    {
      ten: '2. Tự chấm điểm',
      phu: `Hạn: ${ngayVN(ky?.selfScoreDeadline)}`,
      ket: b2
        ? `Điểm: ${diemTomTat(phieu!.selfTotalScore)}/100`
        : chamDiem?.selfPreview
          ? `Dự kiến: ${diemTomTat(chamDiem.selfPreview.tongDiem)}/100`
          : phieu?.resultStatus === 'REJECTED'
            ? 'Bị trả lại, chấm lại'
            : 'Chưa nộp',
      xong: b2,
      dang: b1 && !b2,
    },
    {
      ten: '3. Chốt điểm kỳ',
      phu: `Hạn: ${ngayVN(ky?.managerScoreDeadline)}`,
      ket: b3 ? `${diemTomTat(phieu!.managerTotalScore)}/100 · ${phieu!.grade ? NHAN_XEP_LOAI[phieu!.grade] : ''}` : b2 ? 'Chờ quản lý duyệt' : 'Chưa tới',
      xong: b3,
      dang: b2 && !b3,
    },
  ];
  const soBuocXong = buoc.filter((b) => b.xong).length;

  // ---- nút đúng việc đến lượt
  const nut: { ten: string; to: string } | null = !phieu
    ? null
    : phieu.assignStatus === 'PROPOSED' || phieu.assignStatus === 'DISPUTED'
      ? { ten: 'Xem & ký nhận KPI', to: '/kpi/my' }
      : daKy && (phieu.resultStatus === 'PENDING' || phieu.resultStatus === 'REJECTED')
        ? { ten: phieu.resultStatus === 'REJECTED' ? 'Chấm lại phiếu' : 'Tự chấm điểm ngay', to: `/kpi/scorecards/${phieu.id}/scoring` }
        : { ten: 'Xem phiếu kỳ này', to: `/kpi/scorecards/${phieu.id}/scoring` };

  // ---- hạn tự chấm
  const hanTuCham = ky?.selfScoreDeadline ? dayjs(ky.selfScoreDeadline) : null;
  const conNgay = hanTuCham ? hanTuCham.startOf('day').diff(homNay.startOf('day'), 'day') : null;
  const daNop = b2;

  // ---- tiến trình tự chấm (số tiêu chí lá đã chấm) từ home-summary
  const tuCham = staff?.tuCham ?? null;
  const daChamLa = tuCham ? tuCham.tong - tuCham.chua : 0;
  const ptTuCham = tuCham && tuCham.tong > 0 ? Math.round((daChamLa / tuCham.tong) * 100) : 0;

  // ---- lịch sử 6 kỳ đã chốt, cũ → mới
  const lichSu = danhSach
    .filter((p): p is PhieuKpi & { managerTotalScore: string } => p.managerTotalScore !== null)
    .sort((a, b) => a.period.code.localeCompare(b.period.code))
    .slice(-6);
  const diemXuHuong = lichSu.map((p) => ({
    nhan: `T${p.period.code.slice(5, 7)}`,
    giaTri: Number(p.managerTotalScore),
    phu: p.grade ? NHAN_XEP_LOAI[p.grade] : undefined,
  }));

  const thangTruoc = staff?.thangTruoc ?? null;
  const tbGanDay = staff?.trungBinhGanDay ?? null;
  const hangThangTruoc = thangTruoc?.grade ? MAU_HANG[thangTruoc.grade] : null;

  return (
    <div className="tq">
      {/* ===== Thanh tiêu đề */}
      <div className="tq-bang-dau">
        <div>
          <div className="tq-eyebrow">
            <span className="tq-nhan-thang">{ky ? `Tháng ${dayjs(ky.startDate).format('MM/YYYY')}` : 'Chưa có kỳ'}</span>
            <span className="tq-cham-xam">•</span>
            <span className="tq-nhan-han">
              <HourglassOutlined /> Hạn tự chấm {ngayVN(ky?.selfScoreDeadline)}
            </span>
          </div>
          <h1 className="tq-h1">
            Xin chào, <span>{vietHoaDau(tenGoi(user.fullName))}</span>
          </h1>
          <p className="tq-mo-ta">
            {[user.jobTitleName, user.departmentName].filter(Boolean).join(' · ') || 'Phiếu KPI của bạn trong tháng này'}
          </p>
        </div>
        <div className="tq-nut-nhanh">
          <Link to="/kpi/my" className="tq-nut tq-nut-trang">
            <FileTextOutlined className="tq-icon-xanh" /> Phiếu đánh giá của tôi
          </Link>
          {nut && (
            <Link to={nut.to} className="tq-nut tq-nut-xanh">
              <EditOutlined /> {nut.ten}
            </Link>
          )}
        </div>
      </div>

      {/* ===== 4 thẻ */}
      <div className="tq-the-luoi">
        <div className="tq-the tq-the-ngang">
          <div>
            <p className="tq-nhan">Điểm tháng trước</p>
            <div className="tq-so-dong">
              <span className="tq-so">{thangTruoc?.diem ? diemTomTat(thangTruoc.diem) : '—'}</span>
              {thangTruoc?.grade && hangThangTruoc && (
                <span className={`tq-huy-hieu tq-huy-hieu-${hangThangTruoc.lop}`}>{NHAN_XEP_LOAI[thangTruoc.grade]}</span>
              )}
            </div>
            <p className="tq-ghi-chu">{thangTruoc ? thangTruoc.periodName : 'Chưa có kỳ nào chốt điểm'}</p>
          </div>
          <div className="tq-o-icon tq-o-icon-xanh"><TrophyOutlined /></div>
        </div>

        <div className="tq-the tq-the-ngang">
          <div>
            <p className="tq-nhan">Trung bình gần đây</p>
            <div className="tq-so-dong">
              <span className="tq-so">{tbGanDay ? diemTomTat(tbGanDay.diem) : '—'}</span>
              {tbGanDay && <span className="tq-so-phu">/ {tbGanDay.soPhieu} kỳ đã chốt</span>}
            </div>
            <p className="tq-ghi-chu">
              {tbGanDay ? (
                <>
                  <RiseOutlined className={Number(tbGanDay.diem) >= chiTieu ? 'tq-chu-xanh-la' : 'tq-chu-do'} />
                  {Number(tbGanDay.diem) >= chiTieu ? `Trên chỉ tiêu ${chiTieu}` : `Dưới chỉ tiêu ${chiTieu}`}
                </>
              ) : (
                'Tính trên tối đa 3 kỳ gần nhất'
              )}
            </p>
          </div>
          <div className="tq-o-icon tq-o-icon-xanh"><LineChartOutlined /></div>
        </div>

        <div className="tq-the tq-the-doc">
          <div className="tq-the-hang">
            <p className="tq-nhan">Tự chấm kỳ này</p>
            <span className="tq-so-nho">
              {tuCham ? daChamLa : 0} <small>/ {tuCham?.tong ?? 0}</small>
            </span>
          </div>
          <div className="tq-thanh tq-thanh-8">
            <span style={{ width: `${ptTuCham}%`, background: ptTuCham === 100 ? '#10b981' : XANH }} />
          </div>
          <div className="tq-phu">
            <span className={`tq-tag ${ptTuCham === 100 ? 'tq-tag-xanh-la' : 'tq-tag-xanh'}`}>{ptTuCham}% tiêu chí</span>{' '}
            {daNop ? 'đã nộp' : tuCham ? `còn ${tuCham.chua} tiêu chí` : 'chưa có phiếu'}
          </div>
        </div>

        <div className="tq-the tq-the-ngang">
          <div>
            <p className="tq-nhan">Hạn tự chấm</p>
            <div className="tq-so-dong">
              <span className={`tq-so${!daNop && conNgay !== null && conNgay < 0 ? ' tq-so-do' : ''}`}>
                {daNop ? 'Đã nộp' : conNgay === null ? '—' : conNgay < 0 ? `Quá ${-conNgay}` : conNgay === 0 ? 'Hôm nay' : conNgay}
              </span>
              {!daNop && conNgay !== null && conNgay !== 0 && <span className="tq-so-phu">ngày</span>}
            </div>
            <p className="tq-ghi-chu">{daNop ? `Nộp ngày ${ngayVN(phieu?.selfScoredAt)}` : `Nộp trước ${ngayVN(ky?.selfScoreDeadline)}`}</p>
          </div>
          <div className={`tq-o-icon ${daNop ? 'tq-o-icon-xanh-la' : conNgay !== null && conNgay < 0 ? 'tq-o-icon-do' : 'tq-o-icon-xanh'}`}>
            {daNop ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
          </div>
        </div>
      </div>

      {/* ===== hai cột */}
      <div className="tq-12">
        <div className="tq-trai">
          {/* Phiếu kỳ này */}
          <div className="tq-khoi">
            <div className="tq-khoi-dau" style={{ marginBottom: 12 }}>
              <h3 className="tq-h3">
                <span className="tq-cham-nho tq-cham-xanh" /> Phiếu KPI {ky ? ky.name.toLowerCase() : 'kỳ này'}
              </h3>
              <span className="tq-nhan-xanh">Bước {soBuocXong} / 3 hoàn tất</span>
            </div>
            {!phieu ? (
              <div className="tq-rong">Trưởng bộ phận chưa giao phiếu cho kỳ này.</div>
            ) : (
              <>
                <div className="pt-buoc-luoi">
                  {buoc.map((b) => (
                    <div key={b.ten} className={`pt-buoc ${b.xong ? 'pt-buoc-xong' : b.dang ? 'pt-buoc-dang' : 'pt-buoc-cho'}`}>
                      <div className="pt-buoc-ten">
                        {b.xong ? <CheckCircleFilled /> : <span className="pt-buoc-vong" />}
                        <span>{b.ten}</span>
                      </div>
                      <p className="pt-buoc-phu">{b.phu}</p>
                      <p className="pt-buoc-ket">{b.ket}</p>
                    </div>
                  ))}
                </div>
                <div className="tqn-diem-luoi">
                  <div className="tqn-diem">
                    <span className="tq-nhan">NV tự chấm</span>
                    <b>
                      {phieu.selfTotalScore ? diemTomTat(phieu.selfTotalScore) : chamDiem?.selfPreview ? diemTomTat(chamDiem.selfPreview.tongDiem) : '—'}
                      <small> / 100</small>
                    </b>
                    <span className="tq-ghi-chu">{phieu.selfTotalScore ? 'Đã nộp' : chamDiem?.selfPreview ? 'Dự kiến, chưa nộp' : 'Chưa chấm'}</span>
                  </div>
                  <div className="tqn-diem tqn-diem-xanh">
                    <span className="tq-nhan">Trưởng BP chấm</span>
                    <b>
                      {phieu.managerTotalScore ? diemTomTat(phieu.managerTotalScore) : '—'}
                      <small> / 100</small>
                    </b>
                    <span className="tq-ghi-chu">{phieu.managerTotalScore ? `Chốt ${ngayVN(phieu.managerScoredAt)}` : 'Chờ trưởng bộ phận'}</span>
                  </div>
                  <div className={`tqn-diem${phieu.grade ? ` tqn-diem-${MAU_HANG[phieu.grade].lop}` : ''}`}>
                    <span className="tq-nhan">Xếp loại</span>
                    <b style={phieu.grade ? { color: MAU_HANG[phieu.grade].mau } : undefined}>{phieu.grade ? NHAN_XEP_LOAI[phieu.grade] : '—'}</b>
                    <span className="tq-ghi-chu">Chỉ tính trên cột trưởng bộ phận</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Lịch sử điểm */}
          <div className="tq-khoi tq-xu-huong">
            <div className="tq-khoi-dau" style={{ marginBottom: 16 }}>
              <div>
                <h3 className="tq-h3">
                  <span className="tq-cham-nho tq-cham-xanh" /> Lịch sử điểm KPI
                  {diemXuHuong.length === 1
                    ? ` (${diemXuHuong[0]!.nhan})`
                    : diemXuHuong.length > 1
                      ? ` (${diemXuHuong[0]!.nhan} – ${diemXuHuong[diemXuHuong.length - 1]!.nhan})`
                      : ''}
                </h3>
                <p className="tq-ghi-chu-12">Điểm trưởng bộ phận chốt các kỳ gần nhất, so với chỉ tiêu tối thiểu ({chiTieu} điểm)</p>
              </div>
              <div className="tq-chu-giai">
                <span>
                  <i className="tq-vach-xanh" /> <b>Điểm chốt</b>
                </span>
                <span>
                  <i className="tq-vach-do" /> Chỉ tiêu ({chiTieu})
                </span>
              </div>
            </div>
            <div className="tq-bd-khung">
              {diemXuHuong.length === 0 ? (
                <div className="tq-rong">Chưa có kỳ nào chốt điểm</div>
              ) : (
                <>
                  <DuongVung diem={diemXuHuong} mau={XANH} chiTieu={{ giaTri: chiTieu, mau: '#f43f5e' }} cao={190} />
                  <div className={`tq-truc${diemXuHuong.length === 1 ? ' tq-truc-mot' : ''}`}>
                    {diemXuHuong.map((d, i) => (
                      <span key={d.nhan} className={i === diemXuHuong.length - 1 ? 'tq-truc-cuoi' : ''}>
                        {d.nhan} ({d.giaTri.toLocaleString('vi-VN', { maximumFractionDigits: 1 })})
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="tq-phai">
          {ky && <MocTienDoThang ky={ky} kySau={kySau} />}

          {/* Việc của tôi */}
          <div className="tq-khoi">
            <div className="tq-khoi-dau tq-khoi-dau-ke-nho">
              <h3 className="tq-h3">
                <span className="tq-cham-nho tq-cham-xanh" /> Việc của tôi
              </h3>
              <span className={`tq-tag ${viec.length > 0 ? 'tq-tag-do' : 'tq-tag-xanh-la'}`}>
                {viec.length > 0 ? `${viec.length} việc` : 'Trống'}
              </span>
            </div>
            {dangTaiViec ? null : viec.length === 0 ? (
              <div className="tq-hang-doi" style={{ padding: '14px 0 0' }}>
                <span className="tq-o-icon tq-o-icon-xanh-la tq-o-icon-40"><CheckCircleFilled /></span>
                <span className="tq-hang-doi-chu">
                  <b>Không có việc nào đang chờ bạn</b>
                  <small>Không có email nhắc, không chuông — mở trang này là thấy đủ việc.</small>
                </span>
              </div>
            ) : (
              <div className="tq-viec-ds" style={{ marginTop: 12 }}>
                {viec.map((v) => (
                  <div key={v.type} className="tq-viec">
                    <WarningFilled style={{ color: '#e11d48' }} />
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
