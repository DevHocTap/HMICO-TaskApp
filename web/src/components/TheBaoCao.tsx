import { Card, Empty, Tag, Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type {
  DiemTrungBinhPhong,
  SoLieuDashboard,
  XepLoaiKpi,
} from '../types/report';
import { NHAN_XEP_LOAI } from '../types/scorecard';
import { ThanhXepChong } from './bieu-do/ThanhXepChong';
import { VongTron } from './bieu-do/VongTron';
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

/**
 * Thẻ "Phân bố xếp loại" — dùng ở Tổng quan và Báo cáo kỳ.
 *
 * `dang="thanh"`: thanh chia phần + bốn ô (Báo cáo kỳ). `dang="vong"`: vành
 * khuyên có số đã chốt ở giữa + bảng chú giải (Tổng quan, mẫu 13/09).
 */
export function TheXepLoai({
  data,
  dang = 'thanh',
}: {
  data: SoLieuDashboard;
  dang?: 'thanh' | 'vong';
}) {
  const daChot = data.soPhieuDaChot;
  const ghiChuChot = `tính trên ${daChot}/${data.soPhieuTrongKy} phiếu đã chốt`;
  return (
    <Card
      title={tieuDeThe('Phân bố xếp loại', dang === 'vong' ? undefined : ghiChuChot)}
      extra={dang === 'vong' && <Tag className="tag-tron">{daChot} phiếu đã chốt</Tag>}
    >
      {daChot === 0 ? (
        <Empty description="Chưa phiếu nào chốt điểm trong kỳ này" />
      ) : dang === 'vong' ? (
        <div className="xep-loai-vong">
          <VongTron
            soGiua={daChot}
            nhanGiua="đã chốt"
            doan={THU_TU_XEP_LOAI.map((xl) => ({
              ten: NHAN_XEP_LOAI[xl],
              giaTri: data.phanBoXepLoai[xl],
              mau: MAU_XEP_LOAI_BD[xl],
            }))}
          />
          <div className="xep-loai-vong-chu-giai">
            {THU_TU_XEP_LOAI.map((xl) => (
              <div key={xl} className="xep-loai-vong-dong">
                <span className="xep-loai-o-ten">
                  <i style={{ background: MAU_XEP_LOAI_BD[xl] }} />
                  {NHAN_XEP_LOAI[xl]}
                </span>
                <strong>{phanTram(data.phanBoXepLoai[xl], daChot)}%</strong>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  ({data.phanBoXepLoai[xl]})
                </Typography.Text>
              </div>
            ))}
          </div>
        </div>
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
  return (
    <TheHieuSuatNhom
      tieuDe="Hiệu suất theo phòng ban"
      data={data}
      nhom={data.diemTrungBinhTheoPhong.map((p: DiemTrungBinhPhong) => ({
        id: p.departmentId,
        ten: p.departmentName,
        soPhieuDaChot: p.soPhieuDaChot,
        diemTrungBinh: p.diemTrungBinh,
      }))}
      trong="phòng"
      ghiChu="KHÔNG cộng dồn lên phòng cha — trung bình của các trung bình không phải trung bình chung."
    />
  );
}

/** Thẻ "Hiệu suất theo chức danh" — trưởng phòng nhìn phòng mình theo nhóm nghề (13/09). */
export function TheHieuSuatChucDanh({ data }: { data: SoLieuDashboard }) {
  return (
    <TheHieuSuatNhom
      tieuDe="Hiệu suất theo chức danh"
      data={data}
      nhom={data.diemTrungBinhTheoChucDanh.map((c) => ({
        id: c.jobTitleName,
        ten: c.jobTitleName,
        soPhieuDaChot: c.soPhieuDaChot,
        diemTrungBinh: c.diemTrungBinh,
      }))}
      trong="chức danh"
    />
  );
}

interface NhomDiem {
  id: string;
  ten: string;
  soPhieuDaChot: number;
  diemTrungBinh: string | null;
}

function TheHieuSuatNhom({
  tieuDe,
  data,
  nhom,
  trong,
  ghiChu,
}: {
  tieuDe: string;
  data: SoLieuDashboard;
  nhom: NhomDiem[];
  trong: string;
  ghiChu?: string;
}) {
  const ghiChuChot = `tính trên ${data.soPhieuDaChot}/${data.soPhieuTrongKy} phiếu đã chốt`;
  const phongTheoDiem = nhom
    .filter((p) => p.diemTrungBinh !== null)
    .sort((a, b) => Number(b.diemTrungBinh) - Number(a.diemTrungBinh));
  const soDat = phongTheoDiem.filter((p) => Number(p.diemTrungBinh) >= NGUONG_PHONG_CAN_CHU_Y).length;
  return (
    <Card
      title={tieuDeThe(tieuDe, ghiChuChot)}
      extra={
        <Link to="/kpi/progress">
          Chi tiết <ArrowRightOutlined />
        </Link>
      }
    >
      {phongTheoDiem.length === 0 ? (
        <Empty description={`Chưa ${trong} nào có phiếu chốt điểm`} />
      ) : (
        <div className="hang-phong">
          {phongTheoDiem.map((p, i) => {
            const diem = Number(p.diemTrungBinh);
            const duoiNguong = diem < NGUONG_PHONG_CAN_CHU_Y;
            return (
              <div key={p.id} className="hang-phong-dong">
                <span className="hang-phong-stt">{i + 1}</span>
                <span className="ten-va-phu">
                  <Typography.Text strong>{p.ten}</Typography.Text>
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
            Chỉ tiêu tối thiểu {NGUONG_PHONG_CAN_CHU_Y} ·{' '}
            {soDat === phongTheoDiem.length
              ? `cả ${phongTheoDiem.length} ${trong} đạt chuẩn`
              : `${phongTheoDiem.length - soDat}/${phongTheoDiem.length} ${trong} dưới chuẩn (đỏ)`}
            {ghiChu ? `. ${ghiChu}` : ''}
          </Typography.Text>
        </div>
      )}
    </Card>
  );
}
