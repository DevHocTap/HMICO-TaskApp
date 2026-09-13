import { useMemo, useState } from 'react';
import { ThanhTab } from '../../components/ThanhTab';
import { Alert, App, Checkbox, Dropdown, Form, Input, Modal, Select, Space, TreeSelect, Typography } from 'antd';
import {
  CheckCircleOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  LeftOutlined,
  LockOutlined,
  MoreOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
  StopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  datLaiMatKhau,
  doiTrangThaiNhanVien,
  layCayPhongBan,
  layChucDanh,
  layDanhSachNhanVien,
  suaNhanVien,
  suaPhongBan,
  taoNhanVien,
} from '../../api/org';
import { layThongBaoLoi } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { coTheGhiToChuc } from '../../auth/permissions';
import { ROLE_LABELS, type Role } from '../../types/auth';
import type { DepartmentNode, ListUsersParams, OrgUser } from '../../types/org';
import { TemporaryPasswordModal } from '../../components/TemporaryPasswordModal';
import { layTomTatTrangChu } from '../../api/report';
import { layBangGiaoKpi } from '../../api/scorecard';
import { useKyDangXem } from '../../contexts/KyDangXem';
import { phanTram } from '../../utils/format';
import './quan-ly-nhan-su.css';

import { chuVietTat } from '../../utils/period';

/**
 * Lọc nhanh — mỗi chip là một bộ tham số cố định, đè lên `vai trò` và
 * `trạng thái`. Phòng ban và chức danh vẫn là ô chọn riêng vì nhiều giá trị.
 */
type LocNhanh =
  'tat-ca' | 'truong-bo-phan' | 'chua-doi-mat-khau' | 'da-nghi-viec';
const CHIP_LOC: {
  key: LocNhanh;
  nhan: string;
  thamSo: Partial<ListUsersParams>;
}[] = [
  { key: 'tat-ca', nhan: 'Tất cả', thamSo: {} },
  {
    key: 'truong-bo-phan',
    nhan: 'Trưởng bộ phận',
    thamSo: { role: 'MANAGER', isActive: true },
  },
  {
    key: 'chua-doi-mat-khau',
    nhan: 'Chưa đổi mật khẩu',
    thamSo: { mustChangePassword: true, isActive: true },
  },
  { key: 'da-nghi-viec', nhan: 'Đã nghỉ việc', thamSo: { isActive: false } },
];

const CAC_VAI_TRO: Role[] = ['ADMIN', 'EXECUTIVE', 'HR', 'MANAGER', 'STAFF'];
/** Màu avatar xoay theo tên, như mẫu (blue / indigo / teal / sky / slate / amber). */
const MAU_AVATAR = ['#2563eb', '#4f46e5', '#0d9488', '#0284c7', '#475569', '#d97706', '#1d4ed8', '#0ea5e9'];
const mauAvatar = (ten: string) => MAU_AVATAR[[...ten].reduce((a, c) => a + c.charCodeAt(0), 0) % MAU_AVATAR.length]!;
const SO_DONG_MAC_DINH = 20;

interface FormValues {
  employeeCode: string;
  email: string;
  fullName: string;
  role: Role;
  departmentId?: string | null;
  jobTitleId?: string | null;
  level?: string | null;
  /** Không gửi lên API — dùng để gọi thêm PATCH /departments/:id sau khi lưu. */
  datLamTruongBoPhan?: boolean;
}

function duyetPhang(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((n) => [n, ...duyetPhang(n.children)]);
}

function chuyenSangTreeData(nodes: DepartmentNode[]): {
  value: string;
  title: string;
  children?: ReturnType<typeof chuyenSangTreeData>;
}[] {
  return nodes.map((n) => ({
    value: n.id,
    title: `${n.name} (${n.code})`,
    children:
      n.children.length > 0 ? chuyenSangTreeData(n.children) : undefined,
  }));
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { user: nguoiDangDangNhap } = useAuth();
  const [form] = Form.useForm<FormValues>();

  const coQuyenGhi = coTheGhiToChuc(nguoiDangDangNhap?.role);

  const [boLoc, setBoLoc] = useState<ListUsersParams>({
    page: 1,
    limit: SO_DONG_MAC_DINH,
  });
  const [oTimKiem, setOTimKiem] = useState('');
  const [locNhanh, setLocNhanh] = useState<LocNhanh>('tat-ca');
  const [modalMo, setModalMo] = useState(false);
  const [dangSua, setDangSua] = useState<OrgUser | null>(null);
  const [loiForm, setLoiForm] = useState<string | null>(null);
  const [matKhauTam, setMatKhauTam] = useState<{
    hoTen: string;
    matKhau: string;
  } | null>(null);

  const { data: tomTat } = useQuery({
    queryKey: ['reports', 'home-summary'],
    queryFn: layTomTatTrangChu,
  });
  // Số đếm cho chip lọc và thẻ — bốn truy vấn nhẹ (limit 1, chỉ lấy total),
  // theo phòng đang lọc để chip nói đúng con số của phòng đó.
  const demTheo = (thamSo: Partial<ListUsersParams>) =>
    layDanhSachNhanVien({ ...thamSo, departmentId: boLoc.departmentId, page: 1, limit: 1 }).then((r) => r.total);
  const { data: dem } = useQuery({
    queryKey: ['users', 'dem', boLoc.departmentId],
    queryFn: async () => {
      const [tatCa, truong, chuaDoi, nghi, hoatDong] = await Promise.all([
        demTheo({}),
        demTheo({ role: 'MANAGER', isActive: true }),
        demTheo({ mustChangePassword: true, isActive: true }),
        demTheo({ isActive: false }),
        demTheo({ isActive: true }),
      ]);
      return { tatCa, truong, chuaDoi, nghi, hoatDong };
    },
  });
  // Trạng thái KPI tháng của từng người — bảng giao KPI của kỳ đang xem
  const { ky } = useKyDangXem();
  const { data: bangGiao = [] } = useQuery({
    queryKey: ['scorecards', 'assignment-board', ky?.id, boLoc.departmentId ?? 'tat-ca'],
    queryFn: () => layBangGiaoKpi({ periodId: ky!.id, departmentId: boLoc.departmentId }),
    enabled: Boolean(ky),
  });
  const kpiTheoNguoi = useMemo(() => new Map(bangGiao.map((d) => [d.userId, d])), [bangGiao]);

  const { data: danhSach, isLoading } = useQuery({
    queryKey: ['users', boLoc],
    queryFn: () => layDanhSachNhanVien(boLoc),
  });

  const { data: cay = [] } = useQuery({
    queryKey: ['departments', 'tree'],
    queryFn: layCayPhongBan,
  });
  const phangPhongBan = useMemo(() => duyetPhang(cay), [cay]);

  const { data: chucDanh = [] } = useQuery({
    queryKey: ['job-titles', 'tat-ca'],
    queryFn: () => layChucDanh(),
  });

  // --- Gợi ý đặt trưởng bộ phận ---
  // Theo dõi hai trường trong form để biết có nên hiện gợi ý không.
  const vaiTroDangChon = Form.useWatch('role', form);
  const phongDangChon = Form.useWatch('departmentId', form);
  const phongThieuTruong = useMemo(() => {
    if (vaiTroDangChon !== 'MANAGER' || !phongDangChon) return null;
    const phong = phangPhongBan.find((d) => d.id === phongDangChon);
    // Đã có trưởng rồi thì thôi; nếu chính người đang sửa là trưởng cũng thôi
    if (!phong || (phong.managerId && phong.managerId !== dangSua?.id))
      return null;
    return phong.managerId ? null : phong;
  }, [vaiTroDangChon, phongDangChon, phangPhongBan, dangSua]);

  function lamMoi() {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['departments'] });
  }

  const luu = useMutation({
    mutationFn: async ({ datLamTruongBoPhan, ...values }: FormValues) => {
      const nguoi = dangSua
        ? await suaNhanVien(dangSua.id, values)
        : await taoNhanVien(values);

      // Đặt trưởng bộ phận là một lời gọi riêng: đây là thuộc tính của
      // PHÒNG BAN chứ không phải của người.
      if (datLamTruongBoPhan && values.departmentId) {
        await suaPhongBan(values.departmentId, { managerId: nguoi.id });
      }
      return nguoi;
    },
    onSuccess: (nguoi) => {
      message.success(dangSua ? 'Đã lưu thay đổi' : 'Đã thêm nhân viên');
      setModalMo(false);
      lamMoi();
      if (
        'temporaryPassword' in nguoi &&
        typeof nguoi.temporaryPassword === 'string'
      ) {
        setMatKhauTam({
          hoTen: nguoi.fullName,
          matKhau: nguoi.temporaryPassword,
        });
      }
    },
    onError: (error) => setLoiForm(layThongBaoLoi(error)),
  });

  const datLai = useMutation({
    mutationFn: (row: OrgUser) => datLaiMatKhau(row.id),
    onSuccess: (kq, row) =>
      setMatKhauTam({ hoTen: row.fullName, matKhau: kq.temporaryPassword }),
    onError: (error) => message.error(layThongBaoLoi(error)),
  });

  const doiTrangThai = useMutation({
    mutationFn: ({ row, hoatDong }: { row: OrgUser; hoatDong: boolean }) =>
      doiTrangThaiNhanVien(row.id, hoatDong),
    onSuccess: () => {
      message.success('Đã cập nhật trạng thái');
      lamMoi();
    },
    onError: (error) => message.error(layThongBaoLoi(error)),
  });

  function moThemMoi() {
    setDangSua(null);
    setLoiForm(null);
    form.resetFields();
    form.setFieldsValue({ role: 'STAFF' });
    setModalMo(true);
  }

  function moSua(row: OrgUser) {
    setDangSua(row);
    setLoiForm(null);
    form.setFieldsValue({
      employeeCode: row.employeeCode,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      departmentId: row.departmentId,
      jobTitleId: row.jobTitleId,
      level: row.level,
      datLamTruongBoPhan: false,
    });
    setModalMo(true);
  }

  function xacNhanDatLai(row: OrgUser) {
    modal.confirm({
      title: `Đặt lại mật khẩu cho ${row.fullName}?`,
      content:
        'Mọi phiên đăng nhập hiện tại của người này sẽ bị thu hồi. ' +
        'Mật khẩu tạm chỉ hiện một lần duy nhất.',
      okText: 'Đặt lại',
      cancelText: 'Huỷ',
      onOk: () => datLai.mutateAsync(row),
    });
  }

  function xacNhanDoiTrangThai(row: OrgUser) {
    const tat = row.isActive;
    modal.confirm({
      title: tat
        ? `Vô hiệu hoá ${row.fullName}?`
        : `Kích hoạt lại ${row.fullName}?`,
      content: tat
        ? 'Người này sẽ không đăng nhập được nữa và mọi phiên hiện tại bị thu hồi. Dữ liệu KPI cũ vẫn giữ nguyên.'
        : 'Người này sẽ đăng nhập lại được bằng mật khẩu hiện tại.',
      okText: tat ? 'Vô hiệu hoá' : 'Kích hoạt',
      okButtonProps: { danger: tat },
      cancelText: 'Huỷ',
      onOk: () => doiTrangThai.mutateAsync({ row, hoatDong: !tat }),
    });
  }

  function chonLocNhanh(key: LocNhanh) {
    setLocNhanh(key);
    const thamSo = CHIP_LOC.find((c) => c.key === key)!.thamSo;
    // Xoá ba trường mà chip quản lý rồi đặt lại theo chip; giữ phòng/chức danh/tìm kiếm
    setBoLoc(({ role: _r, isActive: _a, mustChangePassword: _m, ...cu }) => ({
      ...cu,
      ...thamSo,
      page: 1,
    }));
  }


  const tenPhamVi =
    nguoiDangDangNhap?.role === 'MANAGER' && nguoiDangDangNhap.departmentName
      ? nguoiDangDangNhap.departmentName
      : boLoc.departmentId
        ? (phangPhongBan.find((d) => d.id === boLoc.departmentId)?.name ?? 'Phòng đã chọn')
        : 'Toàn công ty';
  const soPhieu = tomTat && (tomTat.role === 'HR' || tomTat.role === 'MANAGER') ? tomTat.soPhieuTrongKy : null;
  const soDienKpi = tomTat && (tomTat.role === 'HR' || tomTat.role === 'MANAGER') ? tomTat.soNhanSu : null;
  const tongHienThi = danhSach?.total ?? 0;
  const trangHienTai = danhSach?.page ?? 1;
  const coMoiTrang = danhSach?.limit ?? SO_DONG_MAC_DINH;
  const soTrang = Math.max(1, Math.ceil(tongHienThi / coMoiTrang));
  const demChip: Record<LocNhanh, number | undefined> = {
    'tat-ca': dem?.tatCa,
    'truong-bo-phan': dem?.truong,
    'chua-doi-mat-khau': dem?.chuaDoi,
    'da-nghi-viec': dem?.nghi,
  };

  /** Pill "Trạng thái KPI tháng" theo bảng giao KPI của kỳ đang xem. */
  const pillKpi = (row: OrgUser) => {
    if (!row.isActive) return <span className="qn-pill qn-pill-xam">—</span>;
    const d = kpiTheoNguoi.get(row.id);
    if (!d) return <span className="qn-pill qn-pill-xam">Không thuộc diện KPI</span>;
    if (!d.scorecardId) return <span className="qn-pill qn-pill-do"><i /> Chưa giao</span>;
    if (d.assignStatus === 'ACCEPTED') {
      if (d.resultStatus === 'MANAGER_SCORED' || d.resultStatus === 'RECEIVED')
        return <span className="qn-pill qn-pill-xanh"><i /> Đã chốt điểm</span>;
      if (d.resultStatus === 'SELF_SCORED')
        return <span className="qn-pill qn-pill-xanh-la"><i /> Đã tự chấm · Chờ chốt</span>;
      return <span className="qn-pill qn-pill-xanh-la"><i /> Đã giao · Đã ký nhận</span>;
    }
    if (d.assignStatus === 'PROPOSED') return <span className="qn-pill qn-pill-cam"><i /> Đã giao · Chờ ký</span>;
    if (d.assignStatus === 'DISPUTED') return <span className="qn-pill qn-pill-do"><i /> Có ý kiến</span>;
    return <span className="qn-pill qn-pill-xam"><i /> Đang soạn</span>;
  };

  return (
    <div className="qn">
      <ThanhTab nhom="nhan-su" />

      {/* ===== tiêu đề + tìm kiếm */}
      <section className="qn-dau">
        <div>
          <h1>Quản lý nhân sự</h1>
          <p>
            {tongHienThi} nhân sự · {tenPhamVi} · {coQuyenGhi ? 'Hành chính nhân sự quản lý hồ sơ và tài khoản' : 'Quản lý trực tiếp trong kỳ đánh giá KPI'}
          </p>
        </div>
        <div className="qn-dau-phai">
          <span className="qn-tim">
            <SearchOutlined />
            <input
              value={oTimKiem}
              placeholder="Tìm theo tên hoặc mã nhân viên..."
              onChange={(e) => setOTimKiem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setBoLoc((cu) => ({ ...cu, search: oTimKiem || undefined, page: 1 }))}
              onBlur={() => setBoLoc((cu) => ({ ...cu, search: oTimKiem || undefined, page: 1 }))}
            />
            <kbd>↵</kbd>
          </span>
          <TreeSelect
            allowClear
            showSearch
            treeNodeFilterProp="title"
            className="qn-chon-phong"
            placeholder="Tất cả phòng ban"
            treeData={chuyenSangTreeData(cay)}
            value={boLoc.departmentId}
            onChange={(v: string | undefined) => setBoLoc((cu) => ({ ...cu, departmentId: v, page: 1 }))}
          />
          {coQuyenGhi && (
            <button type="button" className="qn-nut qn-nut-xanh" onClick={moThemMoi}>
              <PlusOutlined /> Thêm nhân viên
            </button>
          )}
        </div>
      </section>

      {/* ===== banner quyền */}
      {!coQuyenGhi && (
        <section className="qn-banner">
          <div className="qn-banner-trai">
            <span className="qn-banner-icon"><InfoCircleOutlined /></span>
            <p>
              <strong>Chế độ xem {nguoiDangDangNhap?.role === 'MANAGER' ? 'quản lý phòng ban' : 'ban giám đốc'}:</strong>{' '}
              {nguoiDangDangNhap?.role === 'MANAGER'
                ? 'Bạn theo dõi nhân sự và giao / chấm KPI cho người trực thuộc. Thêm mới, điều chuyển, đặt lại mật khẩu do Hành chính nhân sự thực hiện.'
                : 'Bạn xem được toàn bộ nhân sự. Thêm mới, điều chuyển, đặt lại mật khẩu do Hành chính nhân sự thực hiện.'}
            </p>
          </div>
        </section>
      )}

      {/* ===== 3 thẻ */}
      <section className="qn-3">
        <article className="qn-the">
          <div>
            <div className="qn-the-dau">
              <span>{nguoiDangDangNhap?.role === 'MANAGER' ? 'Tổng nhân sự phòng ban' : 'Tổng nhân sự'}</span>
              <span className="qn-o-icon qn-o-xanh"><TeamOutlined /></span>
            </div>
            <div className="qn-so-dong">
              <span className="qn-so">{dem?.hoatDong ?? '—'}</span>
              <span className="qn-huy-hieu qn-huy-hieu-xam">{dem ? `${dem.nghi} đã nghỉ việc` : '…'}</span>
            </div>
          </div>
          <div className="qn-the-chan">
            <span>{soDienKpi !== null ? `${soDienKpi} thuộc diện KPI` : `${dem?.tatCa ?? '—'} tài khoản tổng`}</span>
            <strong>{dem ? `Trưởng bộ phận: ${dem.truong}` : ''}</strong>
          </div>
        </article>

        {soPhieu !== null && soDienKpi !== null && (
          <article className="qn-the">
            <div>
              <div className="qn-the-dau">
                <span>Tiến độ giao KPI kỳ này</span>
                <span className="qn-o-icon qn-o-xanh-la"><CheckCircleOutlined /></span>
              </div>
              <div className="qn-so-dong">
                <span className="qn-so">{phanTram(soPhieu, soDienKpi)}%</span>
                <span className={`qn-huy-hieu ${soPhieu >= soDienKpi ? 'qn-huy-hieu-xanh-la' : 'qn-huy-hieu-cam'}`}>
                  {soPhieu}/{soDienKpi} phiếu đã có
                </span>
              </div>
            </div>
            <div className="qn-the-chan qn-the-chan-cot">
              <div className="qn-thanh">
                <span style={{ width: `${phanTram(soPhieu, soDienKpi)}%`, background: soPhieu >= soDienKpi ? '#10b981' : '#f59e0b' }} />
              </div>
              <div className="qn-the-chan-hang">
                <span>{soPhieu >= soDienKpi ? 'Đã ban hành toàn bộ' : `Còn ${soDienKpi - soPhieu} người chưa có phiếu`}</span>
                <strong className={soPhieu >= soDienKpi ? 'qn-chu-xanh-la' : 'qn-chu-cam'}>{soPhieu >= soDienKpi ? 'Hoàn tất' : 'Đang giao'}</strong>
              </div>
            </div>
          </article>
        )}

        <article className="qn-the">
          <div>
            <div className="qn-the-dau">
              <span>Tài khoản &amp; bảo mật</span>
              <span className="qn-o-icon qn-o-cam"><LockOutlined /></span>
            </div>
            <div className="qn-so-dong">
              <span className="qn-so">
                {dem?.chuaDoi ?? '—'} <small>/ {dem?.hoatDong ?? '—'}</small>
              </span>
              <span className={`qn-huy-hieu ${dem && dem.chuaDoi > 0 ? 'qn-huy-hieu-cam' : 'qn-huy-hieu-xanh-la'}`}>
                {dem && dem.chuaDoi > 0 ? 'Chưa đổi mật khẩu' : 'Đã kích hoạt hết'}
              </span>
            </div>
          </div>
          <div className="qn-the-chan">
            <span>Mật khẩu tạm chỉ dùng được một lần</span>
            {dem && dem.chuaDoi > 0 && (
              <button type="button" className="qn-link" onClick={() => chonLocNhanh('chua-doi-mat-khau')}>
                Xem danh sách →
              </button>
            )}
          </div>
        </article>
      </section>

      {/* ===== bộ lọc */}
      <section className="qn-loc">
        <div className="qn-chip-hang">
          {CHIP_LOC.map((c) => (
            <button key={c.key} type="button" className={`qn-chip${locNhanh === c.key ? ' qn-chip-chon' : ''}`} onClick={() => chonLocNhanh(c.key)}>
              {c.key === 'chua-doi-mat-khau' && <i className="qn-cham qn-cham-cam" />}
              {c.key === 'da-nghi-viec' && <i className="qn-cham qn-cham-do" />}
              {c.nhan}
              {demChip[c.key] !== undefined && ` (${demChip[c.key]})`}
            </button>
          ))}
        </div>
        <div className="qn-loc-phai">
          <Select
            allowClear
            showSearch
            size="small"
            optionFilterProp="label"
            style={{ minWidth: 180 }}
            placeholder="Tất cả chức danh"
            value={boLoc.jobTitleId}
            onChange={(v: string | undefined) => setBoLoc((cu) => ({ ...cu, jobTitleId: v, page: 1 }))}
            options={chucDanh.map((t) => ({ value: t.id, label: t.name }))}
          />
          <Select
            allowClear
            size="small"
            style={{ minWidth: 150 }}
            placeholder="Tất cả vai trò"
            value={boLoc.role}
            onChange={(v: Role | undefined) => setBoLoc((cu) => ({ ...cu, role: v, page: 1 }))}
            options={CAC_VAI_TRO.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          />
        </div>
      </section>

      {/* ===== bảng */}
      <section className="qn-bang">
        <div className="qn-cuon">
          <table className="qn-table">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Chức danh &amp; cấp bậc</th>
                <th>Phòng ban</th>
                <th>Trạng thái KPI {ky ? ky.name.toLowerCase() : 'tháng'}</th>
                <th>Trạng thái tài khoản</th>
                <th style={{ textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !danhSach ? (
                <tr><td colSpan={6} className="qn-rong">Đang tải…</td></tr>
              ) : (danhSach?.data ?? []).length === 0 ? (
                <tr><td colSpan={6} className="qn-rong">Không có nhân viên nào khớp bộ lọc</td></tr>
              ) : (
                (danhSach?.data ?? []).map((row) => (
                  <tr key={row.id} className={row.isActive ? '' : 'qn-dong-nghi'}>
                    <td>
                      <div className="qn-nv">
                        <span className="qn-avatar" style={{ background: row.isActive ? mauAvatar(row.fullName) : '#94a3b8' }}>
                          {chuVietTat(row.fullName)}
                        </span>
                        <div>
                          <div className="qn-nv-ten">{row.fullName}</div>
                          <div className="qn-nv-phu">
                            {row.employeeCode} · {row.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="qn-cd">{row.jobTitleName ?? <span className="qn-mo">—</span>}</div>
                      <span className={`qn-cap ${row.role === 'STAFF' ? 'qn-cap-xam' : 'qn-cap-xanh'}`}>
                        {row.level ? `${row.level} · ` : ''}
                        {ROLE_LABELS[row.role]}
                      </span>
                    </td>
                    <td className="qn-td-phong">{row.departmentName ?? <span className="qn-mo">—</span>}</td>
                    <td>{pillKpi(row)}</td>
                    <td>
                      {!row.isActive ? (
                        <span className="qn-tk qn-tk-do">Đã nghỉ việc</span>
                      ) : row.mustChangePassword ? (
                        <span className="qn-tk qn-tk-cam"><LockOutlined /> Chưa đổi mật khẩu</span>
                      ) : (
                        <span className="qn-tk qn-tk-xanh-la">Đang hoạt động</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="qn-thao-tac">
                        {coQuyenGhi ? (
                          <>
                            <button type="button" className="qn-link" onClick={() => moSua(row)}>
                              Sửa hồ sơ
                            </button>
                            <Dropdown
                              trigger={['click']}
                              menu={{
                                items: [
                                  { key: 'dat-lai', icon: <KeyOutlined />, label: 'Đặt lại mật khẩu', onClick: () => xacNhanDatLai(row) },
                                  {
                                    key: 'trang-thai',
                                    icon: row.isActive ? <StopOutlined /> : <CheckCircleOutlined />,
                                    label: row.isActive ? 'Vô hiệu hoá' : 'Kích hoạt lại',
                                    danger: row.isActive,
                                    onClick: () => xacNhanDoiTrangThai(row),
                                  },
                                ],
                              }}
                            >
                              <button type="button" className="qn-nut-icon" aria-label="Thao tác khác">
                                <MoreOutlined />
                              </button>
                            </Dropdown>
                          </>
                        ) : kpiTheoNguoi.get(row.id)?.scorecardId ? (
                          <Link className="qn-link" to={`/kpi/scorecards/${kpiTheoNguoi.get(row.id)!.scorecardId}`}>
                            Xem phiếu
                          </Link>
                        ) : (
                          <span className="qn-mo">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="qn-bang-chan">
          <div>
            Hiển thị <strong>{danhSach?.data.length ?? 0}</strong> trên <strong>{tongHienThi}</strong> nhân viên
          </div>
          <div className="qn-trang">
            <div className="qn-trang-nut">
              <button type="button" disabled={trangHienTai <= 1} onClick={() => setBoLoc((cu) => ({ ...cu, page: trangHienTai - 1 }))}>
                <LeftOutlined />
              </button>
              <span>{trangHienTai}</span>
              <button type="button" disabled={trangHienTai >= soTrang} onClick={() => setBoLoc((cu) => ({ ...cu, page: trangHienTai + 1 }))}>
                <RightOutlined />
              </button>
            </div>
            <select className="qn-select-nho" value={coMoiTrang} onChange={(e) => setBoLoc((cu) => ({ ...cu, limit: Number(e.target.value), page: 1 }))}>
              {[20, 50, 100].map((n) => (
                <option key={n} value={n}>{n} / trang</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <Modal
        open={modalMo}
        title={dangSua ? `Sửa "${dangSua.fullName}"` : 'Thêm nhân viên'}
        onCancel={() => setModalMo(false)}
        onOk={() => form.submit()}
        confirmLoading={luu.isPending}
        okText="Lưu"
        cancelText="Huỷ"
        width={560}
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
        <Form<FormValues>
          form={form}
          layout="vertical"
          onFinish={(values) => luu.mutate(values)}
        >
          <Form.Item
            name="employeeCode"
            label="Mã nhân viên"
            rules={[
              { required: true, message: 'Vui lòng nhập mã nhân viên' },
              {
                pattern: /^[A-Z0-9-]+$/,
                message: 'Chỉ gồm chữ in hoa, số và dấu gạch ngang',
              },
            ]}
          >
            <Input placeholder="VD: HM015" />
          </Form.Item>

          <Form.Item
            name="fullName"
            label="Họ tên"
            rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Vui lòng nhập email' },
              { type: 'email', message: 'Email không đúng định dạng' },
            ]}
          >
            <Input placeholder="ten.nhanvien@hmico.vn" />
          </Form.Item>

          <Form.Item name="departmentId" label="Phòng ban">
            <TreeSelect
              allowClear
              showSearch
              treeNodeFilterProp="title"
              placeholder="Chọn phòng ban"
              treeData={chuyenSangTreeData(cay)}
            />
          </Form.Item>

          <Form.Item name="jobTitleId" label="Chức danh">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Chọn chức danh"
              options={chucDanh
                .filter((t) => t.isActive)
                .map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }))}
            />
          </Form.Item>

          <Form.Item name="level" label="Cấp bậc">
            <Input placeholder="VD: S2, M1" />
          </Form.Item>

          <Form.Item
            name="role"
            label="Vai trò"
            rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}
          >
            <Select
              options={CAC_VAI_TRO.map((r) => ({
                value: r,
                label: ROLE_LABELS[r],
              }))}
            />
          </Form.Item>

          {/*
            Bẫy hay gặp: đặt người làm MANAGER nhưng quên gán họ làm trưởng
            bộ phận. Phòng đó sẽ không ai duyệt KPI, và lỗi chỉ lộ ra cuối
            tháng khi nhân viên đã nộp kết quả.
          */}
          {phongThieuTruong && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Phòng "${phongThieuTruong.name}" chưa có trưởng bộ phận`}
              description={
                <Space direction="vertical" size={4}>
                  <Typography.Text>
                    KPI của phòng này sẽ không ai duyệt được cho tới khi có
                    trưởng bộ phận.
                  </Typography.Text>
                  <Form.Item
                    name="datLamTruongBoPhan"
                    valuePropName="checked"
                    noStyle
                  >
                    <Checkbox>Đặt người này làm trưởng bộ phận</Checkbox>
                  </Form.Item>
                </Space>
              }
            />
          )}
        </Form>
      </Modal>

      <TemporaryPasswordModal
        open={matKhauTam !== null}
        hoTen={matKhauTam?.hoTen ?? ''}
        matKhau={matKhauTam?.matKhau ?? ''}
        onClose={() => setMatKhauTam(null)}
      />
    </div>
  );
}
