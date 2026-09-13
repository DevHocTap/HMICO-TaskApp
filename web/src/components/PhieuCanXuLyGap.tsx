import { Avatar, Button, Card, Empty, Tag, Typography } from 'antd';
import { CheckCircleOutlined, EditOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { layDanhSachPhieu } from '../api/scorecard';
import type { KyDanhGia, PhieuTomTat } from '../types/scorecard';
import { NHAN_XEP_LOAI } from '../types/scorecard';
import { useAuth } from '../auth/useAuth';
import { chuVietTat } from '../utils/period';
import { diemTomTat } from '../utils/format';
import { ngayVN } from '../utils/format';
import { mauChuDao, mauNhan } from '../config/theme';

/** Hai cột lệch quá mức này thì gắn nhãn đỏ cho HCNS soát lại. */
const LECH_DANG_CHU_Y = 10;
const TOI_DA = 8;

/**
 * "Phiếu cần xử lý gấp" (bộ mẫu 12/09) — thẻ từng người, theo vai:
 * - Trưởng bộ phận / ban giám đốc: phiếu nhân viên ĐÃ NỘP tự chấm chờ mình
 *   chấm (`SELF_SCORED`, `evaluatorId` = mình), thêm phiếu chưa nộp mà đã
 *   quá hạn tự chấm (nhắc).
 * - HCNS / ADMIN: phiếu trưởng bộ phận đã chốt chờ tiếp nhận
 *   (`MANAGER_SCORED`), nhãn "Lệch N đ" khi hai cột lệch quá 10.
 * Nhân viên không có khối này — việc của họ nằm ở "Việc của tôi".
 */
export function PhieuCanXuLyGap({ ky }: { ky: KyDanhGia }) {
  const { user } = useAuth();
  const laNguoiCham = user?.role === 'MANAGER' || user?.role === 'EXECUTIVE';
  const laHcns = user?.role === 'HR' || user?.role === 'ADMIN';

  const { data, isLoading } = useQuery({
    queryKey: ['scorecards', 'can-xu-ly-gap', ky.id, user?.id],
    queryFn: async () => {
      if (laNguoiCham) {
        const [choCham, chuaNop] = await Promise.all([
          layDanhSachPhieu({
            periodId: ky.id,
            evaluatorId: user!.id,
            resultStatus: 'SELF_SCORED',
            limit: 200,
          }),
          layDanhSachPhieu({
            periodId: ky.id,
            evaluatorId: user!.id,
            resultStatus: 'PENDING',
            assignStatus: 'ACCEPTED',
            limit: 200,
          }),
        ]);
        return { choCham: choCham.data, chuaNop: chuaNop.data };
      }
      const choNhan = await layDanhSachPhieu({
        periodId: ky.id,
        resultStatus: 'MANAGER_SCORED',
        limit: 200,
      });
      return { choCham: choNhan.data, chuaNop: [] as PhieuTomTat[] };
    },
    enabled: Boolean(user) && (laNguoiCham || laHcns),
  });
  if (!laNguoiCham && !laHcns) return null;

  const quaHanTuCham = ky.selfScoreDeadline
    ? dayjs().isAfter(dayjs(ky.selfScoreDeadline), 'day')
    : false;
  const treHan = quaHanTuCham ? (data?.chuaNop ?? []) : [];
  const the: { phieu: PhieuTomTat; loai: 'cham' | 'tre' | 'nhan' }[] = [
    ...(data?.choCham ?? []).map((p) => ({
      phieu: p,
      loai: laNguoiCham ? ('cham' as const) : ('nhan' as const),
    })),
    ...treHan.map((p) => ({ phieu: p, loai: 'tre' as const })),
  ];
  const tongSo = the.length;
  const hien = the.slice(0, TOI_DA);
  // Không có phiếu gấp thì ẩn hẳn: dải "Hàng đợi trống" ở Tổng quan đã nói
  // điều đó, thêm một thẻ rỗng nữa là thừa (13/09).
  if (!isLoading && tongSo === 0) return null;

  const tieuDe = laNguoiCham ? 'Phiếu cần chấm gấp' : 'Phiếu chờ tiếp nhận';
  const lech = (p: PhieuTomTat) =>
    p.selfTotalScore !== null && p.managerTotalScore !== null
      ? Math.round(
          (Number(p.managerTotalScore) - Number(p.selfTotalScore)) * 100,
        ) / 100
      : null;

  return (
    <Card
      loading={isLoading}
      title={
        <span className="viec-tieu-de">
          {tieuDe}
          {tongSo > 0 && <Tag color="error">{tongSo} phiếu</Tag>}
        </span>
      }
      extra={
        tongSo > TOI_DA && (
          <Link to={laNguoiCham ? '/kpi/assign' : '/kpi/progress'}>
            Xem tất cả ({tongSo})
          </Link>
        )
      }
    >
      {tongSo === 0 ? (
        <Empty
          image={
            <CheckCircleOutlined style={{ fontSize: 36, color: '#16a34a' }} />
          }
          styles={{ image: { height: 44 } }}
          description={
            laNguoiCham
              ? 'Không có phiếu nào chờ bạn chấm'
              : 'Không có phiếu nào chờ tiếp nhận'
          }
        />
      ) : (
        <div className="phieu-gap-luoi">
          {hien.map(({ phieu: p, loai }) => {
            const l = lech(p);
            const lechLon = l !== null && Math.abs(l) > LECH_DANG_CHU_Y;
            const canhBao = loai === 'tre' || lechLon;
            return (
              <div
                key={p.id}
                className={`phieu-gap-the${canhBao ? ' phieu-gap-the-do' : ''}`}
              >
                <div className="phieu-gap-dau">
                  <Avatar
                    style={{
                      background: '#dbe6ff',
                      color: mauChuDao,
                      fontWeight: 700,
                    }}
                  >
                    {chuVietTat(p.ownerName ?? '?')}
                  </Avatar>
                  <span className="ten-va-phu" style={{ flex: 1, minWidth: 0 }}>
                    <Typography.Text strong ellipsis>
                      {p.ownerName ?? '—'}
                    </Typography.Text>
                    <small>{p.jobTitleName}</small>
                  </span>
                  {loai === 'tre' ? (
                    <Tag color="error">Trễ hạn nộp</Tag>
                  ) : lechLon ? (
                    <Tag color="error">
                      Lệch {l! > 0 ? '+' : ''}
                      {l}đ
                    </Tag>
                  ) : (
                    <Tag color="success">
                      {loai === 'nhan' ? 'Đã chốt' : 'Đã nộp'}
                    </Tag>
                  )}
                </div>
                <div className="phieu-gap-so">
                  <span>
                    <small>Tự chấm</small>
                    <strong
                      style={{ color: loai === 'tre' ? mauNhan : undefined }}
                    >
                      {p.selfTotalScore === null
                        ? '—'
                        : diemTomTat(p.selfTotalScore)}
                      <em>/100</em>
                    </strong>
                  </span>
                  <span>
                    <small>
                      {loai === 'nhan' ? 'Trưởng BP chốt' : 'Tiêu chí'}
                    </small>
                    <strong>
                      {loai === 'nhan'
                        ? `${diemTomTat(p.managerTotalScore)} · ${p.grade ? NHAN_XEP_LOAI[p.grade] : '—'}`
                        : `${p.itemCount} mục`}
                    </strong>
                  </span>
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {loai === 'tre'
                    ? `Hạn tự chấm ${ngayVN(ky.selfScoreDeadline)} đã qua`
                    : loai === 'nhan'
                      ? `Chốt ${ngayVN(p.managerScoredAt)} · ${p.departmentName}`
                      : `Nộp ${ngayVN(p.selfScoredAt)}`}
                </Typography.Text>
                <Link to={`/kpi/scorecards/${p.id}/scoring`}>
                  <Button
                    type={canhBao ? 'primary' : 'default'}
                    danger={canhBao}
                    block
                    icon={<EditOutlined />}
                  >
                    {loai === 'tre'
                      ? 'Mở phiếu'
                      : loai === 'nhan'
                        ? 'Soát & tiếp nhận'
                        : 'Chấm điểm ngay'}
                  </Button>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
