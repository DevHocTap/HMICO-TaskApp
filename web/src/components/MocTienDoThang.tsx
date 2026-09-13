import { Card, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { KyDanhGia } from '../types/scorecard';
import { ngayVN } from '../utils/format';

interface Moc {
  ngay: string | null;
  ten: string;
  phu: string;
  nhan: string;
  mauNhan: string;
}

/**
 * Bốn mốc cố định trong tháng (quy-tac-nghiep-vu.md mục 5.5), sắp theo ngày.
 *
 * "Giao KPI tháng mới" là hạn của kỳ KẾ TIẾP (ngày 25 tháng này là hạn lên
 * KPI cho tháng sau); ba mốc còn lại thuộc kỳ hiện tại.
 */
function cacMoc(ky: KyDanhGia, kySau: KyDanhGia | undefined): Moc[] {
  const thangSau = kySau ? dayjs(kySau.startDate).format('MM') : '';
  return [
    {
      ngay: kySau?.assignDeadline ?? null,
      ten: `Giao KPI tháng mới${thangSau ? ` (T${thangSau})` : ''}`,
      phu: 'Trưởng bộ phận phân bổ chỉ tiêu cho từng người',
      nhan: 'Ưu tiên',
      mauNhan: 'blue',
    },
    {
      ngay: ky.selfScoreDeadline,
      ten: 'Nhân viên tự chấm hoàn tất',
      phu: 'Hết hạn là khoá cửa tự chấm',
      nhan: 'Hạn nộp',
      mauNhan: 'gold',
    },
    {
      ngay: ky.managerScoreDeadline,
      ten: 'Duyệt & chốt điểm chính thức',
      phu: 'Trưởng bộ phận chấm cột thứ hai và chốt',
      nhan: 'Trưởng phòng',
      mauNhan: 'default',
    },
    {
      ngay: ky.submitDeadline,
      ten: 'Nghiệm thu & lưu hồ sơ',
      phu: 'Hành chính tiếp nhận, tổng hợp toàn công ty',
      nhan: 'HCNS',
      mauNhan: 'default',
    },
  ].sort((a, b) => (a.ngay ?? '').localeCompare(b.ngay ?? ''));
}

/** Thẻ "Mốc tiến độ tháng" — dòng thời gian dọc, mốc đã qua mờ đi, mốc đang mở nổi. */
export function MocTienDoThang({
  ky,
  kySau,
}: {
  ky: KyDanhGia;
  kySau: KyDanhGia | undefined;
}) {
  const homNay = dayjs();
  const moc = cacMoc(ky, kySau);
  const thang = dayjs(ky.startDate).format('MM');
  return (
    <Card
      title={<span className="viec-tieu-de">Mốc tiến độ tháng {thang}</span>}
      extra={<Tag color="blue">{moc.length} mốc</Tag>}
    >
      <ol className="moc-tien-do">
        {moc.map((m) => {
          const han = m.ngay ? dayjs(m.ngay) : null;
          const daQua = han ? homNay.isAfter(han, 'day') : false;
          const dangMo = han ? !daQua && han.diff(homNay, 'day') <= 7 : false;
          return (
            <li
              key={m.ten}
              className={`moc-tien-do-dong${daQua ? ' moc-qua' : ''}${dangMo ? ' moc-mo' : ''}`}
            >
              <span className="moc-tien-do-cham" />
              <div className="moc-tien-do-the">
                <div className="moc-tien-do-dau">
                  <Typography.Text strong className="moc-tien-do-ngay">
                    {ngayVN(m.ngay)}
                  </Typography.Text>
                  <Tag color={daQua ? 'default' : m.mauNhan} className="tag-tron">
                    {daQua ? 'Đã qua' : m.nhan}
                  </Tag>
                </div>
                <Typography.Text strong>{m.ten}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {m.phu}
                </Typography.Text>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
