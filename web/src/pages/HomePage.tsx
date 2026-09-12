import type { ReactNode } from 'react';
import { Button, Card, Empty, Tag, Typography } from 'antd';
import {
  ArrowRightOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  EditOutlined,
  FileDoneOutlined,
  FormOutlined,
  InboxOutlined,
  LockOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { layKyDanhGia, layViecCuaToi } from '../api/scorecard';
import { layTomTatTrangChu } from '../api/report';
import { BangDieuHanhKy } from '../components/BangDieuHanhKy';
import { PhieuCanXuLyGap } from '../components/PhieuCanXuLyGap';
import type { TomTatTrangChu } from '../types/report';
import { NHAN_XEP_LOAI } from '../types/scorecard';
import { coTheXemBaoCao } from '../auth/permissions';
import { diemTomTat, phanTram } from '../utils/format';
import { TheSoLieu, type TheSoLieuProps } from '../components/TheSoLieu';
import { NGUONG_PHONG_CAN_CHU_Y } from '../config/theme';
import type { KyDanhGia, ViecCanXuLy } from '../types/scorecard';
import type { Role } from '../types/auth';
import { useAuth } from '../auth/useAuth';
import {
  kyChuaHomNay,
  kyKeTiep,
  ngayTrongThang,
  tenGoi,
  vietHoaDau,
} from '../utils/period';

/**
 * Nhãn thời hạn.
 *
 * `daysUntilDeadline` không bao giờ âm và `isOverdue` tách riêng, nên chỗ
 * này không phải đoán ý nghĩa của số âm. Xem `tinhTinhTrangHanNop()` ở
 * `src/modules/period/period-calendar.ts`.
 */
function nhanHan(viec: ViecCanXuLy) {
  if (viec.isOverdue) return <Tag className="tag-qua-han">Quá hạn</Tag>;
  if (viec.daysUntilDeadline === null) return null;
  const text = `Còn ${viec.daysUntilDeadline} ngày`;
  if (viec.daysUntilDeadline <= 5)
    return <Tag className="tag-con-han">{text}</Tag>;
  return <Typography.Text strong>{text}</Typography.Text>;
}

/** Icon theo loại việc — `type` do backend đặt, xem pendingMyAction(). */
const ICON_VIEC: Record<string, ReactNode> = {
  CHUA_GIAO_KPI: <FormOutlined />,
  BGD_CHUA_GIAO_KPI: <FormOutlined />,
  CHUA_GUI_KY: <SendOutlined />,
  BGD_CHUA_GUI_KY: <SendOutlined />,
  CHO_KY_NHAN: <LockOutlined />,
  CO_Y_KIEN: <EditOutlined />,
  CHO_TU_CHAM: <EditOutlined />,
  CHO_TOI_CHAM: <EditOutlined />,
  CHO_TIEP_NHAN: <InboxOutlined />,
};

/**
 * Câu dẫn và nút hành động chính của trang chủ, theo vai trò.
 *
 * Chữ tĩnh, chỉ ngày lấy từ kỳ thật. Không đếm số ở đây — số nằm ở
 * "Việc của tôi" và các thẻ số liệu phía dưới.
 */
function loiDanTheoVai(
  role: Role,
  ky: KyDanhGia | undefined,
  kySau: KyDanhGia | undefined,
  departmentName: string | null | undefined,
): { moTa: string; nutText: string; nutLink: string } {
  const ngayTuCham = ngayTrongThang(ky?.selfScoreDeadline ?? null);
  const ngayGuiHc = ngayTrongThang(ky?.submitDeadline ?? null);
  const ngayGiaoKpi = ngayTrongThang(kySau?.assignDeadline ?? null);
  switch (role) {
    case 'ADMIN':
      return {
        moTa: 'Sức khoẻ hệ thống: tài khoản, phòng ban, mẫu KPI và nhật ký thao tác.',
        nutText: 'Quản lý nhân viên',
        nutLink: '/admin/users',
      };
    case 'EXECUTIVE':
      return {
        moTa: 'Toàn cảnh KPI toàn công ty: ai đã giao, ai đã chấm, mức độ hoàn thành theo phòng.',
        nutText: 'Xem tổng hợp KPI',
        nutLink: '/kpi/dashboard',
      };
    case 'HR':
      return {
        moTa: `Theo dõi tiến độ toàn công ty và tiếp nhận bản đánh giá cuối cùng trước ngày ${ngayGuiHc}.`,
        nutText: 'Xem tiến độ nộp',
        nutLink: '/kpi/progress',
      };
    case 'MANAGER':
      return {
        moTa: `${departmentName ?? 'Phòng của bạn'} — bạn chấm điểm cho nhân viên và giao KPI tháng mới trước ngày ${ngayGiaoKpi}.`,
        nutText: 'Chấm điểm nhân viên',
        nutLink: '/kpi/assign',
      };
    default:
      return {
        moTa: `Phiếu KPI của bạn: ký nhận đầu kỳ, tự chấm trước ngày ${ngayTuCham} để trưởng bộ phận kịp chấm.`,
        nutText: 'Phiếu KPI của tôi',
        nutLink: '/kpi/my',
      };
  }
}

/**
 * Bốn mốc cố định trong tháng (quy-tac-nghiep-vu.md mục 5.5).
 *
 * Mốc "Giao KPI tháng mới" là hạn của kỳ KẾ TIẾP (ngày 25 tháng này là
 * hạn lên KPI cho tháng sau), ba mốc còn lại thuộc kỳ hiện tại.
 */
function lichThangNay(ky: KyDanhGia, kySau: KyDanhGia | undefined) {
  return [
    {
      ngay: ky.selfScoreDeadline,
      ten: 'Nhân viên tự chấm điểm',
      ai: 'Toàn bộ nhân sự có phiếu',
    },
    {
      ngay: kySau?.assignDeadline ?? null,
      ten: 'Giao KPI tháng mới',
      ai: 'Trưởng bộ phận',
    },
    {
      ngay: ky.managerScoreDeadline,
      ten: 'Trưởng bộ phận chấm điểm',
      ai: 'Trưởng bộ phận, ban giám đốc',
    },
    {
      ngay: ky.submitDeadline,
      ten: 'Gửi hành chính bản cuối',
      ai: 'Hành chính nhân sự tiếp nhận',
    },
  ];
}

/** Đã qua / Đang mở (còn ≤ 7 ngày) / Sắp tới. */
function trangThaiMoc(ngay: string | null, homNay: dayjs.Dayjs) {
  if (!ngay) return null;
  const han = dayjs(ngay);
  if (homNay.isAfter(han, 'day'))
    return <Tag className="tag-moc tag-moc-qua">Đã qua</Tag>;
  if (han.diff(homNay, 'day') <= 7)
    return <Tag className="tag-moc tag-moc-mo">Đang mở</Tag>;
  return <Tag className="tag-moc">Sắp tới</Tag>;
}

/** "25/10" — ngày của mốc kèm tháng của kỳ, để câu chú thích tự đứng được. */
function ngayThang(
  iso: string | null | undefined,
  ky: KyDanhGia | undefined,
): string {
  if (!iso) return '—';
  return `${ngayTrongThang(iso)}/${dayjs(ky?.startDate).format('MM')}`;
}

/**
 * Bốn thẻ số liệu theo vai — nội dung từ `/reports/home-summary`.
 *
 * Mỗi thẻ tự quyết `canChuY` (tô hồng): chỉ khi con số là thứ đáng lo,
 * không phải cứ chưa đủ 100% là hồng.
 */
function theSoLieuTheoVai(
  t: TomTatTrangChu,
  ky: KyDanhGia | undefined,
): TheSoLieuProps[] {
  switch (t.role) {
    case 'ADMIN':
      return [
        {
          nhan: 'Tài khoản đang hoạt động',
          so: t.taiKhoanHoatDong,
          donVi: `/${t.tongTaiKhoan}`,
          phanTram: phanTram(t.taiKhoanHoatDong, t.tongTaiKhoan),
          chuThich:
            `${t.tongTaiKhoan - t.taiKhoanHoatDong} tài khoản đã vô hiệu hoá` +
            (t.chuaDoiMatKhau > 0
              ? ` · ${t.chuaDoiMatKhau} chưa đổi mật khẩu lần đầu`
              : ''),
        },
        {
          nhan: 'Phòng ban',
          so: t.soPhongBan,
          donVi: 'phòng',
          chuThich:
            t.phongThieuTruong.length > 0
              ? `${t.phongThieuTruong.length} phòng có nhân sự mà chưa có trưởng bộ phận`
              : 'Mọi phòng có nhân sự đều có trưởng bộ phận',
          canChuY: t.phongThieuTruong.length > 0,
        },
        {
          nhan: 'Mẫu KPI đã xuất bản',
          so: t.mauDaXuatBan,
          donVi: `/${t.tongMau}`,
          phanTram: phanTram(t.mauDaXuatBan, t.tongMau),
          chuThich: `${t.tongMau - t.mauDaXuatBan} mẫu còn ở bản nháp`,
        },
        {
          nhan: 'Thao tác ghi trong 24h',
          so: t.thaoTac24h,
          donVi: 'bản ghi',
          chuThich: <Link to="/admin/audit-logs">Xem nhật ký thao tác</Link>,
        },
      ];
    case 'EXECUTIVE':
      return [
        {
          nhan: 'Điểm trung bình công ty',
          so: diemTomTat(t.diemTrungBinh),
          donVi: 'điểm',
          phanTram: t.diemTrungBinh ? Number(t.diemTrungBinh) : 0,
          chuThich: `tính trên ${t.soPhieuDaChot}/${t.soPhieuTrongKy} phiếu đã chốt`,
        },
        {
          nhan: 'Hoàn thành trở lên',
          so: phanTram(t.soNguoiDat, t.soPhieuDaChot),
          donVi: '%',
          phanTram: phanTram(t.soNguoiDat, t.soPhieuDaChot),
          chuThich: `${t.soNguoiDat} người đạt, ${t.soNguoiCanCaiThien} người cần cải thiện`,
        },
        {
          nhan: 'Tiến độ chốt điểm',
          so: phanTram(t.soPhieuDaChot, t.soPhieuTrongKy),
          donVi: '%',
          phanTram: phanTram(t.soPhieuDaChot, t.soPhieuTrongKy),
          chuThich: `${t.soPhieuDaChot}/${t.soPhieuTrongKy} phiếu · hạn chốt ${ngayThang(ky?.managerScoreDeadline, ky)}`,
        },
        {
          nhan: `Phòng dưới ${NGUONG_PHONG_CAN_CHU_Y} điểm`,
          so: t.phongCanChuY.length,
          donVi: 'phòng',
          phanTram: t.phongCanChuY.length > 0 ? 100 : 0,
          chuThich:
            t.phongCanChuY.length > 0
              ? t.phongCanChuY.map((p) => p.departmentName).join(', ')
              : 'Không phòng nào dưới ngưỡng',
          canChuY: t.phongCanChuY.length > 0,
        },
      ];
    case 'HR':
      return [
        {
          nhan: 'Phiếu trong kỳ',
          so: t.soPhieuTrongKy,
          donVi: 'phiếu',
          phanTram: phanTram(t.soPhieuTrongKy, t.soNhanSu),
          chuThich: `${t.soNhanSu} nhân sự · ${Math.max(t.soNhanSu - t.soPhieuTrongKy, 0)} người chưa có phiếu`,
        },
        {
          nhan: 'Đã chốt điểm',
          so: t.soPhieuDaChot,
          donVi: `/${t.soPhieuTrongKy}`,
          phanTram: phanTram(t.soPhieuDaChot, t.soPhieuTrongKy),
          chuThich: `Tiến độ chốt điểm ${phanTram(t.soPhieuDaChot, t.soPhieuTrongKy)}%`,
        },
        {
          nhan: 'Bạn đã tiếp nhận',
          so: t.daTiepNhan,
          donVi: `/${t.soPhieuDaChot}`,
          phanTram: phanTram(t.daTiepNhan, t.soPhieuDaChot),
          chuThich: `Hạn tiếp nhận ${ngayThang(ky?.submitDeadline, ky)}`,
        },
        {
          nhan: 'Phòng đã nộp đủ',
          so: t.phongDaNopDu,
          donVi: `/${t.tongPhongCoNhanSu}`,
          phanTram: phanTram(t.phongDaNopDu, t.tongPhongCoNhanSu),
          chuThich:
            t.phongConThieu.length > 0
              ? `${t.phongConThieu.slice(0, 3).join(', ')}${t.phongConThieu.length > 3 ? '…' : ''} còn thiếu`
              : 'Mọi phòng đã nộp đủ',
        },
      ];
    case 'MANAGER': {
      const chuaCoPhieu = Math.max(t.soNhanSu - t.soPhieuTrongKy, 0);
      return [
        {
          nhan: 'Phiếu phòng bạn trong kỳ',
          so: t.soPhieuTrongKy,
          donVi: 'phiếu',
          phanTram: phanTram(t.soPhieuTrongKy, t.soNhanSu),
          chuThich:
            chuaCoPhieu === 0
              ? `Đã giao đủ ${t.soPhieuTrongKy}/${t.soNhanSu} nhân sự`
              : `Còn ${chuaCoPhieu} người chưa có phiếu`,
          canChuY: chuaCoPhieu > 0,
        },
        {
          nhan: 'Nhân viên đã tự chấm',
          so: t.daTuCham,
          donVi: `/${t.soPhieuTrongKy}`,
          phanTram: phanTram(t.daTuCham, t.soPhieuTrongKy),
          chuThich: `Còn ${t.soPhieuTrongKy - t.daTuCham} người chưa nộp, hạn ${ngayThang(ky?.selfScoreDeadline, ky)}`,
        },
        {
          nhan: 'Bạn đã chốt điểm',
          so: t.daChot,
          donVi: `/${t.soPhieuTrongKy}`,
          phanTram: phanTram(t.daChot, t.soPhieuTrongKy),
          chuThich: `Hạn chấm ${ngayThang(ky?.managerScoreDeadline, ky)}`,
        },
        {
          nhan: 'Điểm trung bình phòng',
          so: diemTomTat(t.diemTrungBinh),
          donVi: 'điểm',
          phanTram: t.diemTrungBinh ? Number(t.diemTrungBinh) : 0,
          chuThich: `tính trên ${t.daChot} phiếu đã chốt`,
        },
      ];
    }
    default:
      return [
        {
          nhan: t.thangTruoc
            ? `Điểm ${t.thangTruoc.periodName.toLowerCase()}`
            : 'Điểm tháng trước',
          so: diemTomTat(t.thangTruoc?.diem),
          donVi: 'điểm',
          phanTram: t.thangTruoc?.diem ? Number(t.thangTruoc.diem) : 0,
          chuThich: t.thangTruoc?.grade
            ? `Xếp loại ${NHAN_XEP_LOAI[t.thangTruoc.grade]}`
            : 'Chưa chốt điểm',
        },
        {
          nhan: `Trung bình ${t.trungBinhGanDay?.soPhieu ?? 3} tháng gần nhất`,
          so: diemTomTat(t.trungBinhGanDay?.diem),
          donVi: 'điểm',
          phanTram: t.trungBinhGanDay ? Number(t.trungBinhGanDay.diem) : 0,
          // "07 → 08 → 09": lấy hai chữ số tháng từ "Tháng 07/2026"
          chuThich: t.trungBinhGanDay
            ? t.trungBinhGanDay.periodNames
                .map((n) => n.slice(-7, -5))
                .join(' → ')
            : 'Chưa có phiếu nào chốt điểm',
        },
        {
          nhan: 'Tiêu chí chưa tự chấm',
          so: t.tuCham ? t.tuCham.chua : '—',
          donVi: t.tuCham ? `/${t.tuCham.tong}` : undefined,
          phanTram: t.tuCham ? phanTram(t.tuCham.chua, t.tuCham.tong) : 0,
          chuThich: t.tuCham ? (
            <Link to={`/kpi/scorecards/${t.tuCham.scorecardId}/scoring`}>
              Hạn tự chấm {ngayThang(ky?.selfScoreDeadline, ky)} — mở phiếu
            </Link>
          ) : (
            'Chưa có phiếu kỳ này'
          ),
          canChuY: !!t.tuCham && t.tuCham.chua > 0,
        },
      ];
  }
}

export function HomePage() {
  const { user } = useAuth();
  const { data: viec = [], isLoading } = useQuery({
    queryKey: ['scorecards', 'pending-my-action'],
    queryFn: layViecCuaToi,
  });
  const { data: kyDanhGia = [] } = useQuery({
    queryKey: ['periods', 'MONTH'],
    queryFn: () => layKyDanhGia('MONTH'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: tomTat } = useQuery({
    queryKey: ['reports', 'home-summary'],
    queryFn: layTomTatTrangChu,
  });

  const homNay = dayjs();
  const ky = kyChuaHomNay(kyDanhGia, homNay);
  const kySau = ky ? kyKeTiep(kyDanhGia, ky) : undefined;

  // Vai quản lý thấy khối điều hành kỳ (stepper, thẻ, xếp loại, phòng) và
  // phiếu cần xử lý gấp; nhân viên thấy bộ thẻ của riêng mình.
  const xemBaoCao = coTheXemBaoCao(user?.role);
  const loiDan = user
    ? loiDanTheoVai(user.role, ky, kySau, user.departmentName)
    : null;

  return (
    <div className="trang-chu">
      <header className="trang-chu-dau">
        <div>
          {ky && (
            <Typography.Text className="eyebrow">
              Kỳ đánh giá {ky.name.toLowerCase()}
            </Typography.Text>
          )}
          <Typography.Title level={1} style={{ margin: '4px 0 8px' }}>
            Chào {user ? vietHoaDau(tenGoi(user.fullName)) : ''}
          </Typography.Title>
          {loiDan && (
            <Typography.Paragraph
              type="secondary"
              style={{ fontSize: 16, maxWidth: 560, margin: 0 }}
            >
              {loiDan.moTa}
            </Typography.Paragraph>
          )}
        </div>
        <div className="trang-chu-dau-nut">
          {ky && (
            <span className="chip-ky">
              <CalendarOutlined />
              {ky.name}
            </span>
          )}
          {loiDan && (
            <Link to={loiDan.nutLink}>
              <Button
                type="primary"
                shape="round"
                size="large"
                style={{ fontWeight: 600 }}
              >
                {loiDan.nutText}
              </Button>
            </Link>
          )}
        </div>
      </header>

      <Card
        loading={isLoading}
        title={
          <span className="viec-tieu-de">
            Việc của tôi
            <Typography.Text
              type="secondary"
              style={{ fontSize: 14, fontWeight: 400 }}
            >
              {viec.length > 0
                ? `${viec.length} việc đang chờ`
                : 'không có việc nào'}
            </Typography.Text>
          </span>
        }
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Không có email nhắc, không chuông — mở trang này là thấy đủ việc
          </Typography.Text>
        }
      >
        {viec.length === 0 ? (
          <Empty
            image={
              <CheckCircleOutlined style={{ fontSize: 40, color: '#52c41a' }} />
            }
            styles={{ image: { height: 48 } }}
            description="Không có việc nào đang chờ bạn"
          />
        ) : (
          <div className="viec-danh-sach">
            {viec.map((v) => (
              <div
                key={v.type}
                className={
                  v.isOverdue ? 'viec-dong viec-dong-qua-han' : 'viec-dong'
                }
              >
                <span className="viec-icon">
                  {ICON_VIEC[v.type] ?? <FileDoneOutlined />}
                </span>
                <Typography.Text strong style={{ fontSize: 16, flex: 1 }}>
                  {v.message}
                </Typography.Text>
                {nhanHan(v)}
                <Link to={v.link}>
                  <Button
                    shape="round"
                    icon={<ArrowRightOutlined />}
                    iconPosition="end"
                  >
                    Xử lý
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </Card>

      {xemBaoCao && ky ? (
        <BangDieuHanhKy ky={ky} />
      ) : (
        tomTat && (
          <div className="the-so-lieu-luoi">
            {theSoLieuTheoVai(tomTat, ky).map((the) => (
              <TheSoLieu key={the.nhan} {...the} />
            ))}
          </div>
        )
      )}

      {/* Hàng dưới: phiếu cần xử lý gấp (vai quản lý) bên trái, lịch bên phải */}
      <div className={xemBaoCao && ky ? 'trang-chu-duoi' : undefined}>
        {xemBaoCao && ky && <PhieuCanXuLyGap ky={ky} />}
        {ky && (
          <div className="lich-thang">
            <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
              Lịch tháng này
            </Typography.Title>
            <Typography.Text style={{ color: 'rgba(255,255,255,0.7)' }}>
              Bốn mốc cố định, lặp mỗi tháng.
            </Typography.Text>
            <div className="lich-thang-danh-sach">
              {lichThangNay(ky, kySau).map((moc) => (
                <div key={moc.ten} className="lich-thang-dong">
                  <span className="lich-thang-ngay">
                    {ngayTrongThang(moc.ngay)}
                  </span>
                  <span className="lich-thang-ten">
                    <strong>{moc.ten}</strong>
                    <small>{moc.ai}</small>
                  </span>
                  {trangThaiMoc(moc.ngay, homNay)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
