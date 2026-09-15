import { Avatar, Skeleton } from 'antd';
import { ArrowRightOutlined, EditOutlined } from '@ant-design/icons';
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
    <div className="tq-khoi tq-gap">
      <div className="tq-khoi-dau tq-khoi-dau-ke-nho">
        <h3 className="tq-h3">
          <EditOutlined className="tq-icon-do" /> {tieuDe}
          {tongSo > 0 && <span className="tq-huy-hieu tq-huy-hieu-do">{tongSo} phiếu</span>}
        </h3>
        {tongSo > TOI_DA && (
          <Link to={laNguoiCham ? '/kpi/assign' : '/kpi/progress'} className="tq-link-nho">
            Xem tất cả ({tongSo}) →
          </Link>
        )}
      </div>
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <div className="tq-gap-ds">
          {hien.map(({ phieu: p, loai }) => {
            const l = lech(p);
            const lechLon = l !== null && Math.abs(l) > LECH_DANG_CHU_Y;
            const canhBao = loai === 'tre' || lechLon;
            return (
              <Link
                key={p.id}
                to={`/kpi/scorecards/${p.id}/scoring`}
                className={`tq-gap-dong${canhBao ? ' tq-gap-dong-do' : ''}`}
              >
                <Avatar size={34} style={{ background: '#dbe6ff', color: mauChuDao, fontWeight: 700, flex: 'none' }}>
                  {chuVietTat(p.ownerName ?? '?')}
                </Avatar>
                <div className="tq-gap-giua">
                  <div className="tq-gap-ten">
                    <b>{p.ownerName ?? '—'}</b>
                    {loai === 'tre' ? (
                      <span className="tq-huy-hieu tq-huy-hieu-do">Trễ hạn nộp</span>
                    ) : lechLon ? (
                      <span className="tq-huy-hieu tq-huy-hieu-do">
                        Lệch {l! > 0 ? '+' : ''}
                        {l}đ
                      </span>
                    ) : (
                      <span className="tq-huy-hieu tq-huy-hieu-xanh-la">{loai === 'nhan' ? 'Đã chốt' : 'Đã nộp'}</span>
                    )}
                  </div>
                  <div className="tq-gap-phu">
                    {p.jobTitleName}
                    {loai === 'tre'
                      ? ` · hạn tự chấm ${ngayVN(ky.selfScoreDeadline)} đã qua`
                      : loai === 'nhan'
                        ? ` · chốt ${ngayVN(p.managerScoredAt)}`
                        : ` · nộp ${ngayVN(p.selfScoredAt)}`}
                  </div>
                </div>
                <div className="tq-gap-diem">
                  {loai === 'nhan' ? (
                    <>
                      <b>{diemTomTat(p.managerTotalScore)}</b>
                      <small>{p.grade ? NHAN_XEP_LOAI[p.grade] : 'Trưởng BP'}</small>
                    </>
                  ) : (
                    <>
                      <b style={{ color: loai === 'tre' ? mauNhan : undefined }}>
                        {p.selfTotalScore === null ? '—' : diemTomTat(p.selfTotalScore)}
                      </b>
                      <small>tự chấm · {p.itemCount} mục</small>
                    </>
                  )}
                </div>
                <ArrowRightOutlined className="tq-gap-mui" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
