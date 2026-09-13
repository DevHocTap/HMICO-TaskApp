import { Card, Typography } from 'antd';
import type { DiemXuHuong } from '../types/report';
import { Duong } from './bieu-do/Duong';
import { mauChuDao } from '../config/theme';

/**
 * Thẻ "Xu hướng điểm KPI" — đường điểm trung bình các kỳ, kèm vạch chỉ tiêu
 * tối thiểu (ngưỡng "cần cải thiện" trong Cài đặt: dưới mức này là chưa đạt).
 */
export function TheXuHuong({
  xuHuong,
  tenPhamVi,
  chiTieu,
}: {
  xuHuong: DiemXuHuong[];
  tenPhamVi: string;
  chiTieu: number;
}) {
  const diem = xuHuong.map((k) => ({
    nhan: `T${k.period.code.slice(5, 7)}`,
    giaTri: k.diemTrungBinh === null ? null : Number(k.diemTrungBinh),
    phu: `${k.soPhieuDaChot}/${k.soPhieuTrongKy} phiếu đã chốt`,
  }));
  const dau = xuHuong[0]?.period.code.slice(5, 7);
  const cuoi = xuHuong[xuHuong.length - 1]?.period.code.slice(5, 7);
  const hienTai = diem[diem.length - 1]?.giaTri ?? null;
  return (
    <Card
      title={
        <span className="viec-tieu-de">
          Xu hướng điểm KPI {tenPhamVi}
          {dau && cuoi && (
            <Typography.Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>
              (T{Number(dau)} – T{Number(cuoi)})
            </Typography.Text>
          )}
        </span>
      }
      extra={
        <span className="bd-chu-giai" style={{ marginTop: 0 }}>
          <span className="bd-chu-giai-muc">
            <i style={{ background: mauChuDao }} />
            Thực tế{hienTai !== null ? ` (${hienTai.toLocaleString('vi-VN')})` : ''}
          </span>
          <span className="bd-chu-giai-muc">
            <i className="bd-chu-giai-vach" />
            Chỉ tiêu ({chiTieu})
          </span>
        </span>
      }
    >
      <Typography.Text type="secondary" style={{ fontSize: 13 }}>
        Điểm trung bình các phiếu đã chốt, so với mức chỉ tiêu tối thiểu ({chiTieu} điểm).
      </Typography.Text>
      <div style={{ marginTop: 8 }}>
        <Duong
          diem={diem}
          mau={mauChuDao}
          yMin={0}
          yMax={100}
          vach={[{ giaTri: chiTieu, nhan: `Chỉ tiêu ${chiTieu}` }]}
          cao={240}
        />
      </div>
      <div className="xu-huong-truc">
        {diem.map((d) => (
          <span key={d.nhan}>
            {d.nhan}
            {d.giaTri !== null && <b> ({d.giaTri.toLocaleString('vi-VN')})</b>}
          </span>
        ))}
      </div>
    </Card>
  );
}
