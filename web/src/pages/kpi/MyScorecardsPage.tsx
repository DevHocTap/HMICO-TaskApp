import { useMemo, useState } from 'react';
import { App, Input, Modal } from 'antd';
import {
  CheckCircleFilled,
  CheckOutlined,
  DownloadOutlined,
  ExportOutlined,
  EyeOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  kyNhanPhieu,
  layChiTietPhieu,
  layPhieuChamDiem,
  layPhieuCuaToi,
  neuYKienPhieu,
  taiPhieuExcel,
} from '../../api/scorecard';
import { docLoiBlob } from '../../api/report';
import { layThongBaoLoi } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { useCaiDat, useTrongSo } from '../../auth/useTrongSo';
import { useKyDangXem } from '../../contexts/KyDangXem';
import { kyChuaHomNay, ngayTrongThang } from '../../utils/period';
import { diemTomTat, ngayVN } from '../../utils/format';
import { MAX_SCALE, TEN_MUC } from '../../types/kpi-template';
import {
  NHAN_XEP_LOAI,
  type DongChamDiem,
  type DongPhieuKpi,
  type PhieuKpi,
  type XepLoai,
} from '../../types/scorecard';
import './phieu-cua-toi.css';

type LocTrangThai = 'tat-ca' | 'dang-lam' | 'da-chot';

const DA_CHOT = new Set(['MANAGER_SCORED', 'RECEIVED']);
const LOP_XEP_LOAI: Record<XepLoai, string> = {
  EXCEEDED: 'pt-loai-xanh',
  COMPLETED: 'pt-loai-xanh',
  NEEDS_IMPROVEMENT: 'pt-loai-xam',
  NOT_ACHIEVED: 'pt-loai-do',
};

/** Một dòng trong bảng kê tiêu chí: cấp 1 hoặc KPI con, đã có (hoặc chưa có) điểm. */
interface DongKe {
  id: string;
  ma: string;
  cap1: boolean;
  ten: string;
  phu: string | null;
  mucTieu: string | null;
  trongSo: string;
  maxScale: number;
  ghiChu: string | null;
  diem: string | null;
  /** Điểm tiêu chí cha tính từ KPI con (backend tính) — hiện thay chữ "tính từ KPI con". */
  diemTinh: string | null;
  dongGop: string | null;
  section: 'BSC_WORK' | 'COMPLIANCE';
}

/**
 * "Phiếu đánh giá của tôi" — dựng theo mã HTML mẫu 13/09: tóm tắt kỳ hiện
 * tại (điểm + 3 bước), bảng các kỳ có bộ lọc, bảng kê tiêu chí của phiếu
 * đang chọn. Ký nhận / nêu ý kiến vẫn ở đây (không có màn nào khác làm việc
 * đó cho nhân viên).
 */
export function MyScorecardsPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { cacKy } = useKyDangXem();
  const caiDat = useCaiDat();
  const trongSo = useTrongSo();
  const [loc, setLoc] = useState<LocTrangThai>('tat-ca');
  const [nam, setNam] = useState<string>('tat-ca');
  const [idChon, setIdChon] = useState<string | null>(null);
  const [moHuongDan, setMoHuongDan] = useState(false);
  const [moNeuYKien, setMoNeuYKien] = useState(false);
  const [lyDo, setLyDo] = useState('');
  /** Tiêu chí cấp 1 đang mở KPI con — mặc định gập hết, bấm vào dòng để sổ. */
  const [dangMo, setDangMo] = useState<Set<string>>(new Set());
  const doiMo = (id: string) =>
    setDangMo((cu) => {
      const moi = new Set(cu);
      if (moi.has(id)) moi.delete(id);
      else moi.add(id);
      return moi;
    });

  const { data: danhSach = [], isLoading } = useQuery({
    queryKey: ['scorecards', 'my'],
    queryFn: () => layPhieuCuaToi(),
  });

  const homNay = dayjs();
  const kyNay = kyChuaHomNay(cacKy, homNay);
  const phieuKyNay = kyNay ? danhSach.find((p) => p.periodId === kyNay.id) : undefined;
  // Phiếu đang xem ở bảng kê: người dùng bấm chọn, mặc định là phiếu kỳ này
  const phieuChon = danhSach.find((p) => p.id === (idChon ?? phieuKyNay?.id));

  // Phiếu đã ký nhận: đọc /scoring để có điểm tự chấm từng dòng; chưa ký: /:id
  const daKy = phieuChon?.assignStatus === 'ACCEPTED';
  const { data: chamDiem } = useQuery({
    queryKey: ['scorecards', 'scoring', phieuChon?.id],
    queryFn: () => layPhieuChamDiem(phieuChon!.id),
    enabled: Boolean(phieuChon) && daKy,
  });
  const { data: chiTiet } = useQuery({
    queryKey: ['scorecards', 'detail', phieuChon?.id],
    queryFn: () => layChiTietPhieu(phieuChon!.id),
    enabled: Boolean(phieuChon) && !daKy,
  });
  // Điểm tự chấm dự kiến của phiếu KỲ NÀY (thẻ tóm tắt) — chỉ khi đang xem đúng phiếu đó
  const chamKyNay = phieuChon && phieuKyNay && phieuChon.id === phieuKyNay.id ? chamDiem : undefined;

  function lamMoi() {
    void queryClient.invalidateQueries({ queryKey: ['scorecards'] });
  }
  const kyNhan = useMutation({
    mutationFn: (id: string) => kyNhanPhieu(id),
    onSuccess: () => {
      message.success('Đã ký nhận phiếu KPI');
      lamMoi();
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });
  const taiExcel = useMutation({
    mutationFn: (id: string) => taiPhieuExcel(id),
    onSuccess: (ten) => message.success(`Đã tải ${ten}`),
    onError: async (e) => message.error((await docLoiBlob(e)) ?? layThongBaoLoi(e)),
  });
  const neuYKien = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => neuYKienPhieu(id, reason),
    onSuccess: () => {
      message.success('Đã gửi ý kiến cho người giao KPI');
      setMoNeuYKien(false);
      setLyDo('');
      lamMoi();
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  // ---- bảng các kỳ: lọc theo năm + trạng thái
  const cacNam = useMemo(
    () => [...new Set(danhSach.map((p) => p.period.code.slice(0, 4)))].sort().reverse(),
    [danhSach],
  );
  const theoNam = danhSach.filter((p) => nam === 'tat-ca' || p.period.code.startsWith(nam));
  const soDangLam = theoNam.filter((p) => !DA_CHOT.has(p.resultStatus)).length;
  const soDaChot = theoNam.length - soDangLam;
  const hien = theoNam.filter((p) =>
    loc === 'tat-ca' ? true : loc === 'da-chot' ? DA_CHOT.has(p.resultStatus) : !DA_CHOT.has(p.resultStatus),
  );

  // ---- bảng kê tiêu chí của phiếu đang chọn
  const dongKe: DongKe[] = useMemo(() => {
    const items: (DongChamDiem | DongPhieuKpi)[] = daKy ? (chamDiem?.items ?? []) : (chiTiet?.items ?? []);
    const cap1 = items.filter((i) => i.parentId === null);
    const ra: DongKe[] = [];
    (['BSC_WORK', 'COMPLIANCE'] as const).forEach((muc) => {
      cap1
        .filter((i) => i.section === muc)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .forEach((cha, k) => {
          const con = items
            .filter((i) => i.parentId === cha.id)
            .sort((a, b) => a.displayOrder - b.displayOrder);
          const maCha = String(k + 1);
          const sang = (i: DongChamDiem | DongPhieuKpi, ma: string, laCha: boolean): DongKe => ({
            id: i.id,
            ma,
            cap1: laCha,
            ten: i.name,
            phu: i.description,
            mucTieu: i.measurementText || i.measureMethod || null,
            trongSo: i.weight,
            maxScale: i.maxScale,
            ghiChu: 'selfComment' in i ? i.selfComment : null,
            diem: 'selfScore' in i ? i.selfScore : null,
            diemTinh: 'selfComputed' in i ? i.selfComputed.diem : null,
            dongGop: 'selfComputed' in i ? i.selfComputed.dongGop : null,
            section: muc,
          });
          ra.push(sang(cha, maCha, true));
          con.forEach((c, j) => ra.push(sang(c, `${maCha}.${j + 1}`, false)));
        });
    });
    return ra;
  }, [daKy, chamDiem, chiTiet]);
  const tongTrongSo = dongKe.filter((d) => d.cap1).reduce((a, d) => a + Number(d.trongSo), 0);
  const tongTuCham = daKy ? (chamDiem?.selfPreview?.tongDiem ?? null) : null;
  const nguoiGiao = daKy ? null : chiTiet?.evaluator?.fullName;

  // ---- 3 bước của phiếu kỳ này
  const buoc = (() => {
    if (!kyNay) return [];
    const p = phieuKyNay;
    const hanTuCham = kyNay.selfScoreDeadline;
    const hanChot = kyNay.managerScoreDeadline;
    const b1 = p?.assignStatus === 'ACCEPTED';
    const b2 = p ? p.resultStatus !== 'PENDING' && p.resultStatus !== 'REJECTED' : false;
    const b3 = p ? DA_CHOT.has(p.resultStatus) : false;
    return [
      {
        ten: '1. Ký nhận KPI',
        phu: p?.acceptedAt ? ngayVN(p.acceptedAt) : p?.proposedAt ? `Gửi ký ${ngayVN(p.proposedAt)}` : 'Chưa được giao',
        ket: b1 ? 'Đã xác nhận' : p?.assignStatus === 'PROPOSED' ? 'Chờ bạn ký' : p?.assignStatus === 'DISPUTED' ? 'Đã nêu ý kiến' : 'Chưa gửi ký',
        xong: b1,
        dang: !b1,
      },
      {
        ten: '2. Tự chấm điểm',
        phu: `Hạn: ${ngayVN(hanTuCham)}`,
        ket: b2
          ? `Điểm: ${diemTomTat(p!.selfTotalScore)}/100`
          : chamKyNay?.selfPreview
            ? `Dự kiến: ${diemTomTat(chamKyNay.selfPreview.tongDiem)}/100`
            : p?.resultStatus === 'REJECTED'
              ? 'Bị trả lại, chấm lại'
              : 'Chưa nộp',
        xong: b2,
        dang: b1 && !b2,
      },
      {
        ten: '3. Chốt điểm kỳ',
        phu: `Hạn: ${ngayVN(hanChot)}`,
        ket: b3 ? `${diemTomTat(p!.managerTotalScore)}/100 · ${p!.grade ? NHAN_XEP_LOAI[p!.grade] : ''}` : b2 ? 'Chờ quản lý duyệt' : 'Chưa tới',
        xong: b3,
        dang: b2 && !b3,
      },
    ];
  })();
  const soBuocXong = buoc.filter((b) => b.xong).length;

  // Tình trạng kỳ này: quá hạn khi giai đoạn đã qua mà bước tương ứng chưa xong
  const quaHan =
    !!kyNay &&
    !!phieuKyNay &&
    ((kyNay.selfScoreDeadline && homNay.isAfter(dayjs(kyNay.selfScoreDeadline), 'day') && !buoc[1]?.xong) ||
      (kyNay.assignDeadline && homNay.isAfter(dayjs(kyNay.assignDeadline), 'day') && !buoc[0]?.xong));

  const nguong = caiDat?.nguongXepLoai ?? { canCaiThien: 80, hoanThanh: 90, vuot: 100 };
  const nhanKy = (p: PhieuKpi) => p.period.name;
  const linkMo = (p: PhieuKpi) => `/kpi/scorecards/${p.id}/scoring`;

  return (
    <div className="pt">
      {/* ===== tiêu đề */}
      <section className="pt-dau">
        <div>
          <div className="pt-dau-ten">
            <h1>Phiếu đánh giá của tôi</h1>
            {user?.employeeCode && <span className="pt-ma-nv">{user.employeeCode}</span>}
          </div>
          <p className="pt-mo-ta">Ký nhận KPI đầu kỳ, theo dõi hạn tự chấm và kết quả chốt điểm phòng ban.</p>
        </div>
        <div className="pt-dau-nut">
          <button type="button" className="pt-nut pt-nut-trang" onClick={() => setMoHuongDan(true)}>
            <QuestionCircleOutlined /> Hướng dẫn tự chấm
          </button>
          {phieuKyNay && phieuKyNay.assignStatus === 'ACCEPTED' ? (
            <Link to={linkMo(phieuKyNay)} className="pt-nut pt-nut-xanh">
              <ExportOutlined /> Mở phiếu kỳ này
            </Link>
          ) : (
            <button type="button" className="pt-nut pt-nut-xanh" disabled={!phieuKyNay} onClick={() => setIdChon(phieuKyNay?.id ?? null)}>
              <EyeOutlined /> Xem phiếu kỳ này
            </button>
          )}
        </div>
      </section>

      {/* ===== tóm tắt kỳ hiện tại */}
      <section className="pt-the pt-tom-tat">
        <div className="pt-tom-tat-trai">
          <div className="pt-hang">
            <span className="pt-chip-ky">Kỳ hiện tại · {kyNay ? `T${dayjs(kyNay.startDate).format('MM/YYYY')}` : '—'}</span>
            {phieuKyNay ? (
              <span className={`pt-chip-tt ${quaHan ? 'pt-chip-do' : phieuKyNay.assignStatus === 'PROPOSED' ? 'pt-chip-cam' : 'pt-chip-xanh-la'}`}>
                <i /> {quaHan ? 'Quá hạn' : phieuKyNay.assignStatus === 'PROPOSED' ? 'Chờ ký nhận' : 'Đúng tiến độ'}
              </span>
            ) : (
              <span className="pt-chip-tt pt-chip-xam">
                <i /> Chưa có phiếu
              </span>
            )}
          </div>
          <div className="pt-diem-lon">
            {phieuKyNay?.managerTotalScore ? (
              <>
                <span>{diemTomTat(phieuKyNay.managerTotalScore)}</span>
                <small>/ 100 điểm chốt{phieuKyNay.grade ? ` · ${NHAN_XEP_LOAI[phieuKyNay.grade]}` : ''}</small>
              </>
            ) : phieuKyNay?.selfTotalScore ? (
              <>
                <span>{diemTomTat(phieuKyNay.selfTotalScore)}</span>
                <small>/ 100 điểm tự chấm (đã nộp)</small>
              </>
            ) : chamKyNay?.selfPreview ? (
              <>
                <span>{diemTomTat(chamKyNay.selfPreview.tongDiem)}</span>
                <small>/ 100 điểm tự chấm (dự kiến)</small>
              </>
            ) : (
              <>
                <span>—</span>
                <small>/ 100 điểm tự chấm</small>
              </>
            )}
          </div>
          <p className="pt-nho">
            {!phieuKyNay ? (
              'Trưởng bộ phận chưa giao phiếu cho kỳ này.'
            ) : phieuKyNay.assignStatus === 'PROPOSED' ? (
              <>
                Phiếu gửi ký ngày <strong>{ngayVN(phieuKyNay.proposedAt)}</strong>. Ký nhận trước hạn tự chấm{' '}
                <strong>{ngayVN(kyNay?.selfScoreDeadline)}</strong>.
              </>
            ) : phieuKyNay.selfScoredAt ? (
              <>
                Đã nộp tự chấm ngày <strong>{ngayTrongThang(phieuKyNay.selfScoredAt)}/{dayjs(phieuKyNay.selfScoredAt).format('MM')}</strong>. Trưởng phòng chốt trước{' '}
                <strong>{ngayVN(kyNay?.managerScoreDeadline)}</strong>.
              </>
            ) : (
              <>
                Tự chấm trước <strong>{ngayVN(kyNay?.selfScoreDeadline)}</strong>. Trưởng phòng chốt trước{' '}
                <strong>{ngayVN(kyNay?.managerScoreDeadline)}</strong>.
              </>
            )}
          </p>
        </div>
        <div className="pt-tom-tat-phai">
          <div className="pt-hang pt-tien-trinh-dau">
            <span>Tiến trình hoàn thành kỳ đánh giá</span>
            <b>
              Bước {soBuocXong} / 3 hoàn tất ({Math.round((soBuocXong / 3) * 100)}%)
            </b>
          </div>
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
        </div>
      </section>

      {/* ===== bảng các kỳ */}
      <section className="pt-the pt-bang">
        <div className="pt-bang-dau">
          <div className="pt-hang-trai">
            <select className="pt-select" value={nam} onChange={(e) => setNam(e.target.value)}>
              <option value="tat-ca">Tất cả các năm</option>
              {cacNam.map((n) => (
                <option key={n} value={n}>
                  Năm {n}
                </option>
              ))}
            </select>
            <div className="pt-segment">
              {(
                [
                  ['tat-ca', `Tất cả (${theoNam.length})`],
                  ['dang-lam', `Đang thực hiện (${soDangLam})`],
                  ['da-chot', `Đã chốt điểm (${soDaChot})`],
                ] as [LocTrangThai, string][]
              ).map(([k, ten]) => (
                <button key={k} type="button" className={loc === k ? 'pt-segment-chon' : ''} onClick={() => setLoc(k)}>
                  {ten}
                </button>
              ))}
            </div>
          </div>
          <span className="pt-nho">
            Phiếu cá nhân: <strong>{user?.fullName}{user?.employeeCode ? ` (${user.employeeCode})` : ''}</strong>
          </span>
        </div>
        <div className="pt-cuon">
          <table className="pt-table pt-table-ky">
            <colgroup>
              <col style={{ width: '20%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '10%' }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th className="pt-th-dau">Kỳ đánh giá</th>
                <th>Chức danh</th>
                <th>Phòng ban</th>
                <th>Ký nhận KPI</th>
                <th>Ngày ký</th>
                <th>Tiến độ chấm điểm</th>
                <th>Điểm số</th>
                <th className="pt-th-cuoi">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="pt-rong">Đang tải…</td>
                </tr>
              ) : hien.length === 0 ? (
                <tr>
                  <td colSpan={8} className="pt-rong">Bạn chưa được giao phiếu KPI nào</td>
                </tr>
              ) : (
                hien.map((p) => {
                  const laKyNay = p.id === phieuKyNay?.id;
                  const daChot = DA_CHOT.has(p.resultStatus);
                  return (
                    <tr key={p.id} className={`${laKyNay ? 'pt-dong-ky-nay' : ''}${phieuChon?.id === p.id ? ' pt-dong-chon' : ''}`}>
                      <td className="pt-td-dau">
                        <div className="pt-ky-o">
                          <button type="button" className={`pt-link${laKyNay ? ' pt-link-dam' : ''}`} onClick={() => setIdChon(p.id)}>
                            {nhanKy(p)}
                          </button>
                          {laKyNay && <span className="pt-huy-hieu-xanh">Kỳ hiện tại</span>}
                        </div>
                      </td>
                      <td>{p.jobTitleName}</td>
                      <td className="pt-mo">{p.departmentName}</td>
                      <td>
                        {p.assignStatus === 'ACCEPTED' ? (
                          <span className="pt-pill pt-pill-xanh-la">
                            <CheckOutlined /> Đã ký nhận
                          </span>
                        ) : p.assignStatus === 'PROPOSED' ? (
                          <span className="pt-pill pt-pill-cam">Chờ bạn ký</span>
                        ) : p.assignStatus === 'DISPUTED' ? (
                          <span className="pt-pill pt-pill-do">Đã nêu ý kiến</span>
                        ) : (
                          <span className="pt-pill pt-pill-xam">Đang soạn</span>
                        )}
                      </td>
                      <td className="pt-mo">{ngayVN(p.acceptedAt)}</td>
                      <td>
                        {daChot ? (
                          <span className="pt-pill pt-pill-xam">{p.resultStatus === 'RECEIVED' ? 'HCNS đã tiếp nhận' : 'Đã chốt điểm'}</span>
                        ) : p.resultStatus === 'SELF_SCORED' ? (
                          <span className="pt-pill pt-pill-cam">
                            <i className="pt-nhay" /> Chờ quản lý chốt
                          </span>
                        ) : p.resultStatus === 'REJECTED' ? (
                          <span className="pt-pill pt-pill-do">Bị trả lại, chấm lại</span>
                        ) : p.assignStatus === 'ACCEPTED' ? (
                          <span className="pt-pill pt-pill-xanh">Chờ bạn tự chấm</span>
                        ) : (
                          <span className="pt-pill pt-pill-xam">Chưa bắt đầu</span>
                        )}
                      </td>
                      <td>
                        {p.managerTotalScore ? (
                          <span className="pt-diem">
                            <b>{diemTomTat(p.managerTotalScore)}</b>
                            <small>/100</small>
                            {p.grade && <span className={`pt-loai ${LOP_XEP_LOAI[p.grade]}`}>{NHAN_XEP_LOAI[p.grade]}</span>}
                          </span>
                        ) : p.selfTotalScore ? (
                          <span className="pt-diem">
                            <b>{diemTomTat(p.selfTotalScore)}</b>
                            <small>/100 (tự chấm)</small>
                          </span>
                        ) : (
                          <span className="pt-mo">—</span>
                        )}
                      </td>
                      <td className="pt-td-cuoi">
                        {p.assignStatus === 'ACCEPTED' ? (
                          <Link to={linkMo(p)} className={daChot ? 'pt-nut-nho pt-nut-nho-trang' : 'pt-nut-nho pt-nut-nho-xanh'}>
                            {daChot ? 'Kết quả' : (<><ExportOutlined /> Mở phiếu</>)}
                          </Link>
                        ) : (
                          <button type="button" className="pt-nut-nho pt-nut-nho-xanh" onClick={() => setIdChon(p.id)}>
                            <EyeOutlined /> {p.assignStatus === 'PROPOSED' ? 'Xem & ký nhận' : 'Xem'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="pt-bang-chan">
          <span>
            Hiển thị {hien.length === 0 ? 0 : 1} - {hien.length} trên tổng {hien.length} phiếu
          </span>
        </div>
      </section>

      {/* ===== bảng kê tiêu chí */}
      {phieuChon && (
        <section className="pt-the pt-ke">
          <div className="pt-ke-dau">
            <div>
              <h3>
                Bảng kê chi tiết tiêu chí KPI - {phieuChon.period.name}
                <span>({daKy ? 'Chi tiết điểm tự chấm' : 'Nội dung chờ ký nhận'})</span>
              </h3>
              <p className="pt-nho">
                {phieuChon.assignStatus === 'ACCEPTED'
                  ? `Chỉ tiêu đã ký nhận ngày ${ngayVN(phieuChon.acceptedAt)}`
                  : nguoiGiao
                    ? `Giao bởi ${nguoiGiao} — đọc kỹ trước khi ký nhận`
                    : 'Chỉ tiêu do trưởng bộ phận giao đầu kỳ'}
              </p>
            </div>
            <div className="pt-ke-tong">
              <span>
                Tổng trọng số: <strong>{Number.isInteger(tongTrongSo) ? tongTrongSo : tongTrongSo.toFixed(2)}%</strong>
              </span>
              <i>|</i>
              <span>
                Điểm tự chấm: <strong className="pt-chu-xanh">{tongTuCham ? `${diemTomTat(tongTuCham)} / 100` : '—'}</strong>
              </span>
            </div>
          </div>
          <div className="pt-cuon pt-ke-khung">
            <table className="pt-table pt-table-ke">
              <colgroup>
                <col style={{ width: 64 }} />
                <col style={{ width: '38%' }} />
                <col style={{ width: 110 }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 150 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>STT</th>
                  <th>Tiêu chí đánh giá</th>
                  <th style={{ textAlign: 'center' }}>Trọng số</th>
                  <th>Mục tiêu (Target)</th>
                  <th>Ghi chú tự chấm</th>
                  <th style={{ textAlign: 'center' }}>Điểm tự chấm</th>
                  <th style={{ textAlign: 'center' }}>Trọng số tháng (%)</th>
                </tr>
              </thead>
              <tbody>
                {dongKe.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="pt-rong">Phiếu chưa có tiêu chí nào</td>
                  </tr>
                ) : (
                  (['BSC_WORK', 'COMPLIANCE'] as const).map((muc) => {
                    const cua = dongKe.filter((d) => d.section === muc);
                    if (cua.length === 0) return null;
                    return [
                      <tr key={`muc-${muc}`} className="pt-dong-muc">
                        <td colSpan={7}>
                          {muc === 'BSC_WORK' ? 'Mục 1' : 'Mục 2'}. {TEN_MUC[muc]} · {trongSo[muc]}% · thang {MAX_SCALE[muc]}
                        </td>
                      </tr>,
                      ...cua.map((d) => {
                        const chaId = d.cap1 ? d.id : (cua.find((x) => x.cap1 && d.ma.startsWith(`${x.ma}.`))?.id ?? '');
                        const soCon = d.cap1 ? cua.filter((x) => !x.cap1 && x.ma.startsWith(`${d.ma}.`)).length : 0;
                        const mo = dangMo.has(chaId);
                        // KPI con chỉ hiện khi tiêu chí cha đang mở
                        if (!d.cap1 && !mo) return null;
                        return (
                        <tr
                          key={d.id}
                          className={`${d.cap1 ? 'pt-dong-cap1' : 'pt-dong-con'}${soCon > 0 ? ' pt-dong-bam' : ''}${d.cap1 && mo ? ' pt-dong-mo' : ''}`}
                          onClick={soCon > 0 ? () => doiMo(d.id) : undefined}
                        >
                          <td style={{ textAlign: 'center' }}>
                            <span className={d.cap1 ? 'pt-stt' : 'pt-stt pt-stt-con'}>{d.ma}</span>
                          </td>
                          <td>
                            <div className={d.cap1 ? 'pt-ke-ten' : 'pt-ke-ten pt-ke-ten-con'}>
                              {soCon > 0 && <span className={`pt-mui-ten${mo ? ' pt-mui-ten-mo' : ''}`}>▸</span>}
                              {d.ten}
                              {soCon > 0 && <span className="pt-so-con">{soCon} KPI con{mo ? '' : ' · bấm để xem'}</span>}
                            </div>
                            {d.phu && <div className="pt-ke-phu">{d.phu}</div>}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <span className="pt-trong-so">{Number(d.trongSo) % 1 === 0 ? Number(d.trongSo) : d.trongSo}%</span>
                          </td>
                          <td className="pt-ke-muc-tieu">{d.mucTieu ?? <span className="pt-mo">—</span>}</td>
                          <td className="pt-ke-muc-tieu">{d.ghiChu ?? <span className="pt-mo">—</span>}</td>
                          <td style={{ textAlign: 'center' }}>
                            {d.diem !== null ? (
                              <>
                                <b className="pt-diem-o">{diemTomTat(d.diem)}</b>
                                <small className="pt-mo"> / {d.maxScale}</small>
                              </>
                            ) : d.cap1 && d.diemTinh !== null ? (
                              <>
                                <b className="pt-diem-o">{diemTomTat(d.diemTinh)}</b>
                                <small className="pt-mo"> / {d.maxScale}</small>
                              </>
                            ) : (
                              <span className="pt-mo">—</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {d.dongGop !== null ? <b className="pt-chu-xanh">{diemTomTat(d.dongGop)}%</b> : <span className="pt-mo">—</span>}
                          </td>
                        </tr>
                        );
                      }),
                    ];
                  })
                )}
              </tbody>
              {dongKe.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={2} className="pt-tfoot-nhan">Tổng cộng</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="pt-trong-so pt-trong-so-dam">{Number.isInteger(tongTrongSo) ? tongTrongSo : tongTrongSo.toFixed(2)}%</span>
                    </td>
                    <td colSpan={2} className="pt-tfoot-mo">
                      Tổng hợp điểm tự chấm {dongKe.filter((d) => d.cap1).length} tiêu chí cấp 1
                    </td>
                    <td style={{ textAlign: 'center' }} className="pt-chu-xanh">
                      {tongTuCham ? `${diemTomTat(tongTuCham)} / 100` : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }} className="pt-tong-lon">
                      {tongTuCham ? `${diemTomTat(tongTuCham)}%` : '—'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="pt-ke-chan">
            <div className="pt-nho pt-ke-chan-chu">
              {phieuChon.assignStatus === 'PROPOSED' ? (
                <span>Phiếu đang chờ bạn ký nhận. Chưa hợp lý thì nêu ý kiến kèm lý do — phiếu quay lại cho người giao sửa, không bị huỷ.</span>
              ) : phieuChon.assignStatus === 'DISPUTED' ? (
                <span>Bạn đã nêu ý kiến{phieuChon.disputeReason ? `: “${phieuChon.disputeReason}”` : ''}. Đang chờ người giao KPI xử lý.</span>
              ) : phieuChon.resultStatus === 'PENDING' || phieuChon.resultStatus === 'REJECTED' ? (
                <span>
                  {phieuChon.resultStatus === 'REJECTED' ? 'Phiếu bị trả lại. ' : ''}Tự chấm trước{' '}
                  <strong>{ngayVN(cacKy.find((k) => k.id === phieuChon.periodId)?.selfScoreDeadline)}</strong>.
                </span>
              ) : (
                <span>
                  <CheckCircleFilled className="pt-chu-xanh-la" /> Giai đoạn tự chấm đã hoàn tất
                  {phieuChon.managerTotalScore ? ' — trưởng bộ phận đã chốt điểm.' : ' — đang chờ trưởng bộ phận chốt.'}
                </span>
              )}
            </div>
            <div className="pt-dau-nut">
              <button
                type="button"
                className="pt-nut pt-nut-trang"
                disabled={taiExcel.isPending}
                title="Tải phiếu này ra Excel theo biểu mẫu BM.01"
                onClick={() => taiExcel.mutate(phieuChon.id)}
              >
                <DownloadOutlined /> Tải phiếu (.xlsx)
              </button>
              {phieuChon.assignStatus === 'PROPOSED' ? (
                <>
                  <button type="button" className="pt-nut pt-nut-trang" onClick={() => setMoNeuYKien(true)}>
                    Nêu ý kiến
                  </button>
                  <button type="button" className="pt-nut pt-nut-toi" disabled={kyNhan.isPending} onClick={() => kyNhan.mutate(phieuChon.id)}>
                    <CheckOutlined /> Ký nhận phiếu
                  </button>
                </>
              ) : phieuChon.assignStatus === 'ACCEPTED' ? (
                <Link to={linkMo(phieuChon)} className="pt-nut pt-nut-toi">
                  <EyeOutlined /> Xem toàn bộ phiếu chi tiết
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      )}

      <Modal
        open={moHuongDan}
        title="Hướng dẫn tự chấm"
        footer={null}
        onCancel={() => setMoHuongDan(false)}
      >
        <ol className="pt-huong-dan">
          <li>
            <b>Ký nhận phiếu</b> đầu kỳ. Chưa hợp lý thì bấm “Nêu ý kiến” kèm lý do, phiếu quay lại cho trưởng bộ phận sửa.
          </li>
          <li>
            <b>Chấm từng KPI con</b> ở Mục 1 theo thang {MAX_SCALE.BSC_WORK} (được vượt tới {MAX_SCALE.BSC_WORK * 1.2} kèm ghi chú bắt buộc) và ba tiêu chí Mục 2 theo thang {MAX_SCALE.COMPLIANCE}. Tiêu chí có KPI con thì điểm tính từ con.
          </li>
          <li>
            Điểm tổng = Σ (điểm ÷ thang × trọng số). Mục 1 chiếm {trongSo.BSC_WORK}%, Mục 2 chiếm {trongSo.COMPLIANCE}%.
          </li>
          <li>
            <b>Nộp trước hạn</b> ngày {ngayTrongThang(kyNay?.selfScoreDeadline ?? null)} hằng tháng. Sau khi nộp, cột tự chấm khoá; trưởng bộ phận chấm cột thứ hai và chốt.
          </li>
          <li>
            Xếp loại tính trên cột trưởng bộ phận: &gt;{nguong.vuot} Vượt chỉ tiêu · {nguong.hoanThanh}–{nguong.vuot} Hoàn thành · {nguong.canCaiThien}–{(nguong.hoanThanh - 0.01).toLocaleString('vi-VN')} Cần cải thiện · &lt;{nguong.canCaiThien} Chưa đạt.
          </li>
        </ol>
      </Modal>

      <Modal
        open={moNeuYKien}
        title="Nêu ý kiến về phiếu KPI"
        okText="Gửi ý kiến"
        cancelText="Huỷ"
        confirmLoading={neuYKien.isPending}
        onCancel={() => setMoNeuYKien(false)}
        okButtonProps={{ disabled: lyDo.trim().length < 5 }}
        onOk={() => phieuChon && neuYKien.mutate({ id: phieuChon.id, reason: lyDo.trim() })}
      >
        <p className="pt-nho" style={{ marginBottom: 8 }}>
          Nêu rõ chỗ chưa hợp lý để người giao KPI biết phải sửa gì. Phiếu sẽ quay lại cho họ chỉnh, không bị huỷ.
        </p>
        <Input.TextArea
          rows={4}
          maxLength={2000}
          showCount
          value={lyDo}
          onChange={(e) => setLyDo(e.target.value)}
          placeholder="Ví dụ: trọng số tiêu chí 2 quá cao so với khối lượng thực tế tháng này."
        />
      </Modal>
    </div>
  );
}
