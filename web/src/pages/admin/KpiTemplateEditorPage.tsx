import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  InputNumber,
  Row,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowUpOutlined,
  CheckCircleFilled,
  ColumnWidthOutlined,
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  SaveOutlined,
  WarningFilled,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  kiemThuCayItem,
  layMau,
  luuCayItem,
  xuatBanMau,
} from '../../api/kpi-template';
import { layThongBaoLoi } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { sangDanhSachPhang } from '../../utils/template';
import { coTheGhiMau } from '../../auth/permissions';
import { ReadOnlyNotice } from '../../components/ReadOnlyNotice';
import { WeightSummaryBar } from '../../components/WeightSummaryBar';
import { TemplatePreviewModal } from '../../components/TemplatePreviewModal';
import { chiaDeu, hienSo, tongTrongSo } from '../../utils/weight';
import {
  MAX_SCALE,
  TONG_TRONG_SO_CON,
  type EditorItem,
  type LoiKiemTra,
} from '../../types/kpi-template';

let demKhoa = 0;
const khoaMoi = () => `tam-${Date.now()}-${demKhoa++}`;

export function KpiTemplateEditorPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const coQuyenGhi = coTheGhiMau(user?.role);

  const [items, setItems] = useState<EditorItem[]>([]);
  const [dangChon, setDangChon] = useState<string | null>(null);
  const [coThayDoi, setCoThayDoi] = useState(false);
  const [loiKiemTra, setLoiKiemTra] = useState<LoiKiemTra[]>([]);
  const [xemTruoc, setXemTruoc] = useState(false);

  const { data: mau, isLoading } = useQuery({
    queryKey: ['kpi-template', id],
    queryFn: () => layMau(id),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (mau) {
      setItems(sangDanhSachPhang(mau.items));
      setCoThayDoi(false);
    }
  }, [mau]);

  const chiDoc = !coQuyenGhi || mau?.isSystem === true;

  // --- Kiểm thử ngay khi gõ, không đợi bấm Xuất bản ---
  useEffect(() => {
    if (!id || items.length === 0 || chiDoc) return;
    const hen = setTimeout(() => {
      kiemThuCayItem(id, items)
        .then(setLoiKiemTra)
        .catch(() => undefined);
    }, 400);
    return () => clearTimeout(hen);
  }, [id, items, chiDoc]);

  const capNhat = useCallback((key: string, thayDoi: Partial<EditorItem>) => {
    setItems((cu) => cu.map((i) => (i.key === key ? { ...i, ...thayDoi } : i)));
    setCoThayDoi(true);
  }, []);

  const cap1 = useMemo(
    () => items.filter((i) => i.parentKey === null),
    [items],
  );
  const conCua = useCallback(
    (key: string) => items.filter((i) => i.parentKey === key),
    [items],
  );

  function themTieuChi() {
    const key = khoaMoi();
    setItems((cu) => [
      ...cu,
      {
        key,
        parentKey: null,
        name: '',
        description: '',
        section: 'BSC_WORK',
        measurementText: '',
        measureMethod: '',
        weight: '0',
      },
    ]);
    setDangChon(key);
    setCoThayDoi(true);
  }

  function themCon(parentKey: string) {
    const key = khoaMoi();
    const cha = items.find((i) => i.key === parentKey);
    const con = conCua(parentKey);
    // Chèn ngay sau con cuối cùng của tiêu chí này, không đẩy xuống cuối danh sách
    const viTri =
      con.length > 0
        ? items.findIndex((i) => i.key === con[con.length - 1].key) + 1
        : items.findIndex((i) => i.key === parentKey) + 1;

    const moi: EditorItem = {
      key,
      parentKey,
      name: '',
      description: '',
      section: cha?.section ?? 'BSC_WORK',
      measurementText: '',
      measureMethod: '',
      weight: '0',
    };
    setItems((cu) => [...cu.slice(0, viTri), moi, ...cu.slice(viTri)]);
    setDangChon(key);
    setCoThayDoi(true);
  }

  function xoa(key: string) {
    const con = conCua(key);
    const item = items.find((i) => i.key === key);
    modal.confirm({
      title:
        con.length > 0 ? 'Xoá tiêu chí và toàn bộ KPI con?' : 'Xoá dòng này?',
      content:
        con.length > 0
          ? `"${item?.name || '(chưa đặt tên)'}" có ${con.length} KPI con, sẽ bị xoá cùng.`
          : `"${item?.name || '(chưa đặt tên)'}"`,
      okText: 'Xoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () => {
        setItems((cu) =>
          cu.filter((i) => i.key !== key && i.parentKey !== key),
        );
        setDangChon(null);
        setCoThayDoi(true);
      },
    });
  }

  /** Đổi chỗ với anh em liền kề cùng cấp, cùng cha. */
  function di(key: string, huong: -1 | 1) {
    setItems((cu) => {
      const item = cu.find((i) => i.key === key);
      if (!item) return cu;
      const anhEm = cu.filter((i) => i.parentKey === item.parentKey);
      const viTri = anhEm.findIndex((i) => i.key === key);
      const dich = viTri + huong;
      if (dich < 0 || dich >= anhEm.length) return cu;

      const a = cu.findIndex((i) => i.key === key);
      const b = cu.findIndex((i) => i.key === anhEm[dich].key);
      const moi = [...cu];
      [moi[a], moi[b]] = [moi[b], moi[a]];
      return moi;
    });
    setCoThayDoi(true);
  }

  /**
   * Chia đều trọng số cho các KPI con của một tiêu chí.
   *
   * Dữ liệu thật cho thấy hầu hết nhóm đang chia đều, nên nút này tiết kiệm
   * rất nhiều thao tác. Phần dư dồn vào các phần đầu để tổng vẫn đúng 100 —
   * chia 100 cho 3 ra 33.34/33.33/33.33, không phải 33.33 ba lần rồi lệch.
   */
  function chiaDeuCon(parentKey: string) {
    const con = conCua(parentKey);
    if (con.length === 0) return;
    const phan = chiaDeu(TONG_TRONG_SO_CON, con.length);
    setItems((cu) =>
      cu.map((i) => {
        const idx = con.findIndex((c) => c.key === i.key);
        return idx >= 0 ? { ...i, weight: hienSo(phan[idx]) } : i;
      }),
    );
    setCoThayDoi(true);
    message.success(`Đã chia đều cho ${con.length} KPI con`);
  }

  const luu = useMutation({
    mutationFn: () => luuCayItem(id, items),
    onSuccess: () => {
      message.success('Đã lưu nháp');
      setCoThayDoi(false);
      void queryClient.invalidateQueries({ queryKey: ['kpi-template', id] });
      void queryClient.invalidateQueries({ queryKey: ['kpi-templates'] });
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  const xuatBan = useMutation({
    mutationFn: async () => {
      if (coThayDoi) await luuCayItem(id, items);
      return xuatBanMau(id);
    },
    onSuccess: () => {
      message.success('Đã xuất bản mẫu');
      setCoThayDoi(false);
      void queryClient.invalidateQueries({ queryKey: ['kpi-template', id] });
      void queryClient.invalidateQueries({ queryKey: ['kpi-templates'] });
    },
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  if (isLoading) return <Spin size="large" />;
  if (!mau) return <Empty description="Không tìm thấy mẫu KPI" />;

  const itemDangChon = items.find((i) => i.key === dangChon) ?? null;
  const sanSangXuatBan = loiKiemTra.length === 0 && items.length > 0;

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/admin/kpi-templates')}
          >
            Danh sách mẫu
          </Button>
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {mau.name}
            </Typography.Title>
            <Typography.Text type="secondary">
              {mau.code}
              {mau.jobTitleName ? ` · ${mau.jobTitleName}` : ''} · phiên bản{' '}
              {mau.version}
            </Typography.Text>
          </div>
          <Tag color={mau.status === 'PUBLISHED' ? 'green' : 'orange'}>
            {mau.status === 'PUBLISHED' ? 'Đã xuất bản' : 'Bản nháp'}
          </Tag>
        </Space>

        <Space wrap>
          <Button icon={<EyeOutlined />} onClick={() => setXemTruoc(true)}>
            Xem trước
          </Button>
          {!chiDoc && (
            <>
              <Button
                icon={<SaveOutlined />}
                onClick={() => luu.mutate()}
                loading={luu.isPending}
              >
                Lưu nháp
              </Button>
              <Tooltip
                title={
                  sanSangXuatBan
                    ? undefined
                    : 'Còn lỗi trọng số hoặc cấu trúc, xem danh sách bên dưới'
                }
              >
                <Button
                  type="primary"
                  disabled={!sanSangXuatBan}
                  onClick={() => xuatBan.mutate()}
                  loading={xuatBan.isPending}
                >
                  Xuất bản
                </Button>
              </Tooltip>
            </>
          )}
        </Space>
      </Space>

      {chiDoc && mau.isSystem ? (
        <Alert
          type="info"
          showIcon
          message="Mẫu hệ thống — chỉ đọc"
          description="Mục “Chấp hành nội quy” áp dụng chung cho mọi chức danh, không sửa ở đây."
        />
      ) : (
        chiDoc && (
          <ReadOnlyNotice
            role={user?.role}
            aiSua="trưởng bộ phận (cho chức danh phòng mình) hoặc quản trị viên"
          />
        )
      )}

      {/* Thứ quan trọng nhất màn hình: thấy sai ngay lúc gõ */}
      <WeightSummaryBar
        items={items}
        section={mau.isSystem ? 'COMPLIANCE' : 'BSC_WORK'}
      />

      {loiKiemTra.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`Còn ${loiKiemTra.length} chỗ cần sửa trước khi xuất bản`}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {loiKiemTra.map((l, i) => (
                <li key={i}>{l.thongDiep}</li>
              ))}
            </ul>
          }
        />
      )}

      <Row gutter={16}>
        {/* --- Cột trái: cây tiêu chí --- */}
        <Col xs={24} lg={14}>
          <Card
            title="Danh sách tiêu chí"
            extra={
              !chiDoc && (
                <Button
                  icon={<PlusOutlined />}
                  type="primary"
                  onClick={themTieuChi}
                >
                  Thêm tiêu chí
                </Button>
              )
            }
            styles={{ body: { padding: 8 } }}
          >
            {cap1.length === 0 && (
              <Empty
                description={
                  chiDoc
                    ? 'Mẫu chưa có tiêu chí nào'
                    : 'Bấm “Thêm tiêu chí” để bắt đầu'
                }
              />
            )}

            {cap1.map((cha, iCha) => {
              const con = conCua(cha.key);
              const tongCon = tongTrongSo(con.map((c) => c.weight));
              const conDung = con.length === 0 || tongCon === TONG_TRONG_SO_CON;

              return (
                <Card
                  key={cha.key}
                  size="small"
                  style={{
                    marginBottom: 8,
                    borderColor: dangChon === cha.key ? '#1677ff' : undefined,
                  }}
                  styles={{ body: { padding: 8 } }}
                >
                  <Space
                    style={{ width: '100%', justifyContent: 'space-between' }}
                    align="start"
                    wrap
                  >
                    <Space
                      align="start"
                      style={{ cursor: 'pointer', flex: 1 }}
                      onClick={() => setDangChon(cha.key)}
                    >
                      <Tag>{iCha + 1}</Tag>
                      <div>
                        <Typography.Text strong>
                          {cha.name || (
                            <Typography.Text type="secondary">
                              (chưa đặt tên)
                            </Typography.Text>
                          )}
                        </Typography.Text>
                        <div>
                          <Typography.Text
                            type="secondary"
                            style={{ fontSize: 12 }}
                          >
                            Trọng số {hienSo(tongTrongSo([cha.weight]))}
                            {con.length > 0 && (
                              <>
                                {' · '}
                                {con.length} KPI con, tổng {hienSo(tongCon)}{' '}
                                {conDung ? (
                                  <CheckCircleFilled
                                    style={{ color: '#52c41a' }}
                                  />
                                ) : (
                                  <WarningFilled style={{ color: '#faad14' }} />
                                )}
                              </>
                            )}
                          </Typography.Text>
                        </div>
                      </div>
                    </Space>

                    {!chiDoc && (
                      <Space size={4} wrap>
                        <Tooltip title="Lên">
                          <Button
                            size="small"
                            icon={<ArrowUpOutlined />}
                            disabled={iCha === 0}
                            onClick={() => di(cha.key, -1)}
                          />
                        </Tooltip>
                        <Tooltip title="Xuống">
                          <Button
                            size="small"
                            icon={<ArrowDownOutlined />}
                            disabled={iCha === cap1.length - 1}
                            onClick={() => di(cha.key, 1)}
                          />
                        </Tooltip>
                        <Button
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => themCon(cha.key)}
                        >
                          KPI con
                        </Button>
                        {con.length > 1 && (
                          <Tooltip
                            title={`Mỗi KPI con ${hienSo(100 / con.length)} — tổng đúng 100`}
                          >
                            <Button
                              size="small"
                              icon={<ColumnWidthOutlined />}
                              onClick={() => chiaDeuCon(cha.key)}
                            >
                              Chia đều
                            </Button>
                          </Tooltip>
                        )}
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => xoa(cha.key)}
                        />
                      </Space>
                    )}
                  </Space>

                  {/* KPI con */}
                  {con.map((c, iCon) => (
                    <div
                      key={c.key}
                      style={{
                        marginTop: 6,
                        marginLeft: 24,
                        padding: 6,
                        borderLeft: '2px solid #f0f0f0',
                        background: dangChon === c.key ? '#e6f4ff' : undefined,
                      }}
                    >
                      <Space
                        style={{
                          width: '100%',
                          justifyContent: 'space-between',
                        }}
                        wrap
                      >
                        <Space
                          style={{ cursor: 'pointer' }}
                          onClick={() => setDangChon(c.key)}
                        >
                          <Typography.Text type="secondary">
                            {iCha + 1}.{iCon + 1}
                          </Typography.Text>
                          <Typography.Text>
                            {c.name || (
                              <Typography.Text type="secondary">
                                (chưa đặt tên)
                              </Typography.Text>
                            )}
                          </Typography.Text>
                          <Tag>{hienSo(tongTrongSo([c.weight]))}</Tag>
                        </Space>
                        {!chiDoc && (
                          <Space size={4}>
                            <Button
                              size="small"
                              icon={<ArrowUpOutlined />}
                              disabled={iCon === 0}
                              onClick={() => di(c.key, -1)}
                            />
                            <Button
                              size="small"
                              icon={<ArrowDownOutlined />}
                              disabled={iCon === con.length - 1}
                              onClick={() => di(c.key, 1)}
                            />
                            <Button
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              onClick={() => xoa(c.key)}
                            />
                          </Space>
                        )}
                      </Space>
                    </div>
                  ))}
                </Card>
              );
            })}
          </Card>
        </Col>

        {/* --- Cột phải: form sửa dòng đang chọn --- */}
        <Col xs={24} lg={10}>
          <Card
            title={itemDangChon?.parentKey ? 'Sửa KPI con' : 'Sửa tiêu chí'}
          >
            {!itemDangChon ? (
              <Empty description="Chọn một dòng bên trái để sửa" />
            ) : (
              <Form layout="vertical" disabled={chiDoc}>
                <Form.Item label="Tên" required>
                  <Input
                    value={itemDangChon.name}
                    onChange={(e) =>
                      capNhat(itemDangChon.key, { name: e.target.value })
                    }
                    placeholder={
                      itemDangChon.parentKey
                        ? 'VD: Hoàn thành bản vẽ theo kế hoạch được giao.'
                        : 'VD: Tiến độ hoàn thành Shop Drawing'
                    }
                  />
                </Form.Item>

                <Form.Item
                  label="Trọng số (%)"
                  extra={
                    itemDangChon.parentKey
                      ? 'Các KPI con trong cùng một tiêu chí cộng lại phải bằng 100'
                      : 'Các tiêu chí cộng lại phải bằng 70'
                  }
                >
                  <InputNumber
                    value={Number(itemDangChon.weight)}
                    onChange={(v) =>
                      capNhat(itemDangChon.key, { weight: String(v ?? 0) })
                    }
                    min={0}
                    max={100}
                    step={1}
                    precision={2}
                    style={{ width: '100%' }}
                  />
                </Form.Item>

                {itemDangChon.parentKey ? (
                  <>
                    <Form.Item
                      label="Mục tiêu"
                      extra="Nguyên văn như biểu mẫu: ≥ 95%, ≤ 3%, 2 giờ, Đạt"
                    >
                      <Input
                        value={itemDangChon.measurementText}
                        onChange={(e) =>
                          capNhat(itemDangChon.key, {
                            measurementText: e.target.value,
                          })
                        }
                      />
                    </Form.Item>
                    <Form.Item label="Cách đo">
                      <Input.TextArea
                        rows={3}
                        value={itemDangChon.measureMethod}
                        onChange={(e) =>
                          capNhat(itemDangChon.key, {
                            measureMethod: e.target.value,
                          })
                        }
                        placeholder="VD: Số bản vẽ hoàn thành đúng hạn / Tổng số bản vẽ × 100%"
                      />
                    </Form.Item>
                  </>
                ) : (
                  <Form.Item
                    label="Chỉ tiêu cụ thể"
                    extra="Mô tả hiện trên biểu mẫu in"
                  >
                    <Input.TextArea
                      rows={4}
                      value={itemDangChon.description}
                      onChange={(e) =>
                        capNhat(itemDangChon.key, {
                          description: e.target.value,
                        })
                      }
                    />
                  </Form.Item>
                )}

                <Typography.Text type="secondary">
                  Thang điểm tối đa: {MAX_SCALE[itemDangChon.section]} (theo
                  mục, không sửa được)
                </Typography.Text>
              </Form>
            )}
          </Card>
        </Col>
      </Row>

      <TemplatePreviewModal
        open={xemTruoc}
        onClose={() => setXemTruoc(false)}
        tenMau={mau.name}
        chucDanh={mau.jobTitleName}
        items={items}
      />
    </Space>
  );
}
