import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Input, Modal } from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  SendOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import {
  guiPhieuDiKy,
  layChiTietPhieu,
  luuItemPhieu,
  type DongLuuPhieu,
} from '../../api/scorecard';
import { layThongBaoLoi } from '../../api/client';
import {
  NHAN_HANH_DONG,
  NHAN_TRANG_THAI_GIAO_NGUOI_GIAO,
  type AssignStatus,
  type DongPhieuKpi,
} from '../../types/scorecard';
import { MAX_SCALE, TEN_MUC, type KpiSection } from '../../types/kpi-template';
import { useTrongSo } from '../../auth/useTrongSo';
import { bang, chiaDeu, hienSo, tongTrongSo } from '../../utils/weight';
import { useAuth } from '../../auth/useAuth';
import { ngayGioVN, ngayVN } from '../../utils/format';
import { chuVietTat } from '../../utils/period';
import { coTheGiaoKpi } from '../../auth/permissions';
import './lap-phieu.css';

/** Dòng đang soạn trên màn hình. `key` là khoá TẠM, dòng mới chưa có id. */
interface DongSoan {
  key: string;
  parentKey: string | null;
  name: string;
  section: KpiSection;
  measurementText: string;
  measureMethod: string;
  weight: string;
}

let demKhoa = 0;
const khoaMoi = () => `moi-${++demKhoa}`;

function tuPhieu(items: DongPhieuKpi[]): DongSoan[] {
  return items.map((i) => ({
    key: i.id,
    parentKey: i.parentId,
    name: i.name,
    section: i.section,
    measurementText: i.measurementText ?? '',
    measureMethod: i.measureMethod ?? '',
    weight: String(Number(i.weight)),
  }));
}

/** Xếp cha trước, con của nó ngay sau — đúng thứ tự đọc trên biểu mẫu. */
function xepCay(dong: DongSoan[]): DongSoan[] {
  const ra: DongSoan[] = [];
  for (const cha of dong.filter((d) => !d.parentKey)) {
    ra.push(cha);
    ra.push(...dong.filter((d) => d.parentKey === cha.key));
  }
  return ra;
}

const LOP_TRANG_THAI: Record<AssignStatus, string> = {
  DRAFT: 'lp-tt-cam',
  PROPOSED: 'lp-tt-xanh',
  ACCEPTED: 'lp-tt-xanh-la',
  DISPUTED: 'lp-tt-do',
};

/**
 * Lập / xem phiếu KPI đầu kỳ — dựng theo mã HTML mẫu 13/09: thanh hành động,
 * ba thẻ (nhân sự · đồng hồ trọng số · hạn), cảnh báo hợp lệ, hai mục soạn
 * ngay trong bảng, lịch sử phiếu. Phiếu sửa được (DRAFT / DISPUTED, kỳ chưa
 * khoá) thì ô nhập luôn mở; phiếu đã gửi ký thì cùng bố cục nhưng chỉ đọc.
 */
export function ScorecardDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [dong, setDong] = useState<DongSoan[]>([]);
  const [coThayDoi, setCoThayDoi] = useState(false);
  const [moGuiLai, setMoGuiLai] = useState(false);
  const [ghiChu, setGhiChu] = useState('');
  // Chế độ xem: KPI con gập mặc định, bấm dòng cha để mở (cùng kiểu bảng kê
  // ở Phiếu đánh giá của tôi, 14/09)
  const [moCon, setMoCon] = useState<Set<string>>(new Set());
  const doiMoCon = (key: string) =>
    setMoCon((cu) => {
      const moi = new Set(cu);
      if (moi.has(key)) moi.delete(key);
      else moi.add(key);
      return moi;
    });

  const { data: phieu, isLoading } = useQuery({
    queryKey: ['scorecards', 'detail', id],
    queryFn: () => layChiTietPhieu(id),
    enabled: Boolean(id),
  });

  // Nạp lại bản nháp mỗi khi phiếu đổi, nhưng KHÔNG đè lên thứ đang gõ dở.
  useEffect(() => {
    if (phieu && !coThayDoi) setDong(tuPhieu(phieu.items));
  }, [phieu, coThayDoi]);

  const TONG_TRONG_SO = useTrongSo();
  const laNguoiGiao = coTheGiaoKpi(user?.role);
  const suaDuoc =
    laNguoiGiao &&
    !phieu?.period.isLocked &&
    (phieu?.assignStatus === 'DRAFT' || phieu?.assignStatus === 'DISPUTED');

  const tongTheoMuc = useMemo(() => {
    const cap1 = dong.filter((d) => !d.parentKey);
    return {
      BSC_WORK: tongTrongSo(cap1.filter((d) => d.section === 'BSC_WORK').map((d) => d.weight)),
      COMPLIANCE: tongTrongSo(cap1.filter((d) => d.section === 'COMPLIANCE').map((d) => d.weight)),
    };
  }, [dong]);

  /** Nhóm con nào cộng lại khác 100 — sai này chỉ lộ ra lúc lưu nếu không hiện. */
  const nhomLech = useMemo(
    () =>
      dong
        .filter((d) => !d.parentKey)
        .map((cha) => {
          const con = dong.filter((c) => c.parentKey === cha.key);
          if (con.length === 0) return null;
          const tong = tongTrongSo(con.map((c) => c.weight));
          return bang(tong, 100) ? null : { ten: cha.name || '(chưa đặt tên)', tong };
        })
        .filter((x): x is { ten: string; tong: number } => x !== null),
    [dong],
  );
  const duMuc1 = bang(tongTheoMuc.BSC_WORK, TONG_TRONG_SO.BSC_WORK);
  const duMuc2 = bang(tongTheoMuc.COMPLIANCE, TONG_TRONG_SO.COMPLIANCE);
  const hopLe = duMuc1 && duMuc2 && nhomLech.length === 0;
  const tongPhieu = tongTheoMuc.BSC_WORK + tongTheoMuc.COMPLIANCE;

  function lamMoi() {
    void queryClient.invalidateQueries({ queryKey: ['scorecards'] });
  }

  const luu = useMutation({
    mutationFn: () => {
      const xep = xepCay(dong);
      const goi: DongLuuPhieu[] = xep.map((d, i) => ({
        key: d.key,
        parentKey: d.parentKey,
        name: d.name.trim(),
        section: d.section,
        measurementText: d.measurementText.trim() || null,
        measureMethod: d.measureMethod.trim() || null,
        weight: Number(d.weight.replace(',', '.')) || 0,
        displayOrder: i + 1,
      }));
      return luuItemPhieu(id, goi);
    },
    onSuccess: () => {
      setCoThayDoi(false);
      lamMoi();
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  const gui = useMutation({
    mutationFn: (note?: string) => guiPhieuDiKy(id, note),
    onSuccess: () => {
      message.success('Đã gửi phiếu cho nhân viên ký nhận');
      setMoGuiLai(false);
      setGhiChu('');
      lamMoi();
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  /** "Lưu & Giao KPI": lưu nội dung (nếu có sửa) rồi gửi ký — hai bước, bước nào lỗi dừng ở đó. */
  async function luuVaGui(note?: string) {
    try {
      if (coThayDoi) await luu.mutateAsync();
    } catch {
      return; // đã báo lỗi ở onError
    }
    gui.mutate(note);
  }

  function doiDong(key: string, thayDoi: Partial<DongSoan>) {
    setCoThayDoi(true);
    setDong((cu) => cu.map((d) => (d.key === key ? { ...d, ...thayDoi } : d)));
  }
  function themDong(section: KpiSection, parentKey: string | null) {
    setCoThayDoi(true);
    setDong((cu) => [
      ...cu,
      { key: khoaMoi(), parentKey, name: '', section, measurementText: '', measureMethod: '', weight: '' },
    ]);
  }
  /** Xoá một dòng, kèm mọi KPI con của nó — không để con mồ côi. */
  function xoaDong(key: string) {
    setCoThayDoi(true);
    setDong((cu) => cu.filter((d) => d.key !== key && d.parentKey !== key));
  }
  /** Chia đều trọng số cho các con của một tiêu chí, phần dư dồn lên đầu. */
  function chiaDeuCon(chaKey: string) {
    const con = dong.filter((d) => d.parentKey === chaKey);
    if (con.length === 0) return;
    const phan = chiaDeu(100, con.length);
    setCoThayDoi(true);
    setDong((cu) =>
      cu.map((d) => {
        const i = con.findIndex((c) => c.key === d.key);
        return i >= 0 ? { ...d, weight: hienSo(phan[i]!) } : d;
      }),
    );
  }

  if (!phieu && !isLoading) {
    return <Alert type="error" showIcon message="Không tìm thấy phiếu KPI này" />;
  }
  if (!phieu) return null;

  const han = phieu.period.assignDeadline ? dayjs(phieu.period.assignDeadline) : null;
  const conNgay = han ? han.diff(dayjs(), 'day') : null;
  const daGui = phieu.assignStatus !== 'DRAFT' && phieu.assignStatus !== 'DISPUTED';
  const nhanHan =
    daGui ? null : conNgay === null ? null : conNgay < 0 ? { ten: `Quá hạn ${-conNgay} ngày`, lop: 'lp-tt-do' } : conNgay <= 5 ? { ten: 'Sắp đến hạn', lop: 'lp-tt-cam' } : { ten: `Còn ${conNgay} ngày`, lop: 'lp-tt-xanh' };
  const tenNhanVien = phieu.ownerUser?.fullName ?? 'Phiếu KPI';
  const dangBan = luu.isPending || gui.isPending;

  const mucInfo: Record<KpiSection, { so: number; ten: string; lop: string; cotTen: string; cotDo: string }> = {
    BSC_WORK: { so: 1, ten: TEN_MUC.BSC_WORK, lop: 'lp-so-xanh', cotTen: 'Tiêu chí / Chỉ số KPI', cotDo: 'Cách đo / Công thức' },
    COMPLIANCE: { so: 2, ten: 'Chấp hành nội quy & Văn hoá doanh nghiệp', lop: 'lp-so-xanh-la', cotTen: 'Tiêu chí / Quy định', cotDo: 'Cách đo / Nguồn dữ liệu' },
  };

  return (
    <div className="lp">
      {/* ===== thanh hành động */}
      <div className="lp-thanh">
        <div className="lp-thanh-trai">
          <button type="button" className="lp-nut lp-nut-trang" onClick={() => navigate(-1)}>
            <ArrowLeftOutlined /> Quay lại
          </button>
          <div className="lp-tieu-de">
            <h1>
              {tenNhanVien} — {phieu.period.name}
            </h1>
            <span className={`lp-tt ${LOP_TRANG_THAI[phieu.assignStatus]}`}>
              {phieu.assignStatus === 'DRAFT' ? 'Đang soạn thảo' : NHAN_TRANG_THAI_GIAO_NGUOI_GIAO[phieu.assignStatus]}
            </span>
          </div>
        </div>
        <div className="lp-thanh-phai">
          {phieu.assignStatus === 'ACCEPTED' && (
            <Link to={`/kpi/scorecards/${phieu.id}/scoring`} className="lp-nut lp-nut-xanh">
              Chấm điểm
            </Link>
          )}
          {suaDuoc && (
            <>
              <button
                type="button"
                className="lp-nut lp-nut-trang"
                disabled={!coThayDoi || dangBan}
                onClick={() => {
                  setDong(tuPhieu(phieu.items));
                  setCoThayDoi(false);
                }}
              >
                Huỷ
              </button>
              <button
                type="button"
                className="lp-nut lp-nut-trang lp-nut-dam"
                disabled={!coThayDoi || dangBan}
                onClick={() => luu.mutate(undefined, { onSuccess: () => message.success('Đã lưu nháp') })}
              >
                Lưu nháp
              </button>
              <button
                type="button"
                className="lp-nut lp-nut-xanh"
                disabled={dangBan}
                onClick={() => (phieu.assignStatus === 'DISPUTED' ? setMoGuiLai(true) : void luuVaGui())}
              >
                <SendOutlined /> {phieu.assignStatus === 'DISPUTED' ? 'Lưu & Gửi lại' : 'Lưu & Giao KPI'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===== ba thẻ */}
      <div className="lp-12">
        <div className="lp-the lp-span-4">
          <div className="lp-nv">
            <div className="lp-avatar">{chuVietTat(tenNhanVien)}</div>
            <div>
              <div className="lp-nv-ten">{tenNhanVien}</div>
              <div className="lp-nv-phu">
                {phieu.ownerUser?.employeeCode ?? '—'} · {phieu.jobTitleName}
              </div>
              <div className="lp-nv-phong">
                <i /> Phòng ban: <strong>{phieu.departmentName}</strong>
              </div>
            </div>
          </div>
          <div className="lp-the-chan">
            <span>Người đánh giá chính:</span>
            <strong>{phieu.evaluator?.fullName ?? '—'}</strong>
          </div>
        </div>

        <div className="lp-the lp-span-5">
          <div className="lp-hang" style={{ marginBottom: 8 }}>
            <span className="lp-nhan-dam">Đồng hồ trọng số nhóm</span>
            <span className="lp-tong">
              <b className={hopLe ? 'lp-chu-xanh-la' : 'lp-chu-do'}>{hienSo(tongPhieu)}%</b> <span>/ 100%</span>
            </span>
          </div>
          <div className="lp-gauge">
            {(['BSC_WORK', 'COMPLIANCE'] as const).map((muc) => {
              const tong = tongTheoMuc[muc];
              const du = bang(tong, TONG_TRONG_SO[muc]);
              return (
                <div key={muc}>
                  <div className="lp-hang lp-gauge-nhan">
                    <span>
                      {mucInfo[muc].so}. {TEN_MUC[muc]} (chuẩn {TONG_TRONG_SO[muc]}%)
                    </span>
                    <b className={du ? 'lp-chu-xanh-la' : 'lp-chu-do'}>
                      {hienSo(tong)} / {TONG_TRONG_SO[muc]}%
                    </b>
                  </div>
                  <div className="lp-thanh-do">
                    <span
                      className={du ? 'lp-thanh-xanh-la' : 'lp-thanh-do-mau'}
                      style={{ width: `${Math.min((tong / TONG_TRONG_SO[muc]) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="lp-ghi-chu">
            <InfoCircleOutlined /> Tổng trọng số các mục KPI phải đạt chính xác 100%.
          </div>
        </div>

        <div className="lp-the lp-span-3">
          <div>
            <div className="lp-nhan">Hạn giao &amp; duyệt KPI</div>
            <div className="lp-han">
              <span>{ngayVN(phieu.period.assignDeadline)}</span>
              {nhanHan && <span className={`lp-tt ${nhanHan.lop}`}>{nhanHan.ten}</span>}
            </div>
          </div>
          <div className="lp-the-chan lp-the-chan-cot">
            <div className="lp-hang">
              <span>Gửi ký:</span>
              <strong>{phieu.proposedAt ? ngayGioVN(phieu.proposedAt) : '— Chưa gửi'}</strong>
            </div>
            <div className="lp-hang">
              <span>Ký nhận:</span>
              <strong>{phieu.acceptedAt ? ngayGioVN(phieu.acceptedAt) : '— Chưa ký'}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* ===== cảnh báo */}
      {phieu.assignStatus === 'DISPUTED' && phieu.disputeReason && (
        <div className="lp-canh-bao lp-canh-bao-do">
          <span className="lp-canh-bao-icon">
            <WarningOutlined />
          </span>
          <div>
            <div className="lp-canh-bao-dau">
              <h3>{tenNhanVien} đã nêu ý kiến</h3>
              <span>{ngayGioVN(phieu.disputedAt)}</span>
            </div>
            <p>{phieu.disputeReason}</p>
          </div>
        </div>
      )}
      {phieu.period.isLocked && (
        <div className="lp-canh-bao lp-canh-bao-xam">
          <span className="lp-canh-bao-icon">
            <WarningOutlined />
          </span>
          <div>
            <div className="lp-canh-bao-dau">
              <h3>Kỳ {phieu.period.name} đã khoá sổ</h3>
            </div>
            <p>Không sửa được nội dung phiếu. Cần sửa thì đề nghị HCNS hoặc ban giám đốc mở lại kỳ.</p>
          </div>
        </div>
      )}
      {suaDuoc && (
        <div className={`lp-canh-bao ${hopLe ? 'lp-canh-bao-xanh-la' : 'lp-canh-bao-cam'}`}>
          <span className="lp-canh-bao-icon">{hopLe ? <InfoCircleOutlined /> : <WarningOutlined />}</span>
          <div>
            <div className="lp-canh-bao-dau">
              <h3>{hopLe ? 'Trọng số hợp lệ' : 'Cảnh báo tính hợp lệ của trọng số'}</h3>
              <span className="lp-canh-bao-tag">{hopLe ? 'Sẵn sàng giao' : 'Cần bổ sung'}</span>
            </div>
            <p>
              BSC công việc: <strong className={duMuc1 ? 'lp-chu-xanh-la' : 'lp-chu-do'}>{hienSo(tongTheoMuc.BSC_WORK)} / {TONG_TRONG_SO.BSC_WORK}%</strong> · Chấp hành nội quy:{' '}
              <strong className={duMuc2 ? 'lp-chu-xanh-la' : 'lp-chu-do'}>{hienSo(tongTheoMuc.COMPLIANCE)} / {TONG_TRONG_SO.COMPLIANCE}%</strong>.
              {!duMuc1 && ` Mục BSC công việc đang ${tongTheoMuc.BSC_WORK < TONG_TRONG_SO.BSC_WORK ? 'thiếu' : 'thừa'} ${hienSo(Math.abs(TONG_TRONG_SO.BSC_WORK - tongTheoMuc.BSC_WORK))}% trọng số.`}
              {!duMuc2 && ` Mục nội quy đang ${tongTheoMuc.COMPLIANCE < TONG_TRONG_SO.COMPLIANCE ? 'thiếu' : 'thừa'} ${hienSo(Math.abs(TONG_TRONG_SO.COMPLIANCE - tongTheoMuc.COMPLIANCE))}%.`}
              {nhomLech.length > 0 &&
                ` Nhóm KPI con phải cộng đúng 100% trong nhóm: ${nhomLech.map((n) => `“${n.ten}” đang ${hienSo(n.tong)}%`).join(', ')}.`}
              {hopLe && ' Bấm “Lưu & Giao KPI” để gửi nhân viên ký nhận.'}
            </p>
          </div>
        </div>
      )}

      {/* ===== hai mục */}
      {(['BSC_WORK', 'COMPLIANCE'] as const).map((muc) => {
        const cuaMuc = xepCay(dong.filter((d) => d.section === muc));
        const info = mucInfo[muc];
        return (
          <section key={muc} className="lp-muc">
            <div className="lp-muc-dau">
              <div className="lp-muc-ten">
                <span className={`lp-so ${info.lop}`}>{info.so}</span>
                <div>
                  <h2>{info.ten}</h2>
                  <p>
                    Tổng {TONG_TRONG_SO[muc]}% trọng số toàn phiếu · Thang {MAX_SCALE[muc]} điểm
                  </p>
                </div>
              </div>
              {suaDuoc ? (
                <button type="button" className="lp-nut lp-nut-trang" onClick={() => themDong(muc, null)}>
                  <PlusOutlined /> Thêm tiêu chí lớn
                </button>
              ) : (
                cuaMuc.some((d) => d.parentKey) && (
                  <button
                    type="button"
                    className="lp-nut lp-nut-trang"
                    onClick={() => {
                      const cha = cuaMuc.filter((d) => !d.parentKey && cuaMuc.some((c) => c.parentKey === d.key)).map((d) => d.key);
                      const moHet = cha.every((k) => moCon.has(k));
                      setMoCon((cu) => {
                        const moi = new Set(cu);
                        cha.forEach((k) => (moHet ? moi.delete(k) : moi.add(k)));
                        return moi;
                      });
                    }}
                  >
                    {cuaMuc.filter((d) => !d.parentKey && cuaMuc.some((c) => c.parentKey === d.key)).every((d) => moCon.has(d.key))
                      ? 'Gập tất cả'
                      : 'Mở tất cả KPI con'}
                  </button>
                )
              )}
            </div>
            {suaDuoc ? (
            <div className="lp-cuon">
                <table className="lp-table">
                  <colgroup>
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '17%' }} />
                    <col style={{ width: '23%' }} />
                    <col style={{ width: 110 }} />
                    {suaDuoc && <col style={{ width: 210 }} />}
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{info.cotTen}</th>
                      <th>Mục tiêu (Target)</th>
                      <th>{info.cotDo}</th>
                      <th style={{ textAlign: 'center' }}>Trọng số</th>
                      {suaDuoc && <th style={{ textAlign: 'right' }}>Thao tác</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {cuaMuc.length === 0 ? (
                      <tr>
                        <td colSpan={suaDuoc ? 5 : 4} className="lp-rong">
                          {suaDuoc ? 'Chưa có tiêu chí nào. Bấm “Thêm tiêu chí lớn” để bắt đầu.' : 'Mục này chưa có tiêu chí.'}
                        </td>
                      </tr>
                    ) : (
                      cuaMuc.map((d) => {
                        const laCon = Boolean(d.parentKey);
                        const soCon = dong.filter((c) => c.parentKey === d.key).length;
                        return (
                          <tr key={d.key} className={laCon ? 'lp-dong-con' : 'lp-dong-cha'}>
                            <td className={laCon ? 'lp-td-con' : ''}>
                              {laCon && <span className="lp-nhanh" />}
                              {suaDuoc ? (
                                <input
                                  className={`lp-input${laCon ? '' : ' lp-input-dam'}`}
                                  value={d.name}
                                  placeholder={laCon ? 'Tên KPI con (vd: Hoàn thành cấu hình Server và Switch tại cơ quan đối tác)…' : 'Nhập tên tiêu chí lớn (vd: Tiến độ & Chất lượng Triển khai hạ tầng)…'}
                                  onChange={(e) => doiDong(d.key, { name: e.target.value })}
                                />
                              ) : (
                                <span className={laCon ? 'lp-chu' : 'lp-chu lp-chu-dam'}>{d.name || '—'}</span>
                              )}
                            </td>
                            <td>
                              {suaDuoc ? (
                                <input className="lp-input" value={d.measurementText} placeholder={muc === 'BSC_WORK' ? '≥ 95%' : '0 lần'} onChange={(e) => doiDong(d.key, { measurementText: e.target.value })} />
                              ) : (
                                <span className="lp-chu">{d.measurementText || '—'}</span>
                              )}
                            </td>
                            <td>
                              {suaDuoc ? (
                                <input className="lp-input" value={d.measureMethod} placeholder="Cách tính điểm tiêu chí này…" onChange={(e) => doiDong(d.key, { measureMethod: e.target.value })} />
                              ) : (
                                <span className="lp-chu">{d.measureMethod || '—'}</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {suaDuoc ? (
                                <span className="lp-trong-so-o">
                                  <input
                                    className="lp-input lp-input-so"
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    value={d.weight}
                                    placeholder="0"
                                    onChange={(e) => doiDong(d.key, { weight: e.target.value })}
                                  />
                                  <i>%</i>
                                </span>
                              ) : (
                                <span className="lp-trong-so">{d.weight || 0}%</span>
                              )}
                            </td>
                            {suaDuoc && (
                              <td style={{ textAlign: 'right' }}>
                                {laCon ? (
                                  <button type="button" className="lp-nut-nho lp-nut-nho-do" title="Xoá KPI con" onClick={() => xoaDong(d.key)}>
                                    <DeleteOutlined /> Xoá
                                  </button>
                                ) : (
                                  <span className="lp-thao-tac">
                                    <button type="button" className="lp-nut-nho" title="Thêm KPI con" onClick={() => themDong(muc, d.key)}>
                                      + KPI con
                                    </button>
                                    <button type="button" className="lp-nut-nho" title="Chia đều trọng số cho KPI con" disabled={soCon === 0} onClick={() => chiaDeuCon(d.key)}>
                                      Chia đều
                                    </button>
                                    <button type="button" className="lp-nut-xoa" title="Xoá tiêu chí" onClick={() => xoaDong(d.key)}>
                                      <DeleteOutlined />
                                    </button>
                                  </span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
  
            ) : (
              <BangXem
                cuaMuc={cuaMuc}
                info={info}
                chuan={TONG_TRONG_SO[muc]}
                moCon={moCon}
                doiMoCon={doiMoCon}
              />
            )}
          </section>
        );
      })}

      {/* ===== lịch sử */}
      {phieu.events.length > 0 && (
        <section className="lp-the lp-lich-su">
          <h3>
            <ClockCircleOutlined /> Lịch sử phiếu &amp; hoạt động
          </h3>
          <div className="lp-timeline">
            {phieu.events.map((e) => (
              <div key={e.id} className="lp-su-kien">
                <span className={`lp-su-kien-cham${e.action === 'REJECT' || e.action === 'DISPUTE' ? ' lp-cham-do' : e.action === 'CREATE' ? ' lp-cham-xam' : ''}`} />
                <div className="lp-su-kien-dau">
                  <b>{NHAN_HANH_DONG[e.action] ?? e.action}</b>
                  <span>·</span>
                  <span className="lp-su-kien-ai">{e.actor?.fullName ?? 'Hệ thống'}</span>
                  <span>· {ngayGioVN(e.createdAt)}</span>
                </div>
                {e.comment && <p>{e.comment}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal
        open={moGuiLai}
        title="Gửi lại phiếu đang có ý kiến"
        okText="Lưu & Gửi lại"
        cancelText="Huỷ"
        confirmLoading={dangBan}
        okButtonProps={{ disabled: ghiChu.trim().length === 0 }}
        onCancel={() => setMoGuiLai(false)}
        onOk={() => void luuVaGui(ghiChu.trim())}
      >
        <p className="lp-ghi-chu" style={{ marginBottom: 8 }}>
          Phiếu này đang có ý kiến của người nhận. Gửi lại thì bắt buộc ghi chú lý do — ví dụ đã sửa theo góp ý, hoặc đã trao đổi trực tiếp và hai bên thống nhất giữ nguyên. Ghi chú được lưu vào lịch sử phiếu.
        </p>
        <Input.TextArea
          rows={4}
          maxLength={2000}
          showCount
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          placeholder="Ví dụ: đã giảm trọng số tiêu chí 2 từ 30% xuống 20% theo góp ý."
        />
      </Modal>
    </div>
  );
}

// ------------------------------------------------------------ bảng chế độ xem

interface BangXemProps {
  cuaMuc: DongSoan[];
  info: { cotTen: string; cotDo: string; so: number };
  chuan: number;
  moCon: Set<string>;
  doiMoCon: (key: string) => void;
}

/**
 * Bảng chỉ đọc cùng kiểu với bảng kê ở "Phiếu đánh giá của tôi": STT, KPI
 * con gập mặc định (bấm dòng cha để mở), trọng số (%) căn giữa, dòng "Cộng
 * Mục" tô xanh nhạt. Chế độ soạn giữ bảng có ô nhập vì cần thấy mọi dòng.
 */
function BangXem({ cuaMuc, info, chuan, moCon, doiMoCon }: BangXemProps) {
  const cha = cuaMuc.filter((d) => !d.parentKey);
  const tong = tongTrongSo(cha.map((d) => d.weight));
  const tongSo = Number(hienSo(tong));
  return (
    <div className="lp-cuon">
      <table className="lp-table lp-table-xem">
        <colgroup>
          <col style={{ width: 64 }} />
          <col style={{ width: '40%' }} />
          <col style={{ width: '17%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: 130 }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ textAlign: 'center' }}>STT</th>
            <th>{info.cotTen}</th>
            <th>Mục tiêu (Target)</th>
            <th>{info.cotDo}</th>
            <th style={{ textAlign: 'center' }}>Trọng số (%)</th>
          </tr>
        </thead>
        <tbody>
          {cha.length === 0 ? (
            <tr>
              <td colSpan={5} className="lp-rong">Mục này chưa có tiêu chí.</td>
            </tr>
          ) : (
            cha.flatMap((d, i) => {
              const con = cuaMuc.filter((c) => c.parentKey === d.key);
              const mo = moCon.has(d.key);
              const dongCha = (
                <tr
                  key={d.key}
                  className={`lp-dong-cha${con.length > 0 ? ' lp-dong-bam' : ''}${mo ? ' lp-dong-mo' : ''}`}
                  onClick={con.length > 0 ? () => doiMoCon(d.key) : undefined}
                >
                  <td style={{ textAlign: 'center' }}>
                    <span className="lp-stt">{i + 1}</span>
                  </td>
                  <td>
                    <span className="lp-chu lp-chu-dam">
                      {con.length > 0 && <span className={`lp-mui-ten${mo ? ' lp-mui-ten-mo' : ''}`}>▸</span>}
                      {d.name || '—'}
                      {con.length > 0 && (
                        <span className="lp-so-con">
                          {con.length} KPI con{mo ? '' : ' · bấm để xem'}
                        </span>
                      )}
                    </span>
                  </td>
                  <td><span className="lp-chu">{d.measurementText || '—'}</span></td>
                  <td><span className="lp-chu">{d.measureMethod || '—'}</span></td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="lp-trong-so">{d.weight || 0}%</span>
                  </td>
                </tr>
              );
              if (!mo) return [dongCha];
              return [
                dongCha,
                ...con.map((c, j) => (
                  <tr key={c.key} className="lp-dong-con">
                    <td style={{ textAlign: 'center' }}>
                      <span className="lp-stt lp-stt-con">{i + 1}.{j + 1}</span>
                    </td>
                    <td className="lp-td-con">
                      <span className="lp-chu">{c.name || '—'}</span>
                    </td>
                    <td><span className="lp-chu">{c.measurementText || '—'}</span></td>
                    <td><span className="lp-chu">{c.measureMethod || '—'}</span></td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="lp-trong-so lp-trong-so-con">{c.weight || 0}%</span>
                    </td>
                  </tr>
                )),
              ];
            })
          )}
        </tbody>
        {cha.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={2} className="lp-tfoot-nhan">Cộng Mục {info.so}</td>
              <td colSpan={2} className="lp-tfoot-mo">
                {cha.length} tiêu chí cấp 1 · chuẩn {chuan}%
                {tongSo !== chuan && <b className="lp-chu-do"> — {tongSo < chuan ? `thiếu ${hienSo(chuan - tongSo)}` : `thừa ${hienSo(tongSo - chuan)}`}%</b>}
              </td>
              <td style={{ textAlign: 'center' }}>
                <span className={`lp-trong-so lp-trong-so-dam${tongSo === chuan ? '' : ' lp-trong-so-sai'}`}>{hienSo(tong)}%</span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
