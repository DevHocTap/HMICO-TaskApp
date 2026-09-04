import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  guiPhieuDiKy,
  layChiTietPhieu,
  luuItemPhieu,
  type DongLuuPhieu,
} from '../../api/scorecard';
import { layThongBaoLoi } from '../../api/client';
import {
  MAU_TRANG_THAI_GIAO,
  NHAN_TRANG_THAI_GIAO,
  type DongPhieuKpi,
} from '../../types/scorecard';
import { MAX_SCALE, TEN_MUC, TONG_TRONG_SO } from '../../types/kpi-template';
import type { KpiSection } from '../../types/kpi-template';
import { bang, chiaDeu, hienSo, tongTrongSo } from '../../utils/weight';
import { useAuth } from '../../auth/useAuth';
import { coTheGiaoKpi } from '../../auth/permissions';

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

const NHAN_HANH_DONG: Record<string, string> = {
  CREATE: 'Lập phiếu',
  UPDATE_ITEMS: 'Sửa nội dung',
  PROPOSE: 'Gửi đi ký nhận',
  RE_PROPOSED_UNCHANGED: 'Gửi lại nguyên trạng',
  ACCEPT: 'Ký nhận',
  DISPUTE: 'Nêu ý kiến',
  SELF_SCORE: 'Tự chấm',
  MANAGER_SCORE: 'Trưởng phòng chấm',
  REJECT: 'Trả lại',
  RECEIVE: 'HCNS tiếp nhận',
  REOPEN: 'Mở lại',
};

function ngayGioVN(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(new Date(iso));
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

export function ScorecardDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [dangSoan, setDangSoan] = useState(false);
  const [dong, setDong] = useState<DongSoan[]>([]);
  const [moGuiLai, setMoGuiLai] = useState(false);
  const [ghiChu, setGhiChu] = useState('');

  const { data: phieu, isLoading } = useQuery({
    queryKey: ['scorecards', 'detail', id],
    queryFn: () => layChiTietPhieu(id),
    enabled: Boolean(id),
  });

  // Nạp lại bản nháp mỗi khi phiếu đổi, nhưng KHÔNG đè lên thứ đang gõ dở.
  useEffect(() => {
    if (phieu && !dangSoan) setDong(tuPhieu(phieu.items));
  }, [phieu, dangSoan]);

  const laNguoiGiao = coTheGiaoKpi(user?.role);
  const suaDuoc =
    laNguoiGiao &&
    !phieu?.period.isLocked &&
    (phieu?.assignStatus === 'DRAFT' || phieu?.assignStatus === 'DISPUTED');

  const tongTheoMuc = useMemo(() => {
    const cap1 = dong.filter((d) => !d.parentKey);
    return {
      BSC_WORK: tongTrongSo(cap1.filter((d) => d.section === 'BSC_WORK').map((d) => d.weight)),
      COMPLIANCE: tongTrongSo(
        cap1.filter((d) => d.section === 'COMPLIANCE').map((d) => d.weight),
      ),
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
          return bang(tong, 100) ? null : { ten: cha.name, tong };
        })
        .filter((x): x is { ten: string; tong: number } => x !== null),
    [dong],
  );

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
      message.success('Đã lưu nội dung phiếu');
      setDangSoan(false);
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

  function themDong(section: KpiSection, parentKey: string | null) {
    setDong((cu) => [
      ...cu,
      {
        key: khoaMoi(),
        parentKey,
        name: '',
        section,
        measurementText: '',
        measureMethod: '',
        weight: '',
      },
    ]);
  }

  /** Xoá một dòng, kèm mọi KPI con của nó — không để con mồ côi. */
  function xoaDong(key: string) {
    setDong((cu) => cu.filter((d) => d.key !== key && d.parentKey !== key));
  }

  function doiDong(key: string, thayDoi: Partial<DongSoan>) {
    setDong((cu) => cu.map((d) => (d.key === key ? { ...d, ...thayDoi } : d)));
  }

  /** Chia đều trọng số cho các con của một tiêu chí, phần dư dồn lên đầu. */
  function chiaDeuCon(chaKey: string) {
    const con = dong.filter((d) => d.parentKey === chaKey);
    const phan = chiaDeu(100, con.length);
    setDong((cu) =>
      cu.map((d) => {
        const i = con.findIndex((c) => c.key === d.key);
        return i >= 0 ? { ...d, weight: hienSo(phan[i]) } : d;
      }),
    );
  }

  const cotXem: ColumnsType<DongPhieuKpi> = [
    {
      title: 'Tiêu chí',
      dataIndex: 'name',
      render: (ten: string, d) =>
        d.parentId ? (
          <span style={{ paddingInlineStart: 20 }}>{ten}</span>
        ) : (
          <Typography.Text strong>{ten}</Typography.Text>
        ),
    },
    { title: 'Mục tiêu', dataIndex: 'measurementText', width: 150 },
    { title: 'Cách đo', dataIndex: 'measureMethod', width: 260 },
    {
      title: 'Trọng số',
      dataIndex: 'weight',
      width: 110,
      align: 'right',
      render: (w: string, d) => `${Number(w)}${d.parentId ? '% nhóm' : '%'}`,
    },
    { title: 'Thang điểm', dataIndex: 'maxScale', width: 100, align: 'right' },
  ];

  const cotSoan: ColumnsType<DongSoan> = [
    {
      title: 'Tiêu chí',
      dataIndex: 'name',
      render: (_, d) => (
        <Input
          value={d.name}
          placeholder={d.parentKey ? 'Tên KPI con' : 'Tên tiêu chí lớn'}
          style={{ marginInlineStart: d.parentKey ? 20 : 0 }}
          onChange={(e) => doiDong(d.key, { name: e.target.value })}
        />
      ),
    },
    {
      title: 'Mục tiêu',
      dataIndex: 'measurementText',
      width: 150,
      render: (_, d) => (
        <Input
          value={d.measurementText}
          placeholder="≥ 95%"
          onChange={(e) => doiDong(d.key, { measurementText: e.target.value })}
        />
      ),
    },
    {
      title: 'Cách đo',
      dataIndex: 'measureMethod',
      width: 260,
      render: (_, d) => (
        <Input
          value={d.measureMethod}
          placeholder="Cách tính điểm tiêu chí này"
          onChange={(e) => doiDong(d.key, { measureMethod: e.target.value })}
        />
      ),
    },
    {
      title: 'Trọng số',
      dataIndex: 'weight',
      width: 110,
      render: (_, d) => (
        <InputNumber
          value={d.weight === '' ? null : Number(d.weight)}
          min={0}
          max={100}
          step={1}
          style={{ width: '100%' }}
          addonAfter="%"
          onChange={(v) => doiDong(d.key, { weight: v === null ? '' : String(v) })}
        />
      ),
    },
    {
      title: '',
      width: 190,
      render: (_, d) =>
        d.parentKey ? (
          <Button size="small" icon={<DeleteOutlined />} onClick={() => xoaDong(d.key)}>
            Xoá
          </Button>
        ) : (
          <Space size={4}>
            <Button size="small" onClick={() => themDong(d.section, d.key)}>
              + KPI con
            </Button>
            <Button
              size="small"
              disabled={dong.filter((c) => c.parentKey === d.key).length === 0}
              onClick={() => chiaDeuCon(d.key)}
            >
              Chia đều
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => xoaDong(d.key)} />
          </Space>
        ),
    },
  ];

  if (!phieu && !isLoading) {
    return <Alert type="error" showIcon message="Không tìm thấy phiếu KPI này" />;
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space align="center" wrap style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
            Quay lại
          </Button>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {phieu?.ownerUser?.fullName ?? 'Phiếu KPI'}
            {phieu && ` — ${phieu.period.name}`}
          </Typography.Title>
          {phieu && (
            <Tag color={MAU_TRANG_THAI_GIAO[phieu.assignStatus]}>
              {NHAN_TRANG_THAI_GIAO[phieu.assignStatus]}
            </Tag>
          )}
        </Space>
        {suaDuoc && (
          <Space>
            {dangSoan ? (
              <>
                <Button
                  onClick={() => {
                    setDangSoan(false);
                    if (phieu) setDong(tuPhieu(phieu.items));
                  }}
                >
                  Huỷ
                </Button>
                <Button type="primary" loading={luu.isPending} onClick={() => luu.mutate()}>
                  Lưu nội dung
                </Button>
              </>
            ) : (
              <>
                <Button icon={<PlusOutlined />} onClick={() => setDangSoan(true)}>
                  Sửa nội dung KPI
                </Button>
                <Button
                  type="primary"
                  loading={gui.isPending}
                  onClick={() =>
                    phieu?.assignStatus === 'DISPUTED'
                      ? setMoGuiLai(true)
                      : gui.mutate(undefined)
                  }
                >
                  {phieu?.assignStatus === 'DISPUTED' ? 'Gửi lại' : 'Gửi đi ký nhận'}
                </Button>
              </>
            )}
          </Space>
        )}
      </Space>

      {phieu?.assignStatus === 'DISPUTED' && phieu.disputeReason && (
        <Alert
          type="warning"
          showIcon
          message={`${phieu.ownerUser?.fullName ?? 'Nhân viên'} đã nêu ý kiến`}
          description={
            <>
              <div>{phieu.disputeReason}</div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {ngayGioVN(phieu.disputedAt)}
              </Typography.Text>
            </>
          }
        />
      )}

      {phieu?.period.isLocked && (
        <Alert
          type="warning"
          showIcon
          message={`Kỳ ${phieu.period.name} đã khoá sổ`}
          description="Không sửa được nội dung phiếu. Cần sửa thì đề nghị HCNS hoặc ban giám đốc mở lại kỳ."
        />
      )}

      {phieu && (
        <Descriptions size="small" column={3} bordered>
          <Descriptions.Item label="Mã nhân viên">
            {phieu.ownerUser?.employeeCode ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Chức danh">{phieu.jobTitleName}</Descriptions.Item>
          <Descriptions.Item label="Phòng ban">{phieu.departmentName}</Descriptions.Item>
          <Descriptions.Item label="Người chấm">
            {phieu.evaluator?.fullName ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Gửi ký">{ngayGioVN(phieu.proposedAt)}</Descriptions.Item>
          <Descriptions.Item label="Ký nhận">{ngayGioVN(phieu.acceptedAt)}</Descriptions.Item>
        </Descriptions>
      )}

      {dangSoan && (
        <Alert
          type={
            bang(tongTheoMuc.BSC_WORK, TONG_TRONG_SO.BSC_WORK) &&
            bang(tongTheoMuc.COMPLIANCE, TONG_TRONG_SO.COMPLIANCE) &&
            nhomLech.length === 0
              ? 'success'
              : 'warning'
          }
          showIcon
          message={
            <Space split="·" wrap>
              <span>
                {TEN_MUC.BSC_WORK}: <b>{hienSo(tongTheoMuc.BSC_WORK)}</b> /{' '}
                {TONG_TRONG_SO.BSC_WORK}
              </span>
              <span>
                {TEN_MUC.COMPLIANCE}: <b>{hienSo(tongTheoMuc.COMPLIANCE)}</b> /{' '}
                {TONG_TRONG_SO.COMPLIANCE}
              </span>
            </Space>
          }
          description={
            nhomLech.length > 0 && (
              <div>
                Nhóm KPI con phải cộng đúng 100% trong nhóm:{' '}
                {nhomLech.map((n) => `"${n.ten}" đang ${hienSo(n.tong)}%`).join(', ')}
              </div>
            )
          }
        />
      )}

      {(['BSC_WORK', 'COMPLIANCE'] as const).map((muc) => {
        const cuaMuc = dangSoan
          ? xepCay(dong.filter((d) => d.section === muc))
          : (phieu?.items.filter((i) => i.section === muc) ?? []);
        if (!dangSoan && cuaMuc.length === 0) return null;
        return (
          <Card
            key={muc}
            size="small"
            loading={isLoading}
            title={
              <Space>
                <span>{TEN_MUC[muc]}</span>
                <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                  tổng {TONG_TRONG_SO[muc]}% · thang {MAX_SCALE[muc]} điểm
                </Typography.Text>
              </Space>
            }
            extra={
              dangSoan && (
                <Button size="small" icon={<PlusOutlined />} onClick={() => themDong(muc, null)}>
                  Thêm tiêu chí lớn
                </Button>
              )
            }
          >
            {cuaMuc.length === 0 ? (
              <Typography.Text type="secondary">
                Chưa có tiêu chí nào. Bấm "Thêm tiêu chí lớn" để bắt đầu.
              </Typography.Text>
            ) : dangSoan ? (
              <Table
                rowKey="key"
                size="small"
                pagination={false}
                scroll={{ x: 'max-content' }}
                columns={cotSoan}
                dataSource={cuaMuc as DongSoan[]}
              />
            ) : (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                scroll={{ x: 'max-content' }}
                columns={cotXem}
                dataSource={cuaMuc as DongPhieuKpi[]}
              />
            )}
          </Card>
        );
      })}

      {phieu && phieu.events.length > 0 && (
        <Card size="small" title="Lịch sử phiếu">
          <Timeline
            items={phieu.events.map((e) => ({
              children: (
                <Space direction="vertical" size={0}>
                  <Typography.Text strong>
                    {NHAN_HANH_DONG[e.action] ?? e.action}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {e.actor?.fullName ?? 'Hệ thống'} · {ngayGioVN(e.createdAt)}
                  </Typography.Text>
                  {e.comment && <Typography.Text>{e.comment}</Typography.Text>}
                </Space>
              ),
            }))}
          />
        </Card>
      )}

      <Modal
        open={moGuiLai}
        title="Gửi lại phiếu đang có ý kiến"
        okText="Gửi lại"
        cancelText="Huỷ"
        confirmLoading={gui.isPending}
        okButtonProps={{ disabled: ghiChu.trim().length === 0 }}
        onCancel={() => setMoGuiLai(false)}
        onOk={() => gui.mutate(ghiChu.trim())}
      >
        <Typography.Paragraph type="secondary">
          Phiếu này đang có ý kiến của người nhận. Gửi lại thì bắt buộc ghi chú lý do —
          ví dụ đã sửa theo góp ý, hoặc đã trao đổi trực tiếp và hai bên thống nhất giữ
          nguyên. Ghi chú được lưu vào lịch sử phiếu.
        </Typography.Paragraph>
        <Input.TextArea
          rows={4}
          maxLength={2000}
          showCount
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          placeholder="Ví dụ: đã giảm trọng số tiêu chí 2 từ 30% xuống 20% theo góp ý."
        />
      </Modal>
    </Space>
  );
}
