import { CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { KyDanhGia } from '../types/scorecard';
import { ngayVN } from '../utils/format';

const nhanThang = (ky: KyDanhGia | undefined) => (ky ? `T${dayjs(ky.startDate).format('MM')}` : '');

/**
 * Khối "Mốc tiến độ tháng" (mẫu 13/09) — dùng chung cho Tổng quan quản lý và
 * nhân viên. Bốn mốc cố định (quy-tac mục 5.5), mỗi mốc một màu theo vai
 * (xanh giao KPI · cam hạn nộp · tím trưởng phòng · xanh lá HCNS); mốc sắp
 * tới gần nhất viền đậm; mốc đã qua mờ đi. Kiểu `tq-*` ở `tong-quan.css`.
 */
export function MocTienDoThang({ ky, kySau }: { ky: KyDanhGia; kySau: KyDanhGia | undefined }) {
  const homNay = dayjs();
  const moc = [
    { ngay: kySau?.assignDeadline ?? null, ten: `Giao KPI tháng mới (${nhanThang(kySau)})`, phu: 'Phân bổ chỉ tiêu cho từng người', nhan: 'Ưu tiên', lop: 'xanh' },
    { ngay: ky.selfScoreDeadline, ten: 'Nhân viên tự chấm hoàn tất', phu: 'Khoá quyền chỉnh sửa tự đánh giá', nhan: 'Hạn nộp', lop: 'cam' },
    { ngay: ky.managerScoreDeadline, ten: 'Duyệt & chốt điểm chính thức', phu: 'Trưởng bộ phận chấm cột thứ hai', nhan: 'Trưởng phòng', lop: 'tim' },
    { ngay: ky.submitDeadline, ten: 'Nghiệm thu & lưu hồ sơ', phu: 'Tổng kết thi đua toàn công ty', nhan: 'HCNS', lop: 'xanh-la' },
  ].sort((a, b) => (a.ngay ?? '').localeCompare(b.ngay ?? ''));
  const mocSapToi = moc.find((m) => m.ngay && !homNay.isAfter(dayjs(m.ngay), 'day'));

  return (
    <div className="tq-khoi">
      <div className="tq-khoi-dau tq-khoi-dau-ke-nho">
        <h3 className="tq-h3">
          <CalendarOutlined className="tq-icon-xanh" /> Mốc tiến độ tháng {dayjs(ky.startDate).format('MM')}
        </h3>
        <span className="tq-nhan-xanh">{moc.length} mốc</span>
      </div>
      <div className="tq-moc">
        {moc.map((m) => {
          const daQua = m.ngay ? homNay.isAfter(dayjs(m.ngay), 'day') : false;
          const noiBat = m === mocSapToi;
          const lop = daQua ? 'qua' : m.lop;
          return (
            <div key={m.ten} className={`tq-moc-dong tq-moc-${lop}${noiBat ? ' tq-moc-noi' : ''}`}>
              <span className="tq-moc-cham" />
              <div className="tq-moc-the">
                <div className="tq-the-hang">
                  <span className="tq-moc-ngay">{ngayVN(m.ngay)}</span>
                  <span className="tq-moc-nhan">{daQua ? 'Đã qua' : m.nhan}</span>
                </div>
                <p className="tq-moc-ten">{m.ten}</p>
                <p className="tq-ghi-chu">{m.phu}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
