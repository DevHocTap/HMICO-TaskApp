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
  Typography,
} from 'antd';
import {
  CopyOutlined,
  MoreOutlined,
  PlusOutlined,
  StopOutlined,
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
import { layChucDanh } from '../../api/org';
import { layThongBaoLoi } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { coTheGhiMau } from '../../auth/permissions';
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

interface FormValues {
  code: string;
  name: string;
  jobTitleId?: string | null;
}

export function KpiTemplatesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const coQuyenGhi = coTheGhiMau(user?.role);
  const laTruongPhong = user?.role === 'MANAGER';
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
      message.success('Đã vô hiệu hoá mẫu');
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
    form.setFieldsValue({
      code: `${mau.code}-COPY`,
      name: `${mau.name} (bản sao)`,
      jobTitleId: mau.jobTitleId,
    });
    setModalMo(true);
  }

  function xacNhanVoHieuHoa(mau: KpiTemplate) {
    modal.confirm({
      title: `Vô hiệu hoá mẫu "${mau.name}"?`,
      content:
        'Mẫu sẽ không còn hiện khi giao KPI cho nhân viên mới. ' +
        'Phiếu KPI đã tạo từ mẫu này vẫn giữ nguyên nội dung.',
      okText: 'Vô hiệu hoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () => voHieuHoa.mutateAsync(mau.id),
    });
  }

  return (
    <div>
      <TieuDeTrang
        tieuDe="Mẫu KPI"
        moTa="Trưởng bộ phận soạn mẫu cho chức danh của phòng mình; hành chính và ban giám đốc xem. Mẫu chức danh phải đủ 70% mục BSC mới xuất bản được."
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
            {coQuyenGhi && (
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
            // Mẫu hệ thống chỉ ADMIN sửa; người khác chỉ xem (màn soạn tự khoá)
            const nhanSua =
              mau.isSystem && user?.role !== 'ADMIN' ? 'Xem' : 'Sửa';
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
                      (mẫu hệ thống)
                    </Typography.Text>
                  )}
                </Typography.Title>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {mau.isSystem
                    ? `${mau.criteriaCount} tiêu chí · áp cho mọi chức danh`
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
                    {coQuyenGhi && !mau.isActive && (
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
                              label: 'Sao chép',
                              onClick: () => moSaoChep(mau),
                            },
                            ...(mau.isSystem
                              ? []
                              : [
                                  {
                                    key: 'vo-hieu',
                                    icon: <StopOutlined />,
                                    label: 'Vô hiệu hoá',
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
          tenMau={xemTruoc.name}
          chucDanh={xemTruoc.jobTitleName}
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
        {dangSaoChep && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message="Bản sao gồm toàn bộ tiêu chí và KPI con của mẫu gốc"
            description="Bản sao ở trạng thái nháp. Sửa bản sao không ảnh hưởng mẫu gốc."
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
        </Form>
      </Modal>
    </div>
  );
}
