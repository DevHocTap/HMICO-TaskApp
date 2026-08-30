import { Modal, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { layDanhSachMau, layMau } from '../api/kpi-template';
import { hienSo, tongTrongSo } from '../utils/weight';
import {
  MAX_SCALE,
  type EditorItem,
  type KpiSection,
} from '../types/kpi-template';

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
  chiTieu: string;
  trongSo: string;
  thangDiem: string;
  laCha: boolean;
}

/** Dựng các dòng hiển thị cho một mục, theo đúng thứ tự trên biểu mẫu. */
function dungDong(items: EditorItem[], section: KpiSection): DongXem[] {
  const cap1 = items.filter((i) => i.parentKey === null && i.section === section);
  const ra: DongXem[] = [];

  cap1.forEach((cha, i) => {
    ra.push({
      key: cha.key,
      stt: String(i + 1),
      tieuChi: cha.name || '(chưa đặt tên)',
      chiTieu: cha.description || '',
      trongSo: hienSo(tongTrongSo([cha.weight])),
      thangDiem: String(MAX_SCALE[section]),
      laCha: true,
    });
    items
      .filter((c) => c.parentKey === cha.key)
      .forEach((con, j) => {
        ra.push({
          key: con.key,
          stt: `${i + 1}.${j + 1}`,
          tieuChi: con.name || '(chưa đặt tên)',
          // Trên biểu mẫu, KPI con hiện mục tiêu và cách đo ở cột "Chỉ tiêu"
          chiTieu: [con.measurementText, con.measureMethod]
            .filter(Boolean)
            .join(' — '),
          trongSo: hienSo(tongTrongSo([con.weight])),
          thangDiem: String(MAX_SCALE[section]),
          laCha: false,
        });
      });
  });
  return ra;
}

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
  // Mẫu hệ thống chứa Mục 2, tự nối vào mọi phiếu
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
  const dongMuc2 = (mauHeThong?.items ?? []).map((it, i) => ({
    key: it.id,
    stt: String(i + 1),
    tieuChi: it.name,
    chiTieu: it.description ?? '',
    trongSo: hienSo(tongTrongSo([it.weight])),
    thangDiem: String(MAX_SCALE.COMPLIANCE),
    laCha: true,
  }));

  const tongMuc1 = tongTrongSo(
    items.filter((i) => i.parentKey === null && i.section === 'BSC_WORK').map((i) => i.weight),
  );
  const tongMuc2 = tongTrongSo(dongMuc2.map((d) => d.trongSo));

  const cot = [
    { title: 'STT', dataIndex: 'stt', width: 60 },
    {
      title: 'Mục tiêu / Tiêu chí đánh giá',
      dataIndex: 'tieuChi',
      render: (v: string, r: DongXem) => (
        <span style={{ fontWeight: r.laCha ? 600 : 400, paddingLeft: r.laCha ? 0 : 16 }}>
          {v}
        </span>
      ),
    },
    { title: 'Chỉ tiêu cụ thể / Cách đo', dataIndex: 'chiTieu' },
    { title: 'Trọng số (%)', dataIndex: 'trongSo', width: 110, align: 'right' as const },
    { title: 'Thang điểm tối đa', dataIndex: 'thangDiem', width: 110, align: 'center' as const },
    { title: 'NLĐ tự đánh giá', dataIndex: 'tuChamKhong', width: 120, render: () => '' },
    { title: 'Trưởng bộ phận đánh giá', dataIndex: 'quanLyChamKhong', width: 140, render: () => '' },
  ];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={onClose}
      width={1100}
      title="Xem trước biểu mẫu"
      okText="Đóng"
      cancelButtonProps={{ style: { display: 'none' } }}
    >
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

      <Typography.Text strong>
        MỤC 1. BSC CÔNG VIỆC — Tổng trọng số: 70%{' '}
        <Typography.Text type={tongMuc1 === 70 ? 'success' : 'warning'}>
          (đang là {hienSo(tongMuc1)})
        </Typography.Text>
      </Typography.Text>
      <Table<DongXem>
        size="small"
        bordered
        columns={cot}
        dataSource={dongMuc1}
        pagination={false}
        scroll={{ x: 'max-content' }}
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
        columns={cot}
        dataSource={dongMuc2}
        pagination={false}
        scroll={{ x: 'max-content' }}
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
