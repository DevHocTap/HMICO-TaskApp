import { Alert, Modal, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { layDanhSachMau, layMau } from '../api/kpi-template';
import { hienSo, tongTrongSo } from '../utils/weight';
import { MAX_SCALE, type EditorItem, type KpiSection } from '../types/kpi-template';

interface Props {
  open: boolean;
  onClose: () => void;
  tenMau: string;
  chucDanh: string | null;
  items: EditorItem[];
}

interface DongXem {
  key: string;
  stt: string;
  tieuChi: string;
  /** Với KPI con: cột "Mục tiêu". Với tiêu chí cấp 1: mô tả chung. */
  chiTieu: string;
  cachDo: string;
  trongSo: string;
  thangDiem: string;
  laCap1: boolean;
  /** Tiêu chí cấp 1 CÓ con thì không chấm trực tiếp, điểm tính từ các con. */
  tinhTuCon: boolean;
}

/** Ô để trống cho người chấm điền, vẽ như ô trên biểu mẫu giấy. */
const O_CHAM = <div style={{ minHeight: 22 }} />;

function dungDong(items: EditorItem[], section: KpiSection): DongXem[] {
  const cap1 = items.filter((i) => i.parentKey === null && i.section === section);
  const ra: DongXem[] = [];

  cap1.forEach((cha, i) => {
    const con = items.filter((c) => c.parentKey === cha.key);
    ra.push({
      key: cha.key,
      stt: String(i + 1),
      tieuChi: cha.name || '(chưa đặt tên)',
      chiTieu: cha.description || '',
      cachDo: '',
      trongSo: hienSo(tongTrongSo([cha.weight])),
      thangDiem: String(MAX_SCALE[section]),
      laCap1: true,
      tinhTuCon: con.length > 0,
    });
    con.forEach((c, j) => {
      ra.push({
        key: c.key,
        stt: `${i + 1}.${j + 1}`,
        tieuChi: c.name || '(chưa đặt tên)',
        chiTieu: c.measurementText || '',
        cachDo: c.measureMethod || '',
        trongSo: hienSo(tongTrongSo([c.weight])),
        thangDiem: String(MAX_SCALE[section]),
        laCap1: false,
        tinhTuCon: false,
      });
    });
  });
  return ra;
}

/** Chữ dài phải xuống dòng, và giữ nguyên xuống dòng có sẵn trong file Excel. */
const oChu: React.CSSProperties = {
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const cot: ColumnsType<DongXem> = [
  {
    title: 'STT',
    dataIndex: 'stt',
    width: 48,
    align: 'center',
    render: (v: string, r) => <span style={{ fontWeight: r.laCap1 ? 600 : 400 }}>{v}</span>,
  },
  {
    title: 'Mục tiêu / Tiêu chí đánh giá',
    dataIndex: 'tieuChi',
    width: '22%',
    render: (v: string, r) => (
      <span
        style={{ ...oChu, fontWeight: r.laCap1 ? 600 : 400, paddingLeft: r.laCap1 ? 0 : 14 }}
      >
        {v}
      </span>
    ),
  },
  {
    title: 'Chỉ tiêu cụ thể / Mục tiêu',
    dataIndex: 'chiTieu',
    width: '20%',
    render: (v: string, r) => (
      <span style={oChu}>
        {r.laCap1 && v ? (
          <>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Mục tiêu chung
            </Typography.Text>
            <div style={oChu}>{v}</div>
          </>
        ) : (
          v
        )}
      </span>
    ),
    // Tiêu chí cấp 1 không có "Cách đo" riêng — mô tả chung của nó trải qua
    // cả hai cột để không bị ép vào một cột hẹp và cắt cụt.
    onCell: (r) => ({ colSpan: r.laCap1 ? 2 : 1 }),
  },
  {
    title: 'Cách đo',
    dataIndex: 'cachDo',
    width: '22%',
    render: (v: string) => <span style={oChu}>{v}</span>,
    onCell: (r) => ({ colSpan: r.laCap1 ? 0 : 1 }),
  },
  {
    title: 'Trọng số (%)',
    dataIndex: 'trongSo',
    width: 76,
    align: 'right',
    render: (v: string, r) => <span style={{ fontWeight: r.laCap1 ? 600 : 400 }}>{v}</span>,
  },
  {
    title: 'Thang điểm',
    dataIndex: 'thangDiem',
    width: 76,
    align: 'center',
  },
  {
    title: 'NLĐ tự ĐG',
    key: 'tuCham',
    width: 78,
    align: 'center',
    render: (_, r) =>
      r.tinhTuCon ? (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          tính từ KPI con
        </Typography.Text>
      ) : (
        O_CHAM
      ),
  },
  {
    title: 'TBP đánh giá',
    key: 'quanLyCham',
    width: 86,
    align: 'center',
    render: (_, r) =>
      r.tinhTuCon ? (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          tính từ KPI con
        </Typography.Text>
      ) : (
        O_CHAM
      ),
  },
];

/** Dòng tiêu chí cấp 1 tô nền xám để phân biệt với KPI con được chấm điểm. */
const lopDong = (r: DongXem) => (r.laCap1 ? 'dong-cap-1' : '');

/**
 * Xem trước phiếu theo đúng bố cục biểu mẫu Excel công ty đang dùng.
 *
 * Không phải tính năng phụ. Người duyệt mẫu là HCNS và trưởng phòng — họ
 * cần nhìn thấy thứ quen thuộc mới tin phần mềm làm đúng. Đây cũng là cách
 * nhanh nhất để phát hiện nhập sai.
 *
 * Mục 2 lấy từ mẫu hệ thống chứ không phải mẫu đang soạn: trên phiếu thật
 * hai mục nằm cạnh nhau, xem trước mà thiếu Mục 2 thì không giống biểu mẫu.
 */
export function TemplatePreviewModal({
  open,
  onClose,
  tenMau,
  chucDanh,
  items,
}: Props) {
  const { data: mauHeThong } = useQuery({
    queryKey: ['kpi-template', 'he-thong'],
    queryFn: async () => {
      const ds = await layDanhSachMau();
      const sys = ds.find((t) => t.isSystem);
      return sys ? layMau(sys.id) : null;
    },
    enabled: open,
  });

  const dongMuc1 = dungDong(items, 'BSC_WORK');

  // Ba tiêu chí Mục 2 đều là tiêu chí lá — chấm trực tiếp, không có KPI con
  const dongMuc2: DongXem[] = (mauHeThong?.items ?? []).map((it, i) => ({
    key: it.id,
    stt: String(i + 1),
    tieuChi: it.name,
    chiTieu: it.description ?? '',
    cachDo: it.measureMethod ?? '',
    trongSo: hienSo(tongTrongSo([it.weight])),
    thangDiem: String(MAX_SCALE.COMPLIANCE),
    laCap1: true,
    tinhTuCon: false,
  }));

  const tongMuc1 = tongTrongSo(
    items
      .filter((i) => i.parentKey === null && i.section === 'BSC_WORK')
      .map((i) => i.weight),
  );
  const tongMuc2 = tongTrongSo(dongMuc2.map((d) => d.trongSo));
  const soKpiCon = dongMuc1.filter((d) => !d.laCap1).length;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={onClose}
      width="90vw"
      style={{ top: 24, maxWidth: 1600 }}
      title="Xem trước biểu mẫu"
      okText="Đóng"
      cancelButtonProps={{ style: { display: 'none' } }}
    >
      {/* Nền xám cho dòng tiêu chí cấp 1. Dùng thẻ style thường, không
          dangerouslySetInnerHTML — xem docs/no-ky-thuat.md mục kỷ luật XSS. */}
      <style>{`
        .dong-cap-1 > td { background: #fafafa; }
        .dong-cap-1:hover > td { background: #f0f0f0 !important; }
      `}</style>

      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <Typography.Text strong style={{ fontSize: 15 }}>
          BIỂU MẪU ĐÁNH GIÁ KPI HOÀN THÀNH CÔNG VIỆC
        </Typography.Text>
        <div>
          <Typography.Text type="secondary">
            {tenMau}
            {chucDanh ? ` · Chức danh: ${chucDanh}` : ''}
          </Typography.Text>
        </div>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Chỉ KPI con được chấm điểm"
        description={
          <>
            Dòng <b>nền xám, chữ đậm</b> là tiêu chí chung — nêu mục tiêu, không
            nhập điểm. Điểm của nó tính từ các KPI con thụt vào bên dưới.
            {soKpiCon > 0 && (
              <>
                {' '}Mẫu này có <b>{soKpiCon} KPI con</b> cần chấm ở Mục 1, cộng{' '}
                <b>{dongMuc2.length}</b> tiêu chí ở Mục 2.
              </>
            )}
          </>
        }
      />

      <Typography.Text strong>
        MỤC 1. BSC CÔNG VIỆC — Tổng trọng số: 70%{' '}
        <Typography.Text type={tongMuc1 === 70 ? 'success' : 'warning'}>
          (đang là {hienSo(tongMuc1)})
        </Typography.Text>
      </Typography.Text>
      <Table<DongXem>
        size="small"
        bordered
        tableLayout="fixed"
        rowClassName={lopDong}
        columns={cot}
        dataSource={dongMuc1}
        pagination={false}
        style={{ marginTop: 8, marginBottom: 20 }}
      />

      <Typography.Text strong>
        MỤC 2. CHẤP HÀNH NỘI QUY, QUY ĐỊNH CÔNG TY — Tổng trọng số: 30%{' '}
        <Typography.Text type="secondary">
          (áp dụng chung cho mọi chức danh, đang là {hienSo(tongMuc2)})
        </Typography.Text>
      </Typography.Text>
      <Table<DongXem>
        size="small"
        bordered
        tableLayout="fixed"
        rowClassName={lopDong}
        columns={cot}
        dataSource={dongMuc2}
        pagination={false}
        style={{ marginTop: 8 }}
      />

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Typography.Text strong>
          TỔNG TRỌNG SỐ: {hienSo(tongMuc1 + tongMuc2)}/100
        </Typography.Text>
      </div>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        Thang xếp loại: &lt;80% Chưa đạt · 80–89% Cần cải thiện · 90–100% Hoàn thành ·
        &gt;100% Vượt chỉ tiêu. Hai cột chấm để trống, điền khi đánh giá thật.
      </Typography.Paragraph>
    </Modal>
  );
}
