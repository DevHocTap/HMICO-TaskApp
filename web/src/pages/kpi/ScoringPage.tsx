import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Modal,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { ArrowLeftOutlined, DownloadOutlined, SafetyCertificateOutlined, SwapOutlined, TrophyOutlined, UserOutlined } from '@ant-design/icons';
import { chuVietTat } from '../../utils/period';
import { phanTram } from '../../utils/format';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  chotDiemQuanLy,
  layChiTietPhieu,
  layKyDanhGia,
  layPhieuChamDiem,
  luuDiemQuanLy,
  luuDiemTuCham,
  nopDiemTuCham,
  taiPhieuExcel,
  tiepNhanPhieu,
  traLaiPhieu,
} from '../../api/scorecard';
import { docLoiBlob } from '../../api/report';
import { layThongBaoLoi } from '../../api/client';
import {
  NHAN_XEP_LOAI,
  type XepLoai,
  type DongChamDiem,
  type ODiemGuiLen,
  type PhieuChamDiem,
} from '../../types/scorecard';
import { TEN_MUC } from '../../types/kpi-template';
import { hienDiem, tinhDiemPhieu, type CotCham } from '../../utils/scoring';
import { ngayVN } from '../../utils/format';
import { LichSuPhieu } from '../../components/LichSuPhieu';

/** Màu chữ xếp loại ở ô tóm tắt — cùng bảng với dashboard. */
/** Điểm trong bảng: tối thiểu một chữ số thập phân (6 → "6,0"), tối đa hai (4,75). */
const hienDiemBang = (v: number) =>
  v.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

const MAU_XEP_LOAI_CHU: Record<XepLoai, string> = {
  NOT_ACHIEVED: '#d63b3b',
  NEEDS_IMPROVEMENT: '#e0932b',
  COMPLETED: '#1466a0',
  EXCEEDED: '#15803d',
};

/** Ô người dùng đang sửa, chưa lưu. */
interface ODangSua {
  score?: number | null;
  comment?: string | null;
}

/**
 * Màn chấm điểm — DÙNG CHUNG cho nhân viên tự chấm và trưởng bộ phận chấm.
 *
 * Một màn hình chứ không hai: biểu mẫu giấy có hai cột cạnh nhau, và người
 * chấm cần nhìn cột tự đánh giá trong lúc cho điểm. Tách đôi thì trưởng bộ
 * phận phải mở hai tab để so.
 *
 * Cột nào sửa được phụ thuộc vai trò và trạng thái; cột kia chỉ đọc.
 * `permissions` do backend trả về. ẨN NÚT KHÔNG PHẢI BẢO MẬT — mọi endpoint
 * đều tự kiểm lại từ đầu, đây chỉ để không bày ra thứ bấm vào sẽ báo lỗi.
 */
export function ScoringPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();

  const [dangSua, setDangSua] = useState<Record<string, ODangSua>>({});
  const [moTraLai, setMoTraLai] = useState(false);
  const [lyDoTraLai, setLyDoTraLai] = useState('');
  const [lyDoKhongTuCham, setLyDoKhongTuCham] = useState('');
  // Tiêu chí cấp 1 đang MỞ KPI con. `null` = chưa đụng tới → mặc định theo
  // quyền: đang chấm thì mở hết (phải nhập từng KPI con), chỉ xem thì gập hết
  // (phản hồi 13/09: xem điểm chỉ cần nhìn tiêu chí lớn).
  const [moCon, setMoCon] = useState<Set<string> | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['scorecards', 'scoring', id],
    queryFn: () => layPhieuChamDiem(id),
    enabled: Boolean(id),
  });

  // Lịch sử phiếu nằm ở endpoint chi tiết, chủ phiếu cũng đọc được.
  const { data: chiTiet } = useQuery({
    queryKey: ['scorecards', 'detail', id],
    queryFn: () => layChiTietPhieu(id),
    enabled: Boolean(id),
  });
  // Bốn mốc của kỳ — để in "Hạn chấm 29/10 — còn 4 ngày".
  const { data: cacKy = [] } = useQuery({
    queryKey: ['periods', 'MONTH'],
    queryFn: () => layKyDanhGia('MONTH'),
    staleTime: 5 * 60 * 1000,
  });

  const quyen = data?.permissions;
  // Cột đang sửa. Không ai vừa tự chấm vừa chấm cho mình được, nên hai quyền
  // này không bao giờ cùng bật.
  const cotSua: CotCham | null = quyen?.canEditSelfScores
    ? 'self'
    : quyen?.canEditManagerScores
      ? 'manager'
      : null;

  // Cột CHÍNH của màn: người tự chấm nhìn tổng của mình, mọi người khác nhìn
  // cột trưởng bộ phận (cột quyết định xếp loại).
  const cotChinh: CotCham = cotSua === 'self' ? 'self' : 'manager';

  // Đổi phiếu thì bỏ hết thay đổi chưa lưu, không mang sang phiếu khác.
  useEffect(() => setDangSua({}), [id]);

  function capNhat(itemId: string, thayDoi: ODangSua) {
    setDangSua((truoc) => ({
      ...truoc,
      [itemId]: { ...truoc[itemId], ...thayDoi },
    }));
  }

  /** Giá trị hiển thị: ưu tiên thứ đang gõ, chưa gõ thì lấy từ máy chủ. */
  function diemHienTai(dong: DongChamDiem, cot: CotCham): number | null {
    const sua = dangSua[dong.id];
    if (sua && sua.score !== undefined) return sua.score;
    const goc = cot === 'self' ? dong.selfScore : dong.managerScore;
    return goc === null ? null : Number(goc);
  }

  function ghiChuHienTai(dong: DongChamDiem, cot: CotCham): string {
    const sua = dangSua[dong.id];
    if (sua && sua.comment !== undefined) return sua.comment ?? '';
    return (cot === 'self' ? dong.selfComment : dong.managerComment) ?? '';
  }

  /**
   * Cây tiêu chí kèm điểm ĐANG GÕ, để cột bên phải cập nhật ngay.
   *
   * Số chốt vẫn lấy từ backend sau khi lưu; đây chỉ là bản xem trước.
   */
  const tinhThu = useMemo(() => {
    const items = data?.items ?? [];
    const dongs = items.map((it) => ({
      id: it.id,
      parentId: it.parentId,
      maxScale: it.maxScale,
      weight: it.weight,
      selfScore:
        dangSua[it.id]?.score !== undefined && cotSua === 'self'
          ? (dangSua[it.id].score ?? null)
          : it.selfScore,
      managerScore:
        dangSua[it.id]?.score !== undefined && cotSua === 'manager'
          ? (dangSua[it.id].score ?? null)
          : it.managerScore,
    }));
    return {
      self: tinhDiemPhieu(dongs, 'self'),
      manager: tinhDiemPhieu(dongs, 'manager'),
    };
  }, [data?.items, dangSua, cotSua]);

  const oThayDoi: ODiemGuiLen[] = useMemo(
    () =>
      Object.entries(dangSua).map(([itemId, v]) => ({
        itemId,
        ...(v.score !== undefined ? { score: v.score } : {}),
        ...(v.comment !== undefined ? { comment: v.comment } : {}),
      })),
    [dangSua],
  );

  function sauKhiGhi(moi: PhieuChamDiem, loi: string) {
    queryClient.setQueryData(['scorecards', 'scoring', id], moi);
    void queryClient.invalidateQueries({ queryKey: ['scorecards'] });
    setDangSua({});
    message.success(loi);
  }

  const luuNhap = useMutation({
    mutationFn: () =>
      cotSua === 'self'
        ? luuDiemTuCham(id, oThayDoi)
        : luuDiemQuanLy(id, oThayDoi),
    onSuccess: (moi) => sauKhiGhi(moi, 'Đã lưu nháp'),
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  const gui = useMutation({
    mutationFn: () =>
      cotSua === 'self'
        ? nopDiemTuCham(id)
        : chotDiemQuanLy(id, lyDoKhongTuCham.trim() || undefined),
    onSuccess: (moi) =>
      sauKhiGhi(
        moi,
        cotSua === 'self' ? 'Đã nộp phiếu tự chấm' : 'Đã chốt điểm',
      ),
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  const traLai = useMutation({
    mutationFn: () => traLaiPhieu(id, lyDoTraLai.trim()),
    onSuccess: (moi) => {
      setMoTraLai(false);
      setLyDoTraLai('');
      sauKhiGhi(moi, 'Đã trả phiếu về cho nhân viên chấm lại');
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  const taiExcel = useMutation({
    mutationFn: () => taiPhieuExcel(id!),
    onSuccess: (ten) => message.success(`Đã tải ${ten}`),
    onError: async (e) => message.error((await docLoiBlob(e)) ?? layThongBaoLoi(e)),
  });
  const tiepNhan = useMutation({
    mutationFn: () => tiepNhanPhieu(id),
    onSuccess: (moi) => sauKhiGhi(moi, 'Đã tiếp nhận phiếu'),
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  if (isError) {
    return (
      <Alert
        type="error"
        showIcon
        message="Không mở được phiếu"
        description={layThongBaoLoi(error)}
      />
    );
  }
  if (!data) return <Card loading />;

  const p = data.scorecard;
  const coCon = new Set(
    data.items.map((i) => i.parentId).filter(Boolean) as string[],
  );
  const ky = cacKy.find((k) => k.id === p.periodId);

  /** Ô điểm của một dòng, một cột. */
  function oDiem(dong: DongChamDiem, cot: CotCham) {
    const laCha = coCon.has(dong.id);
    const suaDuoc = cotSua === cot && !laCha;
    const diem = diemHienTai(dong, cot);
    const tran = Number(dong.tranDiem);
    const vuotThang = diem !== null && diem > dong.maxScale;

    if (suaDuoc) {
      return (
        <InputNumber
          value={diem}
          onChange={(v) => capNhat(dong.id, { score: v ?? null })}
          min={0}
          max={tran}
          step={0.5}
          precision={2}
          size="large"
          className="o-nhap-diem"
          status={vuotThang ? 'warning' : undefined}
          placeholder={`0–${hienDiem(tran)}`}
        />
      );
    }

    const tinh = cot === 'self' ? dong.selfComputed : dong.managerComputed;
    const hien = laCha
      ? tinh.diem
      : cot === 'self'
        ? dong.selfScore
        : dong.managerScore;
    if (hien === null) return <span className="cham-o-trong">—</span>;

    // Cột trưởng BP đổi màu số khi lệch với tự chấm (thay cho cột "Chênh lệch" cũ)
    let lop = 'cham-o-diem';
    let goiY: string | undefined;
    if (cot === 'manager' && !laCha) {
      const tu = diemHienTai(dong, 'self');
      if (tu !== null) {
        const lech = Math.round((Number(hien) - tu) * 100) / 100;
        if (lech < 0) {
          lop += ' cham-o-diem-thap';
          goiY = `Thấp hơn tự chấm ${hienDiem(-lech)}`;
        } else if (lech > 0) {
          lop += ' cham-o-diem-cao';
          goiY = `Cao hơn tự chấm ${hienDiem(lech)}`;
        }
      }
    }

    const chip = (
      <span className={lop}>
        <b>{hienDiemBang(Number(hien))}</b>
        <small> / {dong.maxScale}</small>
        {vuotThang && (
          <Tag color="purple" style={{ marginInlineStart: 6 }}>
            vượt
          </Tag>
        )}
      </span>
    );
    return goiY ? <Tooltip title={goiY}>{chip}</Tooltip> : chip;
  }

  const soCon = (chaId: string) =>
    data.items.filter((i) => i.parentId === chaId).length;

  const idCha = data.items.filter((i) => !i.parentId && soCon(i.id) > 0).map((i) => i.id);
  const dangMoCon: Set<string> = moCon ?? new Set(cotSua ? idCha : []);
  const doiMoCon = (id: string) =>
    setMoCon(() => {
      const moi = new Set(dangMoCon);
      if (moi.has(id)) moi.delete(id);
      else moi.add(id);
      return moi;
    });
  const moHetCon = dangMoCon.size >= idCha.length;

  const cayHienThi = (muc: 'BSC_WORK' | 'COMPLIANCE') => {
    const cua = data.items.filter((i) => i.section === muc);
    const cha = cua.filter((i) => !i.parentId);
    const ra: DongChamDiem[] = [];
    for (const c of cha) {
      ra.push(c);
      // KPI con chỉ hiện khi tiêu chí cha đang mở
      if (dangMoCon.has(c.id)) ra.push(...cua.filter((i) => i.parentId === c.id));
    }
    return ra;
  };

  /** Một bảng cho cả hai mục: dòng "mục" là tiêu đề nhóm, còn lại là tiêu chí. */
  type DongBang = DongChamDiem & {
    laMuc?: boolean;
    stt?: string;
    tieuDeMuc?: string;
  };

  const dongBang: DongBang[] = (['BSC_WORK', 'COMPLIANCE'] as const).flatMap(
    (muc, i) => {
      const cua = cayHienThi(muc);
      if (cua.length === 0) return [];
      const tongTrongSo = cua
        .filter((d) => !d.parentId)
        .reduce((a, d) => a + Number(d.weight), 0);
      const thang = cua[0]!.maxScale;
      let soCha = 0;
      let soCon = 0;
      const dau: DongBang = {
        ...cua[0]!,
        id: `muc-${muc}`,
        laMuc: true,
        tieuDeMuc: `Mục ${i + 1} · ${TEN_MUC[muc]} — tổng ${tongTrongSo}% · thang ${thang} điểm`,
      };
      const than = cua.map((d): DongBang => {
        if (!d.parentId) {
          soCha += 1;
          soCon = 0;
          return { ...d, stt: String(soCha).padStart(2, '0') };
        }
        soCon += 1;
        return { ...d, stt: `${soCha}.${soCon}` };
      });
      return [dau, ...than];
    },
  );
  const mucRong = dongBang.length === 0;

  // Ô của dòng "mục" trải hết chiều ngang; các cột khác ẩn (colSpan 0)
  const oMuc = (dong: DongBang) => ({ colSpan: dong.laMuc ? 0 : 1 });

  const cot: ColumnsType<DongBang> = [
    {
      title: 'STT',
      dataIndex: 'stt',
      width: 64,
      align: 'center',
      onCell: (dong) => ({ colSpan: dong.laMuc ? 7 : 1 }),
      render: (stt: string | undefined, dong) =>
        dong.laMuc ? (
          <span className="cham-muc-ten">{dong.tieuDeMuc}</span>
        ) : dong.parentId ? (
          <span className="pt-stt pt-stt-con">{stt}</span>
        ) : (
          <span className="pt-stt">{stt?.replace(/^0/, '')}</span>
        ),
    },
    {
      title: 'Tiêu chí đánh giá',
      dataIndex: 'name',
      // Không đặt width thì cột này nuốt hết chỗ trống và đẩy các cột số ra
      // sát mép phải (phản hồi 13/09).
      width: '34%',
      onCell: oMuc,
      render: (ten: string, dong) =>
        dong.parentId ? (
          <span className="ten-va-phu" style={{ paddingInlineStart: 14 }}>
            <span className="pt-ke-ten pt-ke-ten-con" style={{ paddingLeft: 0 }}>{ten}</span>
            {dong.measureMethod && <small>{dong.measureMethod}</small>}
          </span>
        ) : (
          <span className="ten-va-phu">
            <span className="pt-ke-ten">
              {soCon(dong.id) > 0 && (
                <span className={`cham-mui-ten${dangMoCon.has(dong.id) ? ' cham-mui-ten-mo' : ''}`}>▸</span>
              )}
              {ten}
              {soCon(dong.id) > 0 && (
                <span className="pt-so-con">
                  {soCon(dong.id)} KPI con{dangMoCon.has(dong.id) ? '' : ' · bấm để xem'}
                </span>
              )}
            </span>
            {dong.description && <small>{dong.description}</small>}
          </span>
        ),
    },
    {
      title: 'Mục tiêu (Target)',
      dataIndex: 'measurementText',
      width: '14%',
      onCell: oMuc,
      render: (v: string | null) =>
        v ? <span className="pt-ke-muc-tieu">{v}</span> : <span className="cham-o-trong">—</span>,
    },
    {
      title: 'Trọng số',
      dataIndex: 'weight',
      width: 110,
      align: 'center',
      onCell: oMuc,
      // Con: phần trăm TRONG NHÓM — nhạt hơn để không nhầm với trọng số phiếu
      render: (w: string, dong) => (
        <span
          className={dong.parentId ? 'pt-trong-so pt-trong-so-con' : 'pt-trong-so'}
          title={dong.parentId ? 'Trọng số trong nhóm' : 'Trọng số trên toàn phiếu'}
        >
          {Number(w)}%
        </span>
      ),
    },
    {
      title: 'NV tự chấm',
      key: 'self',
      width: 140,
      align: 'center',
      onCell: oMuc,
      render: (_: unknown, dong) => oDiem(dong, 'self'),
    },
    {
      title: 'Quản lý thẩm định',
      key: 'manager',
      width: 170,
      align: 'center',
      onCell: oMuc,
      render: (_: unknown, dong) => oDiem(dong, 'manager'),
    },
    {
      title: 'Trọng số tháng (%)',
      key: 'dongGop',
      width: 150,
      align: 'center',
      onCell: oMuc,
      render: (_: unknown, dong) => {
        if (dong.parentId) return null;
        // Theo cột chính đang xem; cột kia đã có ở thẻ tổng bên phải
        const dg = tinhThu[cotChinh].theoDong.get(dong.id)?.dongGop;
        return dg === null || dg === undefined ? (
          <span className="cham-o-trong">—</span>
        ) : (
          <b className="pt-chu-xanh">{hienDiem(dg).replace('.', ',')}%</b>
        );
      },
    },
  ];

  /**
   * Ô ghi chú, hiện dưới dòng đang chấm.
   *
   * BẮT BUỘC khi điểm vượt thang — backend từ chối nếu thiếu, nên đây chỉ
   * là báo trước cho người dùng thay vì để họ bấm Lưu rồi mới thấy lỗi.
   */
  function oGhiChu(dong: DongChamDiem) {
    if (!cotSua || coCon.has(dong.id)) return null;
    const diem = diemHienTai(dong, cotSua);
    const vuotThang = diem !== null && diem > dong.maxScale;
    const ghiChu = ghiChuHienTai(dong, cotSua);
    if (!vuotThang && !ghiChu) return null;

    return (
      <div style={{ paddingInlineStart: 20, paddingBlock: 4 }}>
        <Input.TextArea
          rows={2}
          maxLength={2000}
          value={ghiChu}
          status={vuotThang && !ghiChu.trim() ? 'error' : undefined}
          onChange={(e) => capNhat(dong.id, { comment: e.target.value })}
          placeholder={
            vuotThang
              ? `Chấm ${hienDiem(diem)}/${dong.maxScale} là vượt thang — bắt buộc ghi lý do`
              : 'Ghi chú (không bắt buộc)'
          }
        />
      </div>
    );
  }

  const thieuGhiChu = data.items.some((it) => {
    if (!cotSua || coCon.has(it.id)) return false;
    const diem = diemHienTai(it, cotSua);
    return (
      diem !== null && diem > it.maxScale && !ghiChuHienTai(it, cotSua).trim()
    );
  });

  const tinhThuCot = cotSua ? tinhThu[cotSua] : null;
  const nguoiDaNghi = !p.ownerIsActive;
  const canLyDoNghiViec =
    cotSua === 'manager' && nguoiDaNghi && p.resultStatus !== 'SELF_SCORED';

  // ------------------------------------------------ dải trạng thái + hạn
  const hanTheoTrangThai: Record<
    string,
    { nhan: string; ngay: string | null } | null
  > = {
    PENDING: { nhan: 'Hạn tự chấm', ngay: ky?.selfScoreDeadline ?? null },
    REJECTED: { nhan: 'Hạn tự chấm', ngay: ky?.selfScoreDeadline ?? null },
    SELF_SCORED: { nhan: 'Hạn chấm', ngay: ky?.managerScoreDeadline ?? null },
    MANAGER_SCORED: { nhan: 'Hạn tiếp nhận', ngay: ky?.submitDeadline ?? null },
    RECEIVED: null,
  };
  const han = hanTheoTrangThai[p.resultStatus];
  const soNgayConLai = han?.ngay
    ? dayjs(han.ngay).startOf('day').diff(dayjs().startOf('day'), 'day')
    : null;

  // Màu dải: đỏ khi bị trả lại hoặc quá hạn, vàng khi đang chờ CHÍNH người
  // xem, xanh lá khi đã tiếp nhận, còn lại xanh nhạt (chờ người khác).
  const choToi = cotSua !== null || quyen?.canReceive === true;
  const lopDai =
    p.resultStatus === 'REJECTED' || (soNgayConLai !== null && soNgayConLai < 0)
      ? 'cham-diem-dai-do'
      : p.resultStatus === 'RECEIVED'
        ? 'cham-diem-dai-xanh-la'
        : choToi
          ? 'cham-diem-dai-vang'
          : '';

  const dongTrangThai = (() => {
    switch (p.resultStatus) {
      case 'PENDING':
        return cotSua === 'self'
          ? 'Bạn đang tự chấm — nộp trước hạn để trưởng bộ phận kịp chấm'
          : 'Chờ nhân viên tự chấm';
      case 'SELF_SCORED':
        return `Nhân viên đã tự chấm ${ngayVN(p.selfScoredAt)} · ${cotSua === 'manager' ? 'chờ bạn chốt điểm' : 'chờ trưởng bộ phận chốt điểm'}`;
      case 'MANAGER_SCORED':
        return `Đã chốt điểm ${ngayVN(p.managerScoredAt)} · ${quyen?.canReceive ? 'chờ bạn tiếp nhận' : 'chờ HCNS tiếp nhận'}`;
      case 'REJECTED':
        return `Bị trả lại ${ngayVN(p.rejectedAt)} — cần tự chấm lại`;
      default:
        return `HCNS đã tiếp nhận ${ngayVN(p.receivedAt)}`;
    }
  })();

  // ------------------------------------------------------- ô tóm tắt
  const coCaHai = tinhThu.self.daChamDu && tinhThu.manager.daChamDu;
  const lechTong = coCaHai
    ? Math.round((tinhThu.manager.tongDiem - tinhThu.self.tongDiem) * 100) / 100
    : null;
  const xepLoai = p.grade ?? data.managerPreview?.xepLoai ?? null;

  const cacLa = data.items.filter((it) => !coCon.has(it.id));
  const soLa = cacLa.length;
  const soLaDaCham = cacLa.filter(
    (it) => diemHienTai(it, cotChinh) !== null,
  ).length;
  const cotTrong = (cot: CotCham) =>
    !cacLa.some((it) => diemHienTai(it, cot) !== null);
  const ghiChuTuCham = cacLa
    .filter((it) => (it.selfComment ?? '').trim())
    .map((it) => ({ id: it.id, ten: it.name, noiDung: it.selfComment! }));
  const ghiChuQuanLy = cacLa
    .filter((it) => ghiChuHienTai(it, 'manager').trim())
    .map((it) => ({
      id: it.id,
      ten: it.name,
      noiDung: ghiChuHienTai(it, 'manager'),
    }));
  const tieuDeGhiChu = (ten: string, so: number) => (
    <span className="viec-tieu-de">
      {ten}
      <Typography.Text
        type="secondary"
        style={{ fontSize: 13, fontWeight: 400 }}
      >
        {so} ghi chú
      </Typography.Text>
    </span>
  );

  const nutHanhDong = (
    <>
      <Tooltip title="Tải phiếu này ra Excel theo biểu mẫu BM.01 (kèm sheet KPI con)">
        <Button
          shape="round"
          size="large"
          icon={<DownloadOutlined />}
          loading={taiExcel.isPending}
          onClick={() => taiExcel.mutate()}
        >
          Tải phiếu (.xlsx)
        </Button>
      </Tooltip>
      {quyen?.canReject && (
        <Button
          shape="round"
          size="large"
          danger
          onClick={() => setMoTraLai(true)}
        >
          {cotSua === 'manager' || quyen?.canReject
            ? 'Yêu cầu NV chấm lại'
            : 'Trả lại'}
        </Button>
      )}
      {cotSua && (
        <>
          <Button
            shape="round"
            size="large"
            loading={luuNhap.isPending}
            disabled={oThayDoi.length === 0 || thieuGhiChu}
            onClick={() => luuNhap.mutate()}
          >
            Lưu nháp{oThayDoi.length > 0 ? ` (${oThayDoi.length})` : ''}
          </Button>
          <Tooltip
            title={
              oThayDoi.length > 0
                ? 'Lưu nháp trước khi gửi, nếu không phần vừa gõ sẽ không được tính.'
                : undefined
            }
          >
            <Button
              type="primary"
              shape="round"
              size="large"
              loading={gui.isPending}
              disabled={
                oThayDoi.length > 0 ||
                thieuGhiChu ||
                !tinhThuCot?.daChamDu ||
                (canLyDoNghiViec && lyDoKhongTuCham.trim().length < 5)
              }
              onClick={() =>
                modal.confirm({
                  title:
                    cotSua === 'self' ? 'Nộp phiếu tự chấm?' : 'Chốt điểm?',
                  content:
                    cotSua === 'self'
                      ? 'Nộp xong bạn không sửa được nữa. Muốn sửa thì phải nhờ trưởng bộ phận trả phiếu lại.'
                      : 'Chốt xong điểm không sửa được nữa. Muốn chấm lại thì phải trả phiếu về cho nhân viên.',
                  okText: 'Đồng ý',
                  cancelText: 'Huỷ',
                  onOk: () => gui.mutate(),
                })
              }
            >
              {cotSua === 'self'
                ? 'Nộp phiếu tự chấm'
                : 'Phê duyệt & chốt điểm'}
              {tinhThuCot?.daChamDu
                ? ` (${hienDiem(tinhThuCot.tongDiem).replace('.', ',')})`
                : ''}
            </Button>
          </Tooltip>
        </>
      )}
      {quyen?.canReceive && (
        <Button
          type="primary"
          shape="round"
          size="large"
          loading={tiepNhan.isPending}
          onClick={() => tiepNhan.mutate()}
        >
          Tiếp nhận
        </Button>
      )}
    </>
  );

  return (
    <div>
      {/* ---------------------------------------------- thanh tiêu đề (13/09) */}
      <div className="cd-thanh">
        <div className="cd-thanh-trai">
          <button type="button" className="cd-quay-lai" onClick={() => navigate(-1)}>
            <ArrowLeftOutlined /> Quay lại
          </button>
          <div className="cd-tieu-de">
            <div className="cd-tieu-de-hang">
              <h1>Phiếu đánh giá KPI {p.periodName.toLowerCase()}</h1>
              <span className={`tag-trang-thai cd-tag ${lopDai}`}>
                {dongTrangThai}
                {han?.ngay && soNgayConLai !== null && (
                  <>
                    {' '}· {han.nhan.toLowerCase()} {ngayVN(han.ngay)}
                    {soNgayConLai < 0 ? ` — quá hạn ${-soNgayConLai} ngày` : soNgayConLai === 0 ? ' — hôm nay' : ` — còn ${soNgayConLai} ngày`}
                  </>
                )}
              </span>
            </div>
            <p className="cd-mo-ta">
              {cotSua === 'manager'
                ? 'Thẩm định điểm tự chấm của nhân viên, ghi nhận xét và chốt điểm cấp phòng.'
                : cotSua === 'self'
                  ? 'Tự đánh giá từng tiêu chí rồi nộp để trưởng bộ phận thẩm định.'
                  : 'Phiếu đang ở chế độ chỉ đọc.'}
            </p>
          </div>
        </div>
        <div className="cd-thanh-phai">{nutHanhDong}</div>
      </div>

      {p.periodIsLocked && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Kỳ này đã chốt sổ"
          description="Không ghi điểm được nữa. Muốn sửa thì HCNS hoặc ban giám đốc phải mở lại kỳ."
        />
      )}
      {p.assignStatus !== 'ACCEPTED' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Phiếu chưa được ký nhận"
          description="Nhân viên phải ký nhận KPI đầu kỳ thì mới bắt đầu chấm điểm được."
        />
      )}
      {p.resultStatus === 'REJECTED' && p.rejectReason && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="Lý do trả lại"
          description={p.rejectReason}
        />
      )}
      {nguoiDaNghi && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={`${p.ownerName ?? 'Nhân viên'} đã nghỉ việc`}
          description={
            p.noSelfScoreReason
              ? `Phiếu chốt không có cột tự chấm. Lý do đã ghi: ${p.noSelfScoreReason}`
              : 'Phiếu chốt được khi cột tự chấm còn trống, nhưng bắt buộc ghi lý do.'
          }
        />
      )}

      {/* ---------------------------------------------- 5 thẻ tóm tắt (13/09) */}
      <div className="cd-luoi">
        <div className="cd-the cd-the-nguoi">
          <div className="cd-nguoi">
            <span className="cd-avatar">{chuVietTat(p.ownerName ?? '?')}</span>
            <div>
              <div className="cd-nguoi-ten">{p.ownerName ?? '—'}</div>
              <div className="cd-nguoi-phu">
                {p.jobTitleName} · {p.departmentName}
              </div>
            </div>
          </div>
          <div className="cd-tien-trinh">
            <div className="cd-tien-trinh-dau">
              <span>Tiến trình chấm</span>
              <b>
                {soLaDaCham}/{soLa} tiêu chí
              </b>
            </div>
            <div className="cd-thanh-do">
              <span style={{ width: `${phanTram(soLaDaCham, soLa)}%` }} />
            </div>
          </div>
          <div className="cd-the-chan">
            <span>Người chấm</span>
            <b>{chiTiet?.evaluator?.fullName ?? '—'}</b>
          </div>
        </div>

        <div className="cd-the">
          <div className="cd-the-dau">
            <span className="cd-nhan">NV tự chấm</span>
            <span className="cd-icon cd-icon-xam"><UserOutlined /></span>
          </div>
          <div className="cd-so">
            {tinhThu.self.daChamDu || !cotTrong('self') ? hienDiem(tinhThu.self.tongDiem).replace('.', ',') : '—'}
            <small>/ 100</small>
          </div>
          <div className="cd-phu">
            {p.selfScoredAt ? `Đã nộp ${ngayVN(p.selfScoredAt)}` : cotSua === 'self' ? 'Đang chấm — tự tính khi gõ' : 'Chưa nộp'}
          </div>
        </div>

        <div className="cd-the">
          <div className="cd-the-dau">
            <span className="cd-nhan">Trưởng BP chấm</span>
            <span className="cd-icon cd-icon-xanh"><SafetyCertificateOutlined /></span>
          </div>
          <div className="cd-so cd-so-xanh">
            {cotTrong('manager') ? '—' : hienDiem(tinhThu.manager.tongDiem).replace('.', ',')}
            <small>/ 100</small>
          </div>
          <div className="cd-phu">
            {p.managerScoredAt ? `Chốt ${ngayVN(p.managerScoredAt)}` : cotSua === 'manager' ? 'Cập nhật trực tiếp theo bảng' : 'Chưa chấm'}
          </div>
        </div>

        <div className="cd-the">
          <div className="cd-the-dau">
            <span className="cd-nhan">Độ lệch điểm</span>
            <span className={`cd-icon ${lechTong === null ? 'cd-icon-xam' : lechTong < 0 ? 'cd-icon-do' : lechTong > 0 ? 'cd-icon-xanh-la' : 'cd-icon-xam'}`}>
              <SwapOutlined />
            </span>
          </div>
          <div className={`cd-so ${lechTong === null ? '' : lechTong < 0 ? 'cd-so-do' : lechTong > 0 ? 'cd-so-xanh-la' : ''}`}>
            {lechTong === null ? '—' : `${lechTong > 0 ? '+' : lechTong < 0 ? '−' : ''}${hienDiem(Math.abs(lechTong)).replace('.', ',')}`}
            <small>điểm</small>
          </div>
          <div className="cd-phu">{lechTong === null ? 'Cần đủ cả hai cột' : 'Trưởng BP so với tự chấm'}</div>
        </div>

        <div
          className="cd-the cd-the-xep-loai"
          style={xepLoai && tinhThu.manager.daChamDu ? { borderLeftColor: MAU_XEP_LOAI_CHU[xepLoai], background: `${MAU_XEP_LOAI_CHU[xepLoai]}0d` } : undefined}
        >
          <div className="cd-the-dau">
            <span className="cd-nhan">{p.grade ? 'Xếp loại' : 'Dự kiến xếp loại'}</span>
            <span className="cd-icon" style={xepLoai && tinhThu.manager.daChamDu ? { color: MAU_XEP_LOAI_CHU[xepLoai], background: `${MAU_XEP_LOAI_CHU[xepLoai]}1a` } : undefined}>
              <TrophyOutlined />
            </span>
          </div>
          <div className="cd-so" style={{ color: xepLoai && tinhThu.manager.daChamDu ? MAU_XEP_LOAI_CHU[xepLoai] : undefined }}>
            {xepLoai && tinhThu.manager.daChamDu ? NHAN_XEP_LOAI[xepLoai] : '—'}
          </div>
          <div className="cd-phu">
            {tinhThuCot && !tinhThuCot.daChamDu ? `Còn ${tinhThuCot.thieuDiem.length} tiêu chí chưa chấm` : 'Chỉ tính trên cột trưởng bộ phận'}
          </div>
        </div>
      </div>

      <div className="cham-diem-trai">
        <Card
          styles={{ body: { padding: 0 } }}
          title={
            <span className="viec-tieu-de">
              Chi tiết thẩm định chỉ số KPI
              <Typography.Text
                type="secondary"
                style={{ fontSize: 13, fontWeight: 400 }}
              >
                {soLa} tiêu chí chấm điểm
              </Typography.Text>
            </span>
          }
          extra={
            idCha.length > 0 && (
              <Button size="small" onClick={() => setMoCon(new Set(moHetCon ? [] : idCha))}>
                {moHetCon ? 'Gập tất cả' : 'Mở tất cả'}
              </Button>
            )
          }
        >
          {mucRong ? (
            <Empty
              style={{ padding: 32 }}
              description="Phiếu chưa có tiêu chí nào"
            />
          ) : (
            <Table<DongBang>
              rowKey="id"
              size="middle"
              className="bang-cham"
              columns={cot}
              dataSource={dongBang}
              pagination={false}
              scroll={{ x: 900 }}
              rowClassName={(d) =>
                d.laMuc ? 'dong-muc' : d.parentId ? '' : `dong-cha${soCon(d.id) > 0 ? ' dong-cha-bam' : ''}`
              }
              onRow={(d) => ({
                onClick: () => {
                  if (!d.laMuc && !d.parentId && soCon(d.id) > 0) doiMoCon(d.id);
                },
              })}
              expandable={{
                expandedRowRender: oGhiChu,
                rowExpandable: (dong) => !dong.laMuc && Boolean(oGhiChu(dong)),
                expandedRowKeys: dongBang
                  .filter((d) => !d.laMuc && oGhiChu(d))
                  .map((d) => d.id),
                showExpandColumn: false,
              }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row className="dong-tong-ket">
                    <Table.Summary.Cell index={0} colSpan={2} align="right">
                      <span className="cham-tong-nhan">Tổng cộng</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={2}>
                      <span className="cham-tong-mo">Xếp loại chỉ tính trên cột quản lý thẩm định</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={3} align="center">
                      <span className="pt-trong-so pt-trong-so-dam">100%</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="center">
                      <span className="cham-tong-so">
                        {cotTrong('self') ? '—' : hienDiem(tinhThu.self.tongDiem).replace('.', ',')}
                        <small> / 100</small>
                      </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="center">
                      <span className="cham-tong-so">
                        {cotTrong('manager') ? '—' : hienDiem(tinhThu.manager.tongDiem).replace('.', ',')}
                        <small> / 100</small>
                      </span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="center">
                      <span className="cham-tong-lon">
                        {cotTrong(cotChinh) ? '—' : `${hienDiem(tinhThu[cotChinh].tongDiem).replace('.', ',')}%`}
                      </span>
                      {xepLoai && tinhThu.manager.daChamDu && (
                        <Tag
                          style={{
                            marginInlineStart: 8,
                            background: `${MAU_XEP_LOAI_CHU[xepLoai]}1a`,
                            color: MAU_XEP_LOAI_CHU[xepLoai],
                            border: 0,
                            fontWeight: 700,
                          }}
                        >
                          {NHAN_XEP_LOAI[xepLoai]}
                        </Tag>
                      )}
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          )}
        </Card>

        {canLyDoNghiViec && (
          <Card title="Lý do không có điểm tự chấm">
            <Input.TextArea
              rows={2}
              maxLength={2000}
              value={lyDoKhongTuCham}
              onChange={(e) => setLyDoKhongTuCham(e.target.value)}
              placeholder="Ví dụ: nhân viên đã nghỉ việc từ 15/08, không tự chấm được."
            />
          </Card>
        )}

        {!cotSua && !quyen?.canReject && !quyen?.canReceive && (
          <Typography.Text type="secondary">
            Bạn đang xem phiếu ở chế độ chỉ đọc.
          </Typography.Text>
        )}
      </div>

      <div className="cham-duoi-luoi">
        <Card
          title={tieuDeGhiChu(
            'Ý kiến & giải trình của nhân viên',
            ghiChuTuCham.length,
          )}
        >
          {ghiChuTuCham.length === 0 ? (
            <Typography.Text type="secondary">
              Nhân viên không ghi chú tiêu chí nào.
            </Typography.Text>
          ) : (
            ghiChuTuCham.map((g) => (
              <blockquote key={g.id} className="ghi-chu-khoi">
                <Typography.Text strong>{g.ten}</Typography.Text>
                <div>{g.noiDung}</div>
              </blockquote>
            ))
          )}
        </Card>
        <Card
          title={tieuDeGhiChu(
            'Nhận xét của trưởng bộ phận',
            ghiChuQuanLy.length,
          )}
        >
          {ghiChuQuanLy.length === 0 ? (
            <Typography.Text type="secondary">
              Trưởng bộ phận chưa ghi nhận xét nào.
            </Typography.Text>
          ) : (
            ghiChuQuanLy.map((g) => (
              <blockquote key={g.id} className="ghi-chu-khoi ghi-chu-khoi-ql">
                <Typography.Text strong>{g.ten}</Typography.Text>
                <div>{g.noiDung}</div>
              </blockquote>
            ))
          )}
        </Card>
        {chiTiet && <LichSuPhieu events={chiTiet.events} />}
      </div>

      <div className="thanh-hanh-dong-day">
        <Button
          shape="round"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
        >
          Quay lại danh sách
        </Button>
        <Typography.Text type="secondary" style={{ flex: 1, fontSize: 12 }}>
          Mọi thay đổi điểm số đều ghi vào lịch sử phiếu và nhật ký hệ thống.
        </Typography.Text>
        {nutHanhDong}
      </div>

      <Modal
        open={moTraLai}
        title="Trả phiếu về cho nhân viên chấm lại"
        okText="Trả lại"
        cancelText="Huỷ"
        confirmLoading={traLai.isPending}
        okButtonProps={{ danger: true, disabled: lyDoTraLai.trim().length < 5 }}
        onCancel={() => setMoTraLai(false)}
        onOk={() => traLai.mutate()}
      >
        <Typography.Paragraph type="secondary">
          Nêu rõ chỗ cần chấm lại. Nhân viên sẽ tự chấm lại rồi nộp lên, phiếu
          không bị huỷ. Lý do được lưu vào lịch sử phiếu.
        </Typography.Paragraph>
        <Input.TextArea
          rows={4}
          maxLength={2000}
          showCount
          value={lyDoTraLai}
          onChange={(e) => setLyDoTraLai(e.target.value)}
          placeholder="Ví dụ: tiêu chí tiến độ tự chấm cao hơn thực tế, đề nghị chấm lại."
        />
      </Modal>

      {isLoading && <Card loading />}
    </div>
  );
}
