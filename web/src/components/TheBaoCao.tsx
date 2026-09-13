import { Card, Empty, Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type {
  DiemTrungBinhPhong,
  SoLieuDashboard,
  XepLoaiKpi,
} from '../types/report';
import { NHAN_XEP_LOAI } from '../types/scorecard';
import { ThanhXepChong } from './bieu-do/ThanhXepChong';
import { diemTomTat, phanTram } from '../utils/format';
import {
  NGUONG_PHONG_CAN_CHU_Y,
  mauChuDao,
  mauNhan,
  mauVang,
} from '../config/theme';

/**
 * Bảng màu xếp loại — đã chạy qua validator của bộ quy tắc biểu đồ (12/09):
 * bốn màu tách nhau cả với người mù màu. Mọi phần đều có SỐ in kèm.
 */
export const MAU_XEP_LOAI_BD: Record<XepLoaiKpi, string> = {
  EXCEEDED: '#1466a0',
  COMPLETED: '#3fa3c9',
  NEEDS_IMPROVEMENT: '#e0932b',
  NOT_ACHIEVED: '#d63b3b',
};
export const THU_TU_XEP_LOAI: XepLoaiKpi[] = [
  'EXCEEDED',
  'COMPLETED',
  'NEEDS_IMPROVEMENT',
  'NOT_ACHIEVED',
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

/** Thẻ "Phân bố xếp loại": thanh chia phần + bốn ô — dùng ở Tổng quan và Báo cáo kỳ. */
export function TheXepLoai({ data }: { data: SoLieuDashboard }) {
  const daChot = data.soPhieuDaChot;
  const ghiChuChot = `tính trên ${daChot}/${data.soPhieuTrongKy} phiếu đã chốt`;
  return (
    <Card title={tieuDeThe('Phân bố xếp loại', ghiChuChot)}>
      {daChot === 0 ? (
        <Empty description="Chưa phiếu nào chốt điểm trong kỳ này" />
      ) : (
        <>
          <ThanhXepChong
            tong={daChot}
            doan={THU_TU_XEP_LOAI.map((xl) => ({
              ten: NHAN_XEP_LOAI[xl],
              giaTri: data.phanBoXepLoai[xl],
              mau: MAU_XEP_LOAI_BD[xl],
            }))}
          />
          <div className="xep-loai-o-luoi">
            {THU_TU_XEP_LOAI.map((xl) => (
              <div key={xl} className="xep-loai-o">
                <span className="xep-loai-o-ten">
                  <i style={{ background: MAU_XEP_LOAI_BD[xl] }} />
                  {NHAN_XEP_LOAI[xl]}
                </span>
                <div className="xep-loai-o-so">
                  {phanTram(data.phanBoXepLoai[xl], daChot)}%
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {data.phanBoXepLoai[xl]} người
                </Typography.Text>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/** Thẻ "Hiệu suất theo phòng ban": xếp hạng + thanh, đỏ dưới ngưỡng. */
export function TheHieuSuatPhong({ data }: { data: SoLieuDashboard }) {
  const ghiChuChot = `tính trên ${data.soPhieuDaChot}/${data.soPhieuTrongKy} phiếu đã chốt`;
  const phongTheoDiem = [...data.diemTrungBinhTheoPhong]
    .filter((p) => p.diemTrungBinh !== null)
    .sort((a, b) => Number(b.diemTrungBinh) - Number(a.diemTrungBinh));
  return (
    <Card
      title={tieuDeThe('Hiệu suất theo phòng ban', ghiChuChot)}
      extra={
        <Link to="/kpi/progress">
          Chi tiết <ArrowRightOutlined />
        </Link>
      }
    >
      {phongTheoDiem.length === 0 ? (
        <Empty description="Chưa phòng nào có phiếu chốt điểm" />
      ) : (
        <div className="hang-phong">
          {phongTheoDiem.map((p: DiemTrungBinhPhong, i) => {
            const diem = Number(p.diemTrungBinh);
            const duoiNguong = diem < NGUONG_PHONG_CAN_CHU_Y;
            return (
              <div key={p.departmentId} className="hang-phong-dong">
                <span className="hang-phong-stt">{i + 1}</span>
                <span className="ten-va-phu">
                  <Typography.Text strong>{p.departmentName}</Typography.Text>
                  <small>{p.soPhieuDaChot} phiếu đã chốt</small>
                </span>
                <Typography.Text
                  strong
                  style={{ color: duoiNguong ? mauNhan : undefined }}
                >
                  {diemTomTat(p.diemTrungBinh)}
                </Typography.Text>
                <div className="hang-phong-thanh">
                  <span
                    style={{
                      width: `${Math.min(diem, 100)}%`,
                      background: duoiNguong ? mauVang : mauChuDao,
                    }}
                  />
                </div>
              </div>
            );
          })}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Đỏ: dưới ngưỡng {NGUONG_PHONG_CAN_CHU_Y}. KHÔNG cộng dồn lên phòng
            cha — trung bình của các trung bình không phải trung bình chung.
          </Typography.Text>
        </div>
      )}
    </Card>
  );
}
