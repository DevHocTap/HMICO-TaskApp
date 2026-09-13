import { Button, Card, Empty, Tag, Typography } from 'antd';
import {
  CheckCircleFilled,
  ClockCircleOutlined,
  EditOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import { layDanhSachPhieu } from '../api/scorecard';
import type { KyDanhGia, PhieuTomTat } from '../types/scorecard';
import { MAU_XEP_LOAI, NHAN_XEP_LOAI } from '../types/scorecard';
import { useAuth } from '../auth/useAuth';
import { Duong } from './bieu-do/Duong';
import { diemTomTat, ngayVN } from '../utils/format';
import { mauChuDao, mauNhan, mauVang, mauXanhLa } from '../config/theme';

/** Màu số điểm theo xếp loại — không phải cái gì cũng xanh. */
const MAU_DIEM: Record<string, string> = {
  NOT_ACHIEVED: mauNhan,
  NEEDS_IMPROVEMENT: mauVang,
  COMPLETED: mauXanhLa,
  EXCEEDED: mauChuDao,
};

/** "Tháng 09/2026" -> "09/26" cho trục thời gian. */
const nhanThang = (ten: string) => {
  const m = /(\d{2})\/(\d{4})/.exec(ten);
  return m ? `${m[1]}/${m[2]!.slice(2)}` : ten;
};

/**
 * Bốn bước của một phiếu theo góc nhìn NHÂN VIÊN: bước nào đã qua, đang ở
 * đâu, việc gì đến lượt mình. Từ `assignStatus` + `resultStatus`.
 */
function cacBuoc(p: PhieuTomTat | undefined, ky: KyDanhGia) {
  const daKy = p?.assignStatus === 'ACCEPTED';
  const rs = p?.resultStatus;
  const daTuCham = daKy && rs !== 'PENDING' && rs !== 'REJECTED';
  const daChot = daKy && (rs === 'MANAGER_SCORED' || rs === 'RECEIVED');
  const daNhan = daKy && rs === 'RECEIVED';
  return [
    {
      ten: 'Ký nhận KPI',
      han: ky.assignDeadline,
      xong: daKy,
      phu: p
        ? daKy
          ? `Đã ký ${ngayVN(p.acceptedAt)}`
          : p.assignStatus === 'DRAFT'
            ? 'Trưởng bộ phận đang soạn'
            : 'Chờ bạn ký nhận'
        : 'Chưa có phiếu',
    },
    {
      ten: 'Tự chấm điểm',
      han: ky.selfScoreDeadline,
      xong: daTuCham,
      phu: daTuCham
        ? `Đã nộp ${ngayVN(p!.selfScoredAt)} · ${diemTomTat(p!.selfTotalScore)} điểm`
        : rs === 'REJECTED'
          ? 'Bị trả lại — chấm lại'
          : 'Chưa nộp',
    },
    {
      ten: 'Trưởng bộ phận chấm',
      han: ky.managerScoreDeadline,
      xong: daChot,
      phu: daChot
        ? `Chốt ${ngayVN(p!.managerScoredAt)} · ${diemTomTat(p!.managerTotalScore)} điểm`
        : 'Chờ trưởng bộ phận',
    },
    {
      ten: 'Hành chính tiếp nhận',
      han: ky.submitDeadline,
      xong: daNhan,
      phu: daNhan ? 'Đã tiếp nhận, kết quả chính thức' : 'Chờ HCNS',
    },
  ];
}

/**
 * Trang chủ nhân viên (13/09): phiếu kỳ này là trung tâm — bốn bước, hạn,
 * hai cột điểm, nút đúng việc đến lượt; kèm lịch sử điểm 6 kỳ gần nhất.
 */
export function PhieuKyNayCuaToi({ ky }: { ky: KyDanhGia }) {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['scorecards', 'cua-toi', user?.id],
    queryFn: () => layDanhSachPhieu({ ownerUserId: user!.id, limit: 12 }),
    enabled: Boolean(user),
  });
  if (isLoading) return <Card loading />;

  const tatCa = data?.data ?? [];
  const p = tatCa.find((x) => x.periodId === ky.id);
  const buoc = cacBuoc(p, ky);
  const buocHienTai = buoc.findIndex((b) => !b.xong);
  const homNay = dayjs();

  // Việc đến lượt mình + nút
  let nut: { text: string; to: string; primary: boolean } | null = null;
  if (p) {
    if (p.assignStatus === 'PROPOSED' || p.assignStatus === 'DISPUTED')
      nut = { text: 'Xem & ký nhận KPI', to: '/kpi/my', primary: true };
    else if (
      p.assignStatus === 'ACCEPTED' &&
      (p.resultStatus === 'PENDING' || p.resultStatus === 'REJECTED')
    )
      nut = {
        text:
          p.resultStatus === 'REJECTED'
            ? 'Chấm lại phiếu'
            : 'Tự chấm điểm ngay',
        to: `/kpi/scorecards/${p.id}/scoring`,
        primary: true,
      };
    else
      nut = {
        text: 'Xem phiếu',
        to: `/kpi/scorecards/${p.id}/scoring`,
        primary: false,
      };
  }

  // Lịch sử điểm: các kỳ đã chốt, cũ -> mới
  const lichSu = tatCa
    .filter((x) => x.managerTotalScore !== null)
    .sort((a, b) => a.periodCode.localeCompare(b.periodCode))
    .slice(-6);

  return (
    <div className="phieu-toi-luoi">
      <Card
        className="the-day-cot"
        title={
          <span className="viec-tieu-de">
            Phiếu KPI {ky.name.toLowerCase()}
            {p?.grade && (
              <Tag color={MAU_XEP_LOAI[p.grade]}>{NHAN_XEP_LOAI[p.grade]}</Tag>
            )}
          </span>
        }
        extra={
          nut && (
            <Link to={nut.to}>
              <Button
                type={nut.primary ? 'primary' : 'default'}
                shape="round"
                icon={nut.primary ? <EditOutlined /> : <RightOutlined />}
                iconPosition="end"
              >
                {nut.text}
              </Button>
            </Link>
          )
        }
      >
        {!p ? (
          <Empty
            image={
              <ClockCircleOutlined style={{ fontSize: 36, color: '#9ca3af' }} />
            }
            styles={{ image: { height: 44 } }}
            description="Trưởng bộ phận chưa giao KPI kỳ này cho bạn. Khi có phiếu, việc ký nhận sẽ hiện ở đây."
          />
        ) : (
          <>
            <div className="phieu-toi-diem">
              <div>
                <span className="eyebrow">Tự chấm</span>
                <div className="cham-o-so">
                  {p.selfTotalScore === null
                    ? '—'
                    : diemTomTat(p.selfTotalScore)}
                  <small>/ 100</small>
                </div>
              </div>
              <div>
                <span className="eyebrow">Trưởng bộ phận chấm</span>
                <div
                  className="cham-o-so"
                  style={{ color: p.grade ? MAU_DIEM[p.grade] : undefined }}
                >
                  {p.managerTotalScore === null
                    ? '—'
                    : diemTomTat(p.managerTotalScore)}
                  <small>/ 100</small>
                </div>
              </div>
              <div>
                <span className="eyebrow">Tiêu chí</span>
                <div className="cham-o-so">
                  {p.itemCount}
                  <small>mục · {Number(p.totalWeight)}% trọng số</small>
                </div>
              </div>
            </div>

            <div className="buoc-phieu">
              {buoc.map((b, i) => {
                const dang = i === buocHienTai;
                const treHan =
                  dang && b.han !== null && homNay.isAfter(dayjs(b.han), 'day');
                return (
                  <div
                    key={b.ten}
                    className={`buoc-phieu-muc${b.xong ? ' buoc-xong' : dang ? ' buoc-dang' : ''}${treHan ? ' buoc-tre' : ''}`}
                  >
                    <span className="buoc-phieu-cham">
                      {b.xong ? (
                        <CheckCircleFilled style={{ color: mauXanhLa }} />
                      ) : (
                        <span className="buoc-phieu-so">{i + 1}</span>
                      )}
                    </span>
                    <span className="ten-va-phu">
                      <Typography.Text strong={dang}>{b.ten}</Typography.Text>
                      <small>
                        {b.phu}
                        {b.han && !b.xong ? ` · hạn ${ngayVN(b.han)}` : ''}
                      </small>
                    </span>
                    {treHan && (
                      <Tag color="error" style={{ marginInlineStart: 'auto' }}>
                        Quá hạn
                      </Tag>
                    )}
                    {dang && !treHan && (
                      <Tag
                        color="processing"
                        style={{ marginInlineStart: 'auto' }}
                      >
                        Đang ở bước này
                      </Tag>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Card>

      <Card
        title={
          <span className="viec-tieu-de">
            Điểm của tôi các kỳ gần đây
            <Typography.Text
              type="secondary"
              style={{ fontSize: 13, fontWeight: 400 }}
            >
              {lichSu.length} kỳ đã chốt
            </Typography.Text>
          </span>
        }
      >
        {lichSu.length === 0 ? (
          <Empty description="Chưa có kỳ nào chốt điểm. Điểm sẽ hiện sau khi trưởng bộ phận chốt." />
        ) : (
          <>
            <Duong
              yMin={0}
              yMax={100}
              mau={mauChuDao}
              vach={[
                { giaTri: 90, nhan: 'Hoàn thành ≥ 90' },
                { giaTri: 80, nhan: '80' },
              ]}
              diem={lichSu.map((x) => ({
                nhan: nhanThang(
                  x.periodCode.replace(/^(\d{4})-(\d{2})$/, 'Tháng $2/$1'),
                ),
                giaTri: Number(x.managerTotalScore),
                phu: x.grade ? NHAN_XEP_LOAI[x.grade] : undefined,
              }))}
            />
            <div className="phieu-toi-lich-su">
              {[...lichSu].reverse().map((x) => (
                <Link
                  key={x.id}
                  to={`/kpi/scorecards/${x.id}/scoring`}
                  className="phieu-toi-lich-su-dong"
                >
                  <span>
                    {x.periodCode.replace(/^(\d{4})-(\d{2})$/, 'Tháng $2/$1')}
                  </span>
                  <Typography.Text
                    strong
                    style={{
                      color: x.grade ? MAU_DIEM[x.grade] : undefined,
                    }}
                  >
                    {diemTomTat(x.managerTotalScore)}
                  </Typography.Text>
                  <Tag style={{ margin: 0 }}>
                    {x.grade ? NHAN_XEP_LOAI[x.grade] : '—'}
                  </Tag>
                </Link>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
