import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  chotDiemQuanLy,
  layPhieuChamDiem,
  luuDiemQuanLy,
  luuDiemTuCham,
  nopDiemTuCham,
  tiepNhanPhieu,
  traLaiPhieu,
} from '../../api/scorecard';
import { layThongBaoLoi } from '../../api/client';
import {
  MAU_TRANG_THAI_CHAM,
  MAU_XEP_LOAI,
  NHAN_TRANG_THAI_CHAM,
  NHAN_XEP_LOAI,
  type DongChamDiem,
  type ODiemGuiLen,
  type PhieuChamDiem,
} from '../../types/scorecard';
import { TEN_MUC } from '../../types/kpi-template';
import { hienDiem, tinhDiemPhieu, type CotCham } from '../../utils/scoring';

/** Ô người dùng đang sửa, chưa lưu. */
interface ODangSua {
  score?: number | null;
  comment?: string | null;
}

const so = (v: string | null | undefined) => (v === null || v === undefined ? '—' : v);

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

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['scorecards', 'scoring', id],
    queryFn: () => layPhieuChamDiem(id),
    enabled: Boolean(id),
  });

  const quyen = data?.permissions;
  // Cột đang sửa. Không ai vừa tự chấm vừa chấm cho mình được, nên hai quyền
  // này không bao giờ cùng bật.
  const cotSua: CotCham | null = quyen?.canEditSelfScores
    ? 'self'
    : quyen?.canEditManagerScores
      ? 'manager'
      : null;

  // Đổi phiếu thì bỏ hết thay đổi chưa lưu, không mang sang phiếu khác.
  useEffect(() => setDangSua({}), [id]);

  function capNhat(itemId: string, thayDoi: ODangSua) {
    setDangSua((truoc) => ({ ...truoc, [itemId]: { ...truoc[itemId], ...thayDoi } }));
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
      selfScore: dangSua[it.id]?.score !== undefined && cotSua === 'self'
        ? dangSua[it.id].score ?? null
        : it.selfScore,
      managerScore: dangSua[it.id]?.score !== undefined && cotSua === 'manager'
        ? dangSua[it.id].score ?? null
        : it.managerScore,
    }));
    return { self: tinhDiemPhieu(dongs, 'self'), manager: tinhDiemPhieu(dongs, 'manager') };
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
      cotSua === 'self' ? luuDiemTuCham(id, oThayDoi) : luuDiemQuanLy(id, oThayDoi),
    onSuccess: (moi) => sauKhiGhi(moi, 'Đã lưu nháp'),
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  const gui = useMutation({
    mutationFn: () =>
      cotSua === 'self'
        ? nopDiemTuCham(id)
        : chotDiemQuanLy(id, lyDoKhongTuCham.trim() || undefined),
    onSuccess: (moi) =>
      sauKhiGhi(moi, cotSua === 'self' ? 'Đã nộp phiếu tự chấm' : 'Đã chốt điểm'),
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

  const tiepNhan = useMutation({
    mutationFn: () => tiepNhanPhieu(id),
    onSuccess: (moi) => sauKhiGhi(moi, 'Đã tiếp nhận phiếu'),
    onError: (e) => message.error(layThongBaoLoi(e)),
  });

  if (isError) {
    return <Alert type="error" showIcon message="Không mở được phiếu" description={layThongBaoLoi(error)} />;
  }
  if (!data) return <Card loading />;

  const p = data.scorecard;
  const coCon = new Set(data.items.map((i) => i.parentId).filter(Boolean) as string[]);

  /** Ô nhập điểm của một dòng lá. */
  function oNhapDiem(dong: DongChamDiem, cot: CotCham) {
    const suaDuoc = cotSua === cot && !coCon.has(dong.id);
    const diem = diemHienTai(dong, cot);
    const tran = Number(dong.tranDiem);
    const vuotThang = diem !== null && diem > dong.maxScale;

    if (!suaDuoc) {
      const tinh = cot === 'self' ? dong.selfComputed : dong.managerComputed;
      const hien = coCon.has(dong.id) ? tinh.diem : (cot === 'self' ? dong.selfScore : dong.managerScore);
      return (
        <span style={{ fontWeight: coCon.has(dong.id) ? 600 : 400 }}>
          {hien === null ? '—' : hienDiem(Number(hien))}
          {vuotThang && <Tag color="purple" style={{ marginInlineStart: 6 }}>vượt</Tag>}
        </span>
      );
    }

    return (
      <InputNumber
        value={diem}
        onChange={(v) => capNhat(dong.id, { score: v ?? null })}
        min={0}
        max={tran}
        step={0.5}
        precision={2}
        style={{ width: 90 }}
        status={vuotThang ? 'warning' : undefined}
        placeholder={`0–${hienDiem(tran)}`}
      />
    );
  }

  function cotDiem(cot: CotCham, tieuDe: string): ColumnsType<DongChamDiem>[number] {
    return {
      title: tieuDe,
      key: cot,
      width: 130,
      align: 'center',
      render: (_: unknown, dong) => oNhapDiem(dong, cot),
    };
  }

  const cot: ColumnsType<DongChamDiem> = [
    {
      title: 'Tiêu chí',
      dataIndex: 'name',
      render: (ten: string, dong) =>
        dong.parentId ? (
          <span style={{ paddingInlineStart: 20 }}>{ten}</span>
        ) : (
          <Typography.Text strong>{ten}</Typography.Text>
        ),
    },
    { title: 'Mục tiêu', dataIndex: 'measurementText', width: 140 },
    {
      title: 'Trọng số',
      dataIndex: 'weight',
      width: 90,
      align: 'right',
      render: (w: string, dong) => `${Number(w)}${dong.parentId ? '% nhóm' : '%'}`,
    },
    { title: 'Thang', dataIndex: 'maxScale', width: 70, align: 'right' },
    cotDiem('self', 'NLĐ tự đánh giá'),
    cotDiem('manager', 'QL đánh giá'),
    {
      title: 'Chênh lệch',
      key: 'chenh',
      width: 100,
      align: 'right',
      render: (_: unknown, dong) => {
        if (coCon.has(dong.id)) return null;
        const tu = diemHienTai(dong, 'self');
        const ql = diemHienTai(dong, 'manager');
        if (tu === null || ql === null) return <Typography.Text type="secondary">—</Typography.Text>;
        const lech = Math.round((ql - tu) * 100) / 100;
        if (lech === 0) return <Typography.Text type="secondary">0</Typography.Text>;
        return (
          <Typography.Text type={lech < 0 ? 'danger' : 'success'}>
            {lech > 0 ? '+' : ''}
            {hienDiem(lech)}
          </Typography.Text>
        );
      },
    },
    {
      title: 'Đóng góp',
      key: 'dongGop',
      width: 100,
      align: 'right',
      render: (_: unknown, dong) => {
        if (dong.parentId) return null;
        const dg = tinhThu.manager.theoDong.get(dong.id)?.dongGop;
        const dgTu = tinhThu.self.theoDong.get(dong.id)?.dongGop;
        return (
          <Tooltip title="Trên: theo cột QL đánh giá. Dưới: theo cột tự đánh giá.">
            <div>
              <Typography.Text strong>{hienDiem(dg ?? null)}</Typography.Text>
              <br />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {hienDiem(dgTu ?? null)}
              </Typography.Text>
            </div>
          </Tooltip>
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
    return diem !== null && diem > it.maxScale && !ghiChuHienTai(it, cotSua).trim();
  });

  const tinhThuCot = cotSua ? tinhThu[cotSua] : null;
  const nguoiDaNghi = !p.ownerIsActive;
  const canLyDoNghiViec =
    cotSua === 'manager' && nguoiDaNghi && p.resultStatus !== 'SELF_SCORED';

  const cayHienThi = (muc: 'BSC_WORK' | 'COMPLIANCE') => {
    const cua = data.items.filter((i) => i.section === muc);
    const cha = cua.filter((i) => !i.parentId);
    const ra: DongChamDiem[] = [];
    for (const c of cha) {
      ra.push(c);
      ra.push(...cua.filter((i) => i.parentId === c.id));
    }
    return ra;
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Chấm điểm KPI — {p.periodName}
        </Typography.Title>
        <Button onClick={() => navigate(-1)}>Quay lại</Button>
      </Space>

      {p.periodIsLocked && (
        <Alert
          type="warning"
          showIcon
          message="Kỳ này đã chốt sổ"
          description="Không ghi điểm được nữa. Muốn sửa thì HCNS hoặc ban giám đốc phải mở lại kỳ."
        />
      )}
      {p.assignStatus !== 'ACCEPTED' && (
        <Alert
          type="info"
          showIcon
          message="Phiếu chưa được ký nhận"
          description="Nhân viên phải ký nhận KPI đầu kỳ thì mới bắt đầu chấm điểm được."
        />
      )}
      {p.resultStatus === 'REJECTED' && p.rejectReason && (
        <Alert
          type="warning"
          showIcon
          message="Phiếu bị trả lại, cần tự chấm lại"
          description={p.rejectReason}
        />
      )}
      {nguoiDaNghi && (
        <Alert
          type="info"
          showIcon
          message={`${p.ownerName ?? 'Nhân viên'} đã nghỉ việc`}
          description={
            p.noSelfScoreReason
              ? `Phiếu chốt không có cột tự chấm. Lý do đã ghi: ${p.noSelfScoreReason}`
              : 'Phiếu chốt được khi cột tự chấm còn trống, nhưng bắt buộc ghi lý do.'
          }
        />
      )}

      <Card size="small">
        <Descriptions size="small" column={3} bordered>
          <Descriptions.Item label="Nhân viên">{p.ownerName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Chức danh">{p.jobTitleName}</Descriptions.Item>
          <Descriptions.Item label="Phòng ban">{p.departmentName}</Descriptions.Item>
          <Descriptions.Item label="Trạng thái chấm">
            <Tag color={MAU_TRANG_THAI_CHAM[p.resultStatus]}>
              {NHAN_TRANG_THAI_CHAM[p.resultStatus]}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Tổng điểm đã chốt — tự chấm">
            {so(p.selfTotalScore)}
          </Descriptions.Item>
          <Descriptions.Item label="Tổng điểm đã chốt — QL đánh giá">
            {so(p.managerTotalScore)}
            {p.grade && (
              <Tag color={MAU_XEP_LOAI[p.grade]} style={{ marginInlineStart: 8 }}>
                {NHAN_XEP_LOAI[p.grade]}
              </Tag>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card size="small">
        <Space size="large" wrap>
          <Statistic
            title="Tổng điểm — NLĐ tự đánh giá"
            value={hienDiem(tinhThu.self.tongDiem)}
            suffix="%"
          />
          <Statistic
            title="Tổng điểm — QL đánh giá"
            value={hienDiem(tinhThu.manager.tongDiem)}
            suffix="%"
            valueStyle={{ color: '#1677ff' }}
          />
          {tinhThuCot && !tinhThuCot.daChamDu && (
            <Typography.Text type="warning">
              Còn {tinhThuCot.thieuDiem.length} tiêu chí chưa chấm — điểm trên chỉ là
              tạm tính, chưa gửi được.
            </Typography.Text>
          )}
        </Space>
      </Card>

      {(['BSC_WORK', 'COMPLIANCE'] as const).map((muc) => {
        const dongs = cayHienThi(muc);
        if (dongs.length === 0) return null;
        return (
          <Card key={muc} size="small" title={TEN_MUC[muc]}>
            <Table
              rowKey="id"
              size="small"
              columns={cot}
              dataSource={dongs}
              pagination={false}
              scroll={{ x: 'max-content' }}
              expandable={{
                expandedRowRender: oGhiChu,
                rowExpandable: (dong) => Boolean(oGhiChu(dong)),
                expandedRowKeys: dongs.filter((d) => oGhiChu(d)).map((d) => d.id),
                showExpandColumn: false,
              }}
            />
          </Card>
        );
      })}

      {canLyDoNghiViec && (
        <Card size="small" title="Lý do không có điểm tự chấm">
          <Input.TextArea
            rows={2}
            maxLength={2000}
            value={lyDoKhongTuCham}
            onChange={(e) => setLyDoKhongTuCham(e.target.value)}
            placeholder="Ví dụ: nhân viên đã nghỉ việc từ 15/08, không tự chấm được."
          />
        </Card>
      )}

      <Card size="small">
        <Space wrap>
          {cotSua && (
            <>
              <Button
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
                  loading={gui.isPending}
                  disabled={
                    oThayDoi.length > 0 ||
                    thieuGhiChu ||
                    !tinhThuCot?.daChamDu ||
                    (canLyDoNghiViec && lyDoKhongTuCham.trim().length < 5)
                  }
                  onClick={() =>
                    modal.confirm({
                      title: cotSua === 'self' ? 'Nộp phiếu tự chấm?' : 'Chốt điểm?',
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
                  {cotSua === 'self' ? 'Nộp phiếu tự chấm' : 'Chốt điểm'}
                </Button>
              </Tooltip>
            </>
          )}

          {quyen?.canReject && (
            <Button danger onClick={() => setMoTraLai(true)}>
              Trả lại cho nhân viên
            </Button>
          )}

          {quyen?.canReceive && (
            <Button
              type="primary"
              loading={tiepNhan.isPending}
              onClick={() => tiepNhan.mutate()}
            >
              Tiếp nhận
            </Button>
          )}

          {!cotSua && !quyen?.canReject && !quyen?.canReceive && (
            <Typography.Text type="secondary">
              Bạn đang xem phiếu ở chế độ chỉ đọc.
            </Typography.Text>
          )}
        </Space>
      </Card>

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
    </Space>
  );
}
