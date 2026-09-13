import { useState } from 'react';
import {
  Alert,
  App,
  Button,
  Dropdown,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Spin,
  Switch,
  Tag,
  TreeSelect,
  Typography,
} from 'antd';
import {
  CopyOutlined,
  DeleteOutlined,
  MoreOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  layDanhSachMau,
  kichHoatLaiMau,
  layMau,
  saoChepMau,
  taoMau,
  voHieuHoaMau,
} from '../../api/kpi-template';
import { layCayPhongBan, layChucDanh } from '../../api/org';
import { layThongBaoLoi } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { coTheGhiMau } from '../../auth/permissions';
import { useTrongSo } from '../../auth/useTrongSo';
import { ReadOnlyNotice } from '../../components/ReadOnlyNotice';
import { TieuDeTrang } from '../../components/TieuDeTrang';
import { TemplatePreviewModal } from '../../components/TemplatePreviewModal';
import { sangDanhSachPhang } from '../../utils/template';
import { mauChuDao, mauNhan } from '../../config/theme';
import type {
  KpiTemplate,
  KpiTemplateDetail,
  TemplateStatus,
} from '../../types/kpi-template';
import type { DepartmentNode } from '../../types/org';

interface FormValues {
  code: string;
  name: string;
  jobTitleId?: string | null;
  /** Chỉ dùng khi sao chép mẫu nội quy: phòng nhận bản sao. */
  departmentId?: string | null;
}

/** "Phòng Kỹ thuật" → "PKT": gợi ý mã cho bản sao mẫu nội quy, người dùng sửa được. */
function maGoiYTuTen(ten: string): string {
  return ten
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .split(/\s+/)
    .filter(Boolean)
    .map((tu) => tu[0])
    .join('')
    .toUpperCase();
}

/** Mẫu nội quy dùng chung toàn công ty (khác mẫu nội quy của một phòng). */
function laNoiQuyChung(mau: KpiTemplate): boolean {
  return mau.isSystem && !mau.departmentId;
}

function phongThanhTreeData(nodes: DepartmentNode[]): {
  value: string;
  title: string;
  children?: ReturnType<typeof phongThanhTreeData>;
}[] {
  return nodes.map((n) => ({
    value: n.id,
    title: `${n.name} (${n.code})`,
    children: n.children.length > 0 ? phongThanhTreeData(n.children) : undefined,
  }));
}

export function KpiTemplatesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const coQuyenGhi = coTheGhiMau(user?.role);
  const laTruongPhong = user?.role === 'MANAGER';
  const trongSo = useTrongSo();
  const [form] = Form.useForm<FormValues>();

  const [locChucDanh, setLocChucDanh] = useState<string | undefined>();
  const [locTrangThai, setLocTrangThai] = useState<
    TemplateStatus | undefined
  >();
  const [modalMo, setModalMo] = useState(false);
  const [hienDaNgung, setHienDaNgung] = useState(false);
  /** Null = tạo mới; có giá trị = đang sao chép từ mẫu đó. */
  const [dangSaoChep, setDangSaoChep] = useState<KpiTemplate | null>(null);
  const [loiForm, setLoiForm] = useState<string | null>(null);
  /** Mẫu đang xem trước — tải chi tiết khi bấm, không tải sẵn cả danh sách. */
  const [xemTruoc, setXemTruoc] = useState<KpiTemplateDetail | null>(null);
  const [dangTaiXemTruoc, setDangTaiXemTruoc] = useState<string | null>(null);

  const { data: danhSach = [], isLoading } = useQuery({
    queryKey: [
      'kpi-templates',
      locChucDanh ?? 'tat-ca',
      locTrangThai ?? 'tat-ca',
      hienDaNgung,
    ],
    queryFn: () =>
      layDanhSachMau({
        jobTitleId: locChucDanh,
        status: locTrangThai,
        includeInactive: hienDaNgung || undefined,
      }),
  });

  const { data: chucDanh = [] } = useQuery({
    queryKey: ['job-titles', 'tat-ca'],
    queryFn: () => layChucDanh(),
  });

  // Chỉ ADMIN cần chọn phòng khi chép mẫu nội quy; trưởng phòng chép về
  // phòng mình nên không cần cây.
  const { data: cayPhong = [] } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: layCayPhongBan,
    enabled: user?.role === 'ADMIN',
  });

  function lamMoi() {
    void queryClient.invalidateQueries({ queryKey: ['kpi-templates'] });
  }

  const luu = useMutation({
    mutationFn: (values: FormValues) =>
      dangSaoChep ? saoChepMau(dangSaoChep.id, values) : taoMau(values),
    onSuccess: (mau) => {
      message.success(dangSaoChep ? 'Đã sao chép mẫu' : 'Đã tạo mẫu');
      setModalMo(false);
      lamMoi();
      navigate(`/admin/kpi-templates/${mau.id}/edit`);
    },
    onError: (e) => setLoiForm(layThongBaoLoi(e)),
  });

  const kichHoatLai = useMutation({
    mutationFn: kichHoatLaiMau,
    onSuccess: () => {
      message.success(
        'Đã kích hoạt lại mẫu — mẫu về bản nháp, kiểm lại rồi xuất bản',
      );
      lamMoi();
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  const voHieuHoa = useMutation({
    mutationFn: voHieuHoaMau,
    onSuccess: () => {
      message.success('Đã xoá mẫu khỏi danh sách');
      lamMoi();
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  async function moXemTruoc(mau: KpiTemplate) {
    setDangTaiXemTruoc(mau.id);
    try {
      setXemTruoc(await layMau(mau.id));
    } catch (e) {
      message.error(layThongBaoLoi(e));
    } finally {
      setDangTaiXemTruoc(null);
    }
  }

  function moTaoMoi() {
    setDangSaoChep(null);
    setLoiForm(null);
    form.resetFields();
    setModalMo(true);
  }

  function moSaoChep(mau: KpiTemplate) {
    setDangSaoChep(mau);
    setLoiForm(null);
    if (mau.isSystem) {
      // Chép mẫu nội quy = tạo bản riêng cho MỘT phòng. Trưởng phòng chỉ
      // có một đích là phòng mình; mã gợi ý theo mã phòng để dễ nhận ra.
      const maPhong = user?.departmentName
        ? maGoiYTuTen(user.departmentName)
        : 'PHONG';
      form.setFieldsValue({
        code: laTruongPhong ? `NQ-${maPhong}` : `NQ-`,
        name: laTruongPhong
          ? `Chấp hành nội quy — ${user?.departmentName ?? ''}`
          : 'Chấp hành nội quy — ',
        departmentId: laTruongPhong ? user?.departmentId : undefined,
      });
    } else {
      form.setFieldsValue({
        code: `${mau.code}-COPY`,
        name: `${mau.name} (bản sao)`,
        jobTitleId: mau.jobTitleId,
      });
    }
    setModalMo(true);
  }

  // "Xoá" với mọi vai là NGỪNG SỬ DỤNG: mẫu biến mất khỏi danh sách và
  // không sinh phiếu mới; chỉ ADMIN xem lại và khôi phục được (chốt 13/09).
  // Không xoá hẳn vì phiếu đã tạo còn trỏ về mẫu để truy vết.
  const laAdmin = user?.role === 'ADMIN';
  function xacNhanVoHieuHoa(mau: KpiTemplate) {
    modal.confirm({
      title: `Xoá mẫu "${mau.name}"?`,
      content: laAdmin
        ? 'Mẫu chuyển sang trạng thái ngừng sử dụng và ẩn khỏi danh sách; xem lại bằng công tắc "Cả mẫu đã ngừng", khôi phục bằng "Kích hoạt lại". Phiếu KPI đã tạo từ mẫu này giữ nguyên nội dung.'
        : 'Mẫu sẽ biến mất khỏi danh sách và không dùng để giao KPI nữa. Phiếu KPI đã tạo từ mẫu này giữ nguyên nội dung. Cần khôi phục thì đề nghị quản trị viên.',
      okText: 'Xoá mẫu',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () => voHieuHoa.mutateAsync(mau.id),
    });
  }

  return (
    <div>
      <TieuDeTrang
        tieuDe="Mẫu KPI"
        moTa={`Trưởng bộ phận soạn mẫu cho chức danh của phòng mình; hành chính và ban giám đốc xem. Mẫu chức danh phải đủ ${trongSo.BSC_WORK}% mục BSC, mẫu hệ thống đủ ${trongSo.COMPLIANCE}% mục nội quy mới xuất bản được.`}
        phai={
          <>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              className="chon-tron"
              size="large"
              style={{ minWidth: 220 }}
              placeholder="Lọc theo chức danh"
              value={locChucDanh}
              onChange={setLocChucDanh}
              options={chucDanh.map((t) => ({ value: t.id, label: t.name }))}
            />
            <Select
              allowClear
              className="chon-tron"
              size="large"
              style={{ minWidth: 160 }}
              placeholder="Trạng thái"
              value={locTrangThai}
              onChange={setLocTrangThai}
              options={[
                { value: 'DRAFT', label: 'Bản nháp' },
                { value: 'PUBLISHED', label: 'Đã xuất bản' },
              ]}
            />
            {laAdmin && (
              <Switch
                checked={hienDaNgung}
                onChange={setHienDaNgung}
                checkedChildren="Cả mẫu đã ngừng"
                unCheckedChildren="Ẩn mẫu đã ngừng"
              />
            )}
            {coQuyenGhi && (
              <Button
                icon={<PlusOutlined />}
                type="primary"
                shape="round"
                size="large"
                onClick={moTaoMoi}
              >
                Tạo mẫu mới
              </Button>
            )}
          </>
        }
      />

      {!coQuyenGhi && (
        <ReadOnlyNotice
          role={user?.role}
          aiSua="trưởng bộ phận (cho chức danh phòng mình) hoặc quản trị viên"
        />
      )}

      {isLoading ? (
        <Spin />
      ) : danhSach.length === 0 ? (
        <Empty description="Chưa có mẫu nào" />
      ) : (
        <div className="mau-kpi-luoi">
          {danhSach.map((mau) => {
            const tong = Number(mau.weightTotal);
            const du = tong >= mau.weightRequired;
            const mau_ = du ? mauChuDao : mauNhan;
            // Mẫu nội quy DÙNG CHUNG chỉ ADMIN sửa; người khác chỉ xem (màn
            // soạn tự khoá). Mẫu nội quy của phòng thì trưởng phòng đó sửa được.
            const nhanSua =
              laNoiQuyChung(mau) && user?.role !== 'ADMIN' ? 'Xem' : 'Sửa';
            return (
              <div
                key={mau.id}
                className={`mau-kpi-the${mau.isActive ? '' : ' mau-kpi-the-ngung'}`}
              >
                <div className="mau-kpi-dau">
                  <span className="eyebrow">{mau.code}</span>
                  {!mau.isActive ? (
                    <Tag color="error" className="tag-tron">
                      Đã ngừng sử dụng
                    </Tag>
                  ) : mau.status === 'PUBLISHED' ? (
                    <Tag color="success" className="tag-tron">
                      Đã xuất bản
                    </Tag>
                  ) : (
                    <Tag className="tag-tron">Bản nháp</Tag>
                  )}
                </div>
                <Typography.Title level={4} style={{ margin: '10px 0 4px' }}>
                  {mau.name}
                  {mau.isSystem && (
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 14, fontWeight: 400 }}
                    >
                      {' '}
                      ({mau.departmentId ? 'nội quy của phòng' : 'nội quy dùng chung'})
                    </Typography.Text>
                  )}
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {mau.isSystem
                    ? `${mau.criteriaCount} tiêu chí · ${
                        mau.departmentName
                          ? `Mục 2 của ${mau.departmentName}`
                          : 'Mục 2 cho phòng chưa có mẫu riêng'
                      }`
                    : `${mau.criteriaCount} tiêu chí · ${mau.subCriteriaCount} KPI con · ${mau.jobTitleName ?? 'dùng chung'}`}
                  {' · '}phiên bản {mau.version}
                </Typography.Text>
                <div className="the-so-lieu-thanh" style={{ marginTop: 14 }}>
                  <span
                    style={{
                      width: `${Math.min((tong / mau.weightRequired) * 100, 100)}%`,
                      background: mau_,
                    }}
                  />
                </div>
                <div className="mau-kpi-chan">
                  <Typography.Text strong style={{ color: mau_ }}>
                    {Number.isInteger(tong) ? tong : mau.weightTotal}/
                    {mau.weightRequired} trọng số
                  </Typography.Text>
                  <span className="mau-kpi-nut">
                    <Button
                      type="link"
                      style={{ padding: 0 }}
                      loading={dangTaiXemTruoc === mau.id}
                      onClick={() => void moXemTruoc(mau)}
                    >
                      Xem trước
                    </Button>
                    <Button
                      shape="round"
                      onClick={() =>
                        navigate(`/admin/kpi-templates/${mau.id}/edit`)
                      }
                    >
                      {nhanSua}
                    </Button>
                    {laAdmin && !mau.isActive && (
                      <Button
                        type="primary"
                        shape="round"
                        loading={
                          kichHoatLai.isPending &&
                          kichHoatLai.variables === mau.id
                        }
                        onClick={() => kichHoatLai.mutate(mau.id)}
                      >
                        Kích hoạt lại
                      </Button>
                    )}
                    {coQuyenGhi && mau.isActive && (
                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: [
                            {
                              key: 'sao-chep',
                              icon: <CopyOutlined />,
                              label: !mau.isSystem
                                ? 'Sao chép'
                                : laTruongPhong
                                  ? 'Sao chép về phòng mình'
                                  : 'Sao chép cho một phòng',
                              onClick: () => moSaoChep(mau),
                            },
                            ...(laNoiQuyChung(mau)
                              ? []
                              : [
                                  {
                                    key: 'vo-hieu',
                                    icon: <DeleteOutlined />,
                                    label: 'Xoá mẫu',
                                    danger: true,
                                    onClick: () => xacNhanVoHieuHoa(mau),
                                  },
                                ]),
                          ],
                        }}
                      >
                        <Button
                          type="text"
                          icon={<MoreOutlined />}
                          aria-label="Thao tác khác"
                        />
                      </Dropdown>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {xemTruoc && (
        <TemplatePreviewModal
          open
          onClose={() => setXemTruoc(null)}
          mau={xemTruoc}
          items={sangDanhSachPhang(xemTruoc.items)}
        />
      )}

      <Modal
        open={modalMo}
        title={
          dangSaoChep ? `Sao chép "${dangSaoChep.name}"` : 'Tạo mẫu KPI mới'
        }
        onCancel={() => setModalMo(false)}
        onOk={() => form.submit()}
        confirmLoading={luu.isPending}
        okText={dangSaoChep ? 'Sao chép' : 'Tạo'}
        cancelText="Huỷ"
        destroyOnHidden
      >
        {loiForm && (
          <Alert
            type="error"
            message={loiForm}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        {dangSaoChep && !dangSaoChep.isSystem && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Bản sao gồm toàn bộ tiêu chí và KPI con của mẫu gốc"
            description="Bản sao ở trạng thái nháp. Sửa bản sao không ảnh hưởng mẫu gốc."
          />
        )}
        {dangSaoChep?.isSystem && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Bản sao là mẫu nội quy RIÊNG của phòng"
            description="Từ lần giao KPI sau khi xuất bản, phiếu của phòng này ghép Mục 2 từ bản sao thay cho mẫu dùng chung. Các phòng khác không ảnh hưởng. Bản sao ở trạng thái nháp cho tới khi xuất bản."
          />
        )}
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(v) => luu.mutate(v)}
        >
          <Form.Item
            name="code"
            label="Mã mẫu"
            rules={[
              { required: true, message: 'Vui lòng nhập mã mẫu' },
              {
                pattern: /^[A-Z0-9-]+$/,
                message: 'Chỉ gồm chữ in hoa, số và dấu gạch ngang',
              },
            ]}
          >
            <Input placeholder="VD: TPL-KT-SD" />
          </Form.Item>
          <Form.Item
            name="name"
            label="Tên mẫu"
            rules={[{ required: true, message: 'Vui lòng nhập tên mẫu' }]}
          >
            <Input placeholder="VD: KPI Nhân viên Shop Drawing" />
          </Form.Item>
          {dangSaoChep?.isSystem ? (
            laTruongPhong ? (
              <Form.Item name="departmentId" hidden>
                <Input />
              </Form.Item>
            ) : (
              <Form.Item
                name="departmentId"
                label="Phòng nhận mẫu nội quy riêng"
                rules={[{ required: true, message: 'Chọn phòng' }]}
              >
                <TreeSelect
                  showSearch
                  treeDefaultExpandAll
                  treeNodeFilterProp="title"
                  placeholder="Chọn phòng ban"
                  treeData={phongThanhTreeData(cayPhong)}
                />
              </Form.Item>
            )
          ) : (
          <Form.Item
            name="jobTitleId"
            label="Chức danh áp dụng"
            extra={
              laTruongPhong
                ? 'Trưởng bộ phận soạn mẫu cho chức danh của phòng mình; mẫu dùng chung do quản trị viên soạn.'
                : 'Để trống nếu mẫu dùng chung cho nhiều chức danh'
            }
            rules={
              laTruongPhong
                ? [{ required: true, message: 'Chọn chức danh của phòng bạn' }]
                : []
            }
          >
            <Select
              allowClear={!laTruongPhong}
              showSearch
              optionFilterProp="label"
              placeholder="Chọn chức danh"
              options={chucDanh
                // Trưởng phòng: bỏ chức danh dùng chung (không gắn phòng) — backend từ chối
                .filter((t) => t.isActive && (!laTruongPhong || t.departmentId))
                .map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }))}
            />
          </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
