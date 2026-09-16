import { useMemo, useState } from 'react';
import { ThanhTab } from '../../components/ThanhTab';
import { Alert, App, Button, Drawer, Form, Input, Modal, Select, Skeleton, Tag, Tooltip, Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BankOutlined,
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
  MinusOutlined,
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { layCayPhongBan, layDanhSachNhanVien, suaPhongBan, taoPhongBan, voHieuHoaPhongBan } from '../../api/org';
import { laySanSangCongTy } from '../../api/scorecard';
import { layThongBaoLoi } from '../../api/client';
import type { DepartmentNode } from '../../types/org';
import { useAuth } from '../../auth/useAuth';
import { coTheGhiToChuc } from '../../auth/permissions';
import { ReadOnlyNotice } from '../../components/ReadOnlyNotice';
import './cay-phong-ban.css';

interface FormValues {
  code: string;
  name: string;
  parentId?: string | null;
  managerId?: string | null;
}

type CheDo = 'cay' | 'the' | 'phan-cap';

/** Duyệt cây, trả về danh sách phẳng. */
function duyetPhang(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes.flatMap((n) => [n, ...duyetPhang(n.children)]);
}
/** Id của phòng đó và toàn bộ con cháu — dùng để ẩn nhánh gây vòng lặp. */
function idsCuaNhanh(node: DepartmentNode): string[] {
  return [node.id, ...node.children.flatMap(idsCuaNhanh)];
}
/** Nhân sự của cả nhánh — `userCount` chỉ đếm người thuộc TRỰC TIẾP phòng đó. */
function tongNhanh(node: DepartmentNode): number {
  return node.userCount + node.children.reduce((t, c) => t + tongNhanh(c), 0);
}
function demConChau(node: DepartmentNode): number {
  return node.children.length + node.children.reduce((t, c) => t + demConChau(c), 0);
}
/** Chữ viết tắt ngắn gọn cho ô mã: bỏ tiền tố chung, tối đa 4 ký tự. */
function maNgan(code: string): string {
  const phan = code.split('-');
  return (phan[phan.length - 1] ?? code).slice(0, 4);
}

/**
 * Cây phòng ban theo mẫu sơ đồ tổ chức 16/09: gốc → các đơn vị cấp 1 xếp
 * ngang (rộng theo số phòng con) → phòng ban chia hai nhóm "có nhân sự" /
 * "chưa có nhân sự". Ba chế độ xem: Cây · Thẻ đơn vị · Phân cấp (cây antd cũ).
 * Bấm thẻ mở ngăn chi tiết có Sửa / Thêm phòng con / Vô hiệu hoá / Xem nhân sự.
 */
export function DepartmentsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const { user: nguoiDangDangNhap } = useAuth();
  const coQuyenGhi = coTheGhiToChuc(nguoiDangDangNhap?.role);

  const [cheDo, setCheDo] = useState<CheDo>('cay');
  const [zoom, setZoom] = useState(100);
  const [timKiem, setTimKiem] = useState('');
  const [dangChon, setDangChon] = useState<DepartmentNode | null>(null);
  const [modalMo, setModalMo] = useState(false);
  const [dangSua, setDangSua] = useState<DepartmentNode | null>(null);
  const [loiForm, setLoiForm] = useState<string | null>(null);

  const { data: cay = [], isLoading } = useQuery({ queryKey: ['departments', 'tree'], queryFn: layCayPhongBan });
  const danhSachPhang = useMemo(() => duyetPhang(cay), [cay]);
  /** Nhánh cấp 1 đang GẬP (bấm vào nút số ở dưới thẻ). Nút chung "Thu gọn / Mở rộng" gập / mở tất cả. */
  const [gapNhanh, setGapNhanh] = useState<Set<string>>(new Set());
  const doiGap = (id: string) =>
    setGapNhanh((cu) => {
      const moi = new Set(cu);
      if (moi.has(id)) moi.delete(id);
      else moi.add(id);
      return moi;
    });
  const cacNhanhCap1 = useMemo(() => cay.flatMap((g) => g.children.filter((c) => c.children.length > 0).map((c) => c.id)), [cay]);
  const gapHet = cacNhanhCap1.length > 0 && cacNhanhCap1.every((id) => gapNhanh.has(id));
  /** Thu gọn tất cả = chỉ còn tên các đơn vị cấp 1; mở tất cả = mở mọi tầng. */
  const doiGapHet = () => setGapNhanh(gapHet ? new Set() : new Set(cacNhanhCap1));
  const idPhongDangSua = dangSua?.id;
  const { data: nguoiTrongPhong } = useQuery({
    queryKey: ['users', 'cua-phong', idPhongDangSua],
    queryFn: () => layDanhSachNhanVien({ departmentId: idPhongDangSua, limit: 100, isActive: true }),
    enabled: Boolean(idPhongDangSua),
  });
  // Phòng THẬT SỰ bị chặn (có người mà thiếu trưởng) — lấy từ backend, không tự đếm `!managerId`
  const { data: sanSang } = useQuery({ queryKey: ['scorecards', 'readiness', 'company'], queryFn: laySanSangCongTy });
  const phongBiChan = sanSang?.departmentsWithoutManager ?? [];
  const maPhongBiChan = useMemo(() => new Set(phongBiChan.map((p) => p.code)), [phongBiChan]);

  // Số liệu đầu trang
  const tongNhanSu = danhSachPhang.reduce((t, d) => t + d.userCount, 0);
  const soCoNguoi = danhSachPhang.filter((d) => d.userCount > 0).length;
  const soTrong = danhSachPhang.length - soCoNguoi;
  const soCap1 = cay.reduce((t, g) => t + g.children.length, 0);
  const soPhongBan = danhSachPhang.length - cay.length - soCap1;

  const tuKhoa = timKiem.trim().toLowerCase();
  const khop = (d: DepartmentNode) => !tuKhoa || d.name.toLowerCase().includes(tuKhoa) || d.code.toLowerCase().includes(tuKhoa);

  function lamMoi() {
    void queryClient.invalidateQueries({ queryKey: ['departments'] });
    void queryClient.invalidateQueries({ queryKey: ['scorecards', 'readiness'] });
  }
  const luu = useMutation({
    mutationFn: (values: FormValues) => (dangSua ? suaPhongBan(dangSua.id, values) : taoPhongBan(values)),
    onSuccess: () => {
      message.success(dangSua ? 'Đã lưu thay đổi' : 'Đã thêm đơn vị');
      setModalMo(false);
      setDangChon(null);
      lamMoi();
    },
    onError: (error) => setLoiForm(layThongBaoLoi(error)),
  });
  const voHieuHoa = useMutation({
    mutationFn: voHieuHoaPhongBan,
    onSuccess: () => {
      message.success('Đã vô hiệu hoá đơn vị');
      setDangChon(null);
      lamMoi();
    },
    onError: (error) => message.error(layThongBaoLoi(error)),
  });

  function moThemMoi(cha: DepartmentNode | null) {
    setDangSua(null);
    setLoiForm(null);
    form.resetFields();
    form.setFieldsValue({ parentId: cha?.id ?? null });
    setModalMo(true);
  }
  function moSua(node: DepartmentNode) {
    setDangSua(node);
    setLoiForm(null);
    form.setFieldsValue({ code: node.code, name: node.name, parentId: node.parentId, managerId: node.managerId });
    setModalMo(true);
  }
  function xacNhanVoHieuHoa(node: DepartmentNode) {
    modal.confirm({
      title: `Vô hiệu hoá "${node.name}"?`,
      content: 'Đơn vị sẽ không còn hiện trong danh sách chọn, dữ liệu cũ giữ nguyên. Không vô hiệu hoá được nếu còn nhân viên hoặc còn phòng con đang hoạt động.',
      okText: 'Vô hiệu hoá',
      okButtonProps: { danger: true },
      cancelText: 'Huỷ',
      onOk: () => voHieuHoa.mutateAsync(node.id),
    });
  }

  const idsBiCam = dangSua ? idsCuaNhanh(dangSua) : [];
  const luaChonPhongCha = danhSachPhang.filter((d) => !idsBiCam.includes(d.id)).map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));

  // ---------------------------------------------------------------- vẽ

  /** Ô phòng ban (cấp 2 trở xuống). Phòng có phòng con thì ghi thêm số con. */
  /** Riêng cái thẻ (không có phần con). */
  const thePhong = (d: DepartmentNode, thuTu: number) => {
    const tong = tongNhanh(d);
    const con = demConChau(d);
    const thieuTruong = maPhongBiChan.has(d.code);
    const mau = `cp-mau-${thuTu % 6}`;
    const chon = dangChon?.id === d.id ? ' cp-o-chon' : '';
    const mo = !khop(d) ? ' cp-mo' : '';
    if (tong === 0) {
      return (
        <div className={`cp-o cp-o-trong${chon}${mo}`} onClick={() => setDangChon(d)}>
          <div className="cp-o-ma">{maNgan(d.code)}</div>
          <div className="cp-o-ten" title={d.name}>{d.name}</div>
          <div className="cp-o-phu">0 người{con > 0 ? ` · ${con} phòng con` : ''}</div>
          {coQuyenGhi && (
            <Link to={`/admin/users?departmentId=${d.id}`} className="cp-gan" onClick={(e) => e.stopPropagation()}>
              + Gán NS
            </Link>
          )}
        </div>
      );
    }
    return (
      <div className={`cp-o${chon}${mo}`} onClick={() => setDangChon(d)}>
        <div className="cp-o-dau">
          <div className={`cp-o-ma ${mau}`}>{maNgan(d.code)}</div>
          <span className={`cp-o-so ${mau}`}>{tong} NS</span>
        </div>
        <div className="cp-o-ten" title={d.name}>
          {thieuTruong && (
            <Tooltip title="Có nhân sự nhưng chưa có trưởng bộ phận — không sinh được phiếu KPI">
              <WarningOutlined className="cp-canh-bao" />{' '}
            </Tooltip>
          )}
          {d.name}
        </div>
        <div className={`cp-o-phu${thieuTruong ? ' cp-o-phu-cam' : ''}`}>
          {thieuTruong ? 'Chưa có trưởng bộ phận' : (d.managerName ?? `${tongNhanSu > 0 ? Math.round((tong / tongNhanSu) * 100) : 0}% nhân sự`)}
          {con > 0 && ` · ${d.children.length} phòng con`}
        </div>
      </div>
    );
  };

  /**
   * Khối phòng ban ĐỆ QUY: thẻ, và nếu có phòng con thì nối xuống + nút số
   * (bấm để gập/mở nhánh) + lưới con — đúng kiểu sơ đồ khối, sâu bao nhiêu
   * tầng cũng vẽ được.
   */
  const oPhong = (d: DepartmentNode, thuTu: number) => {
    if (d.children.length === 0) return <div key={d.id}>{thePhong(d, thuTu)}</div>;
    const gap = gapNhanh.has(d.id);
    return (
      <div key={d.id} className="cp-khoi">
        {thePhong(d, thuTu)}
        <div className="cp-noi cp-noi-3" />
        <button
          type="button"
          className="cp-nut-tron cp-nut-tron-nho"
          title={gap ? `Mở ${d.children.length} phòng con` : 'Thu gọn'}
          onClick={() => doiGap(d.id)}
        >
          {gap ? '+' : d.children.length}
        </button>
        {!gap && (
          <>
            <div className="cp-noi cp-noi-3" />
            <div className="cp-luoi cp-luoi-con">{d.children.map((c, k) => oPhong(c, thuTu + k + 1))}</div>
          </>
        )}
      </div>
    );
  };

  /**
   * Bề rộng tương đối của cột cấp 1: nhánh ĐANG GẬP thì mọi cột bằng nhau;
   * mở ra mới rộng theo số phòng con (chặn 2–6 để cột ít con không bị bóp).
   */
  const rongCot = (g: DepartmentNode) => (gapNhanh.has(g.id) || g.children.length === 0 ? 2 : Math.max(2, Math.min(g.children.length, 6)));

  /** Một đơn vị cấp 1 và hai nhóm phòng con của nó. */
  const cotCap1 = (g: DepartmentNode) => {
    const tong = tongNhanh(g);
    const coNguoi = g.children.filter((c) => tongNhanh(c) > 0);
    const trong = g.children.filter((c) => tongNhanh(c) === 0);
    const xanhLa = false; // 16/09: mọi đơn vị cấp 1 cùng icon, cùng màu — trước đây cột chẵn xanh lá, cột lẻ xanh dương
    return (
      <div key={g.id} className="cp-cap1" style={{ flex: rongCot(g) }}>
        <div className="cp-noi cp-noi-3" />
        <div className={`cp-cap1-the${xanhLa ? ' cp-xanh-la' : ''}${dangChon?.id === g.id ? ' cp-o-chon' : ''}${!khop(g) ? ' cp-mo' : ''}`} onClick={() => setDangChon(g)}>
          <div className="cp-cap1-trai">
            <div className={`cp-cap1-icon ${xanhLa ? 'cp-icon-xanh-la' : 'cp-icon-xanh'}`}><ApartmentOutlined /></div>
            <div style={{ minWidth: 0 }}>
              <h3>
                {maPhongBiChan.has(g.code) && <WarningOutlined className="cp-canh-bao" />} {g.name}
              </h3>
              <div className="cp-cap1-phu">
                {g.children.length} phòng ban trực thuộc{g.userCount > 0 ? ` • ${g.userCount} người trực tiếp` : ''}
              </div>
            </div>
          </div>
          <span className={`cp-pill ${tong === 0 ? 'cp-pill-xam' : xanhLa ? 'cp-pill-xanh-la' : 'cp-pill-xanh'}`}>{tong} NS</span>
        </div>
        {g.children.length > 0 && (
          <>
            <div className="cp-noi cp-noi-3" />
            <button
              type="button"
              className="cp-nut-tron cp-nut-tron-nho"
              title={gapNhanh.has(g.id) ? `Mở ${g.children.length} phòng ban` : 'Thu gọn nhánh này'}
              onClick={() => doiGap(g.id)}
            >
              {gapNhanh.has(g.id) ? '+' : g.children.length}
            </button>
            {gapNhanh.has(g.id) ? (
              <div className="cp-cap1-phu" style={{ marginTop: 6 }}>{g.children.length} phòng ban · {tong - g.userCount} NS (đang thu gọn)</div>
            ) : (
            <>
            <div className="cp-noi cp-noi-3" />
            <div className="cp-nhom">
              {coNguoi.length > 0 && (
                <div>
                  {g.children.length > 1 && (
                    <div className="cp-nhom-ten">
                      <span><i className="cp-cham-day" /> Đang hoạt động ({coNguoi.length} đơn vị có nhân sự)</span>
                    </div>
                  )}
                  <div className="cp-luoi">{coNguoi.map((c, k) => oPhong(c, k))}</div>
                </div>
              )}
              {trong.length > 0 && (
                <div>
                  {g.children.length > 1 && (
                    <div className="cp-nhom-ten" style={{ color: '#94a3b8' }}>
                      <span><i className="cp-cham-trong" /> Chưa có nhân sự ({trong.length} đơn vị)</span>
                      <small>Cần tuyển &amp; gán NS</small>
                    </div>
                  )}
                  <div className="cp-luoi cp-luoi-trong">{trong.map((c, k) => oPhong(c, k))}</div>
                </div>
              )}
            </div>
            </>
            )}
          </>
        )}
      </div>
    );
  };

  const veCay = (goc: DepartmentNode) => {
    const tong = tongNhanh(goc);
    const soCon = goc.children.length;
    return (
      <div key={goc.id} className="cp-cay">
        <div className="cp-goc">
          <div className={`cp-goc-the${dangChon?.id === goc.id ? ' cp-o-chon' : ''}`} onClick={() => setDangChon(goc)}>
            <div className="cp-goc-icon"><BankOutlined /></div>
            <div style={{ minWidth: 0 }}>
              <div className="cp-goc-ten">
                <span>{goc.name}</span>
                <span className="cp-ma">{goc.code}</span>
              </div>
              <div className="cp-goc-phu">
                <b>{tong} nhân sự</b>
                <span>•</span>
                <span>{soCon} đơn vị trực thuộc</span>
                <span>•</span>
                <span>{demConChau(goc) - soCon} phòng</span>
              </div>
            </div>
            {coQuyenGhi && (
              <div className="cp-goc-them">
                <button type="button" onClick={(e) => { e.stopPropagation(); moThemMoi(goc); }}>+ Thêm</button>
              </div>
            )}
          </div>
          {soCon > 0 && (
            <>
              <div className="cp-noi cp-noi-4" />
              <button type="button" className="cp-nut-tron" title={gapHet ? 'Mở rộng tất cả' : 'Thu gọn tất cả'} onClick={doiGapHet}>
                {gapHet ? '+' : '−'}
              </button>
              <div className="cp-noi cp-noi-3" />
            </>
          )}
        </div>
        {soCon > 0 && (
          <>
            {soCon > 1 && (() => {
              // Vạch ngang nối TÂM cột đầu tới TÂM cột cuối — cột rộng không đều nên phải tính theo flex
              const cacRong = goc.children.map(rongCot);
              const tong = cacRong.reduce((t, r) => t + r, 0);
              const trai = (cacRong[0]! / 2 / tong) * 100;
              const phai = (cacRong[cacRong.length - 1]! / 2 / tong) * 100;
              return (
                <div className="cp-ngang">
                  <i style={{ left: `${trai}%`, right: `${phai}%` }} />
                </div>
              );
            })()}
            <div className="cp-cap1-luoi">{goc.children.map((g) => cotCap1(g))}</div>
          </>
        )}
      </div>
    );
  };

  const duongDan = (d: DepartmentNode): string => {
    const cha = d.parentId ? danhSachPhang.find((x) => x.id === d.parentId) : null;
    return cha ? `${duongDan(cha)} › ${cha.name}`.replace(/^ › /, '') : '';
  };

  const chuyenSangDataNode = (nodes: DepartmentNode[]): DataNode[] =>
    nodes.map((n) => ({
      key: n.id,
      title: (
        <span>
          {maPhongBiChan.has(n.code) && <WarningOutlined className="cp-canh-bao" />} {n.name}{' '}
          <span style={{ color: '#94a3b8', fontSize: 12 }}>{n.code}</span> <Tag style={{ marginInlineEnd: 0 }}>{n.userCount} người</Tag>
        </span>
      ),
      children: n.children.length > 0 ? chuyenSangDataNode(n.children) : undefined,
    }));

  return (
    <div className="cp">
      <ThanhTab nhom="nhan-su" />

      <div className="cp-dau">
        <h1>
          Cơ cấu tổ chức &amp; Cây phòng ban <span className="cp-huy-hieu">{danhSachPhang.length} đơn vị</span>
        </h1>
        <div className="cp-dau-phai">
          <div className="cp-che-do">
            <button type="button" className={cheDo === 'cay' ? 'cp-chon' : ''} onClick={() => setCheDo('cay')}><ApartmentOutlined /> Cây phòng ban</button>
            <button type="button" className={cheDo === 'the' ? 'cp-chon' : ''} onClick={() => setCheDo('the')}><AppstoreOutlined /> Thẻ đơn vị</button>
            <button type="button" className={cheDo === 'phan-cap' ? 'cp-chon' : ''} onClick={() => setCheDo('phan-cap')}><UnorderedListOutlined /> Phân cấp</button>
          </div>
          {coQuyenGhi && (
            <button type="button" className="cp-nut-xanh" onClick={() => moThemMoi(null)}>
              <PlusOutlined /> Thêm đơn vị
            </button>
          )}
        </div>
      </div>

      {!coQuyenGhi && <ReadOnlyNotice role={nguoiDangDangNhap?.role} />}

      {phongBiChan.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${phongBiChan.length} phòng đang có nhân sự nhưng chưa có trưởng bộ phận — ${phongBiChan.reduce((t, p) => t + p.headcount, 0)} người không sinh được phiếu KPI`}
          description={phongBiChan.map((p) => <Tag key={p.code} color="warning">{p.name} — {p.headcount} người</Tag>)}
        />
      )}

      <div className="cp-so-lieu">
        <div className="cp-the-3">
          <div className="cp-the">
            <div className="cp-the-so cp-the-so-xanh">{tongNhanSu}</div>
            <div style={{ minWidth: 0 }}>
              <div className="cp-the-ten">Tổng nhân sự</div>
              <div className="cp-the-phu">Đang làm việc, có phòng ban</div>
            </div>
          </div>
          <div className="cp-the">
            <div className="cp-the-so cp-the-so-xanh-la">{soCoNguoi}/{danhSachPhang.length}</div>
            <div style={{ minWidth: 0 }}>
              <div className="cp-the-ten">Đang hoạt động</div>
              <div className="cp-the-phu cp-the-phu-xanh-la">Đơn vị có nhân sự trực tiếp</div>
            </div>
          </div>
          <div className="cp-the">
            <div className="cp-the-so cp-the-so-cam">{soTrong}/{danhSachPhang.length}</div>
            <div style={{ minWidth: 0 }}>
              <div className="cp-the-ten">Đang chờ NS</div>
              <div className="cp-the-phu cp-the-phu-cam">Chưa có ai (khối / đang tuyển)</div>
            </div>
          </div>
        </div>
        <div className="cp-so-lieu-phai">
          <div className="cp-chu-giai">
            <span><i className="cp-cham-day" /> Có NS</span>
            <span style={{ color: '#94a3b8' }}><i className="cp-cham-trong" /> Trống</span>
          </div>
          {cheDo === 'cay' && (
            <div className="cp-zoom">
              <button type="button" title="Thu nhỏ" onClick={() => setZoom((z) => Math.max(60, z - 10))}><MinusOutlined /></button>
              <span>{zoom}%</span>
              <button type="button" title="Phóng to" onClick={() => setZoom((z) => Math.min(140, z + 10))}><PlusOutlined /></button>
            </div>
          )}
        </div>
      </div>

      <div className="cp-khung">
        <div className="cp-khung-dau">
          <div className="cp-tim">
            <SearchOutlined />
            <input value={timKiem} onChange={(e) => setTimKiem(e.target.value)} placeholder="Tìm phòng ban..." />
          </div>
          {cheDo === 'cay' && (
            <button type="button" className="cp-nut-nho" onClick={doiGapHet}>
              {gapHet ? 'Mở rộng (+)' : 'Thu gọn (−)'}
            </button>
          )}
        </div>

        {isLoading ? (
          <Skeleton active paragraph={{ rows: 6 }} />
        ) : cay.length === 0 ? (
          <div className="cp-chan">{coQuyenGhi ? 'Chưa có đơn vị nào. Bấm "Thêm đơn vị" để bắt đầu.' : 'Chưa có đơn vị nào.'}</div>
        ) : cheDo === 'cay' ? (
          <div className="cp-noi-dung" style={{ zoom: zoom / 100 }}>{cay.map(veCay)}</div>
        ) : cheDo === 'the' ? (
          <div className="cp-the-don-vi">
            {danhSachPhang.map((d, i) => (
              <div key={d.id} className={`cp-o${dangChon?.id === d.id ? ' cp-o-chon' : ''}${!khop(d) ? ' cp-mo' : ''}`} onClick={() => setDangChon(d)}>
                <div className="cp-o-dau">
                  <div className={`cp-o-ma cp-mau-${i % 6}`}>{maNgan(d.code)}</div>
                  <span className={`cp-o-so ${tongNhanh(d) > 0 ? `cp-mau-${i % 6}` : 'cp-pill-xam'}`}>{tongNhanh(d)} NS</span>
                </div>
                <div className="cp-o-ten">{maPhongBiChan.has(d.code) && <WarningOutlined className="cp-canh-bao" />} {d.name}</div>
                <div className="cp-o-phu">{d.managerName ?? (d.userCount > 0 ? 'Chưa có trưởng bộ phận' : 'Chưa có nhân sự')}</div>
                <div className="cp-duong-dan">{duongDan(d) || 'Cấp cao nhất'}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: 'rgba(255,255,255,0.85)', borderRadius: 8, padding: 8 }}>
            <Tree
              treeData={chuyenSangDataNode(cay)}
              defaultExpandedKeys={danhSachPhang.map((d) => d.id)}
              selectedKeys={dangChon ? [dangChon.id] : []}
              onSelect={(keys) => setDangChon(danhSachPhang.find((d) => d.id === keys[0]) ?? null)}
            />
          </div>
        )}

        <div className="cp-chan">
          <span><InfoCircleOutlined />Bấm vào thẻ để xem chi tiết và thao tác.</span>
          <b>Tổng cộng: {danhSachPhang.length} đơn vị ({soCap1} cấp 1, {Math.max(0, soPhongBan)} phòng ban)</b>
        </div>
      </div>

      {/* ===== ngăn chi tiết */}
      <Drawer open={dangChon !== null} onClose={() => setDangChon(null)} width={380} title={dangChon?.name}>
        {dangChon && (
          <>
            <div className="cp-ct-dong"><span>Mã đơn vị</span><b>{dangChon.code}</b></div>
            <div className="cp-ct-dong"><span>Thuộc</span><b>{danhSachPhang.find((d) => d.id === dangChon.parentId)?.name ?? 'Cấp cao nhất'}</b></div>
            <div className="cp-ct-dong">
              <span>Trưởng bộ phận</span>
              <b style={{ color: maPhongBiChan.has(dangChon.code) ? '#b45309' : undefined }}>{dangChon.managerName ?? (maPhongBiChan.has(dangChon.code) ? 'Chưa có — cần bổ nhiệm' : 'Chưa có')}</b>
            </div>
            <div className="cp-ct-dong"><span>Nhân sự trực tiếp</span><b>{dangChon.userCount} người</b></div>
            <div className="cp-ct-dong"><span>Nhân sự cả nhánh</span><b>{tongNhanh(dangChon)} người</b></div>
            <div className="cp-ct-dong"><span>Phòng con</span><b>{dangChon.children.length} trực tiếp · {demConChau(dangChon)} tổng</b></div>
            <div className="cp-ct-nut">
              <Button icon={<TeamOutlined />} onClick={() => navigate(`/admin/users?departmentId=${dangChon.id}`)}>Xem nhân sự</Button>
              {coQuyenGhi && (
                <>
                  <Button type="primary" icon={<EditOutlined />} onClick={() => moSua(dangChon)}>Sửa</Button>
                  <Button icon={<PlusOutlined />} onClick={() => moThemMoi(dangChon)}>Thêm phòng con</Button>
                  <Button danger icon={<DeleteOutlined />} onClick={() => xacNhanVoHieuHoa(dangChon)}>Vô hiệu hoá</Button>
                </>
              )}
            </div>
          </>
        )}
      </Drawer>

      {/* ===== modal thêm / sửa (giữ nguyên) */}
      <Modal
        open={modalMo}
        title={dangSua ? `Sửa "${dangSua.name}"` : 'Thêm đơn vị'}
        onCancel={() => setModalMo(false)}
        onOk={() => form.submit()}
        confirmLoading={luu.isPending}
        okText="Lưu"
        cancelText="Huỷ"
        destroyOnHidden
      >
        {loiForm && <Alert type="error" message={loiForm} showIcon style={{ marginBottom: 16 }} />}
        <Form<FormValues> form={form} layout="vertical" onFinish={(values) => luu.mutate(values)}>
          <Form.Item name="code" label="Mã đơn vị" rules={[{ required: true, message: 'Vui lòng nhập mã' }, { pattern: /^[A-Z0-9-]+$/, message: 'Chỉ gồm chữ in hoa, số và dấu gạch ngang' }]}>
            <Input placeholder="VD: KT-SD" />
          </Form.Item>
          <Form.Item name="name" label="Tên đơn vị" rules={[{ required: true, message: 'Vui lòng nhập tên' }]}>
            <Input placeholder="VD: Phòng Kỹ thuật" />
          </Form.Item>
          <Form.Item name="parentId" label="Thuộc đơn vị" extra="Để trống nếu đây là đơn vị cấp cao nhất">
            <Select allowClear showSearch optionFilterProp="label" placeholder="Chọn đơn vị cha" options={luaChonPhongCha} />
          </Form.Item>
          {dangSua && (
            <Form.Item name="managerId" label="Trưởng bộ phận" extra="Chỉ chọn được người thuộc chính đơn vị này">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={nguoiTrongPhong?.data.length ? 'Chọn trưởng bộ phận' : 'Đơn vị này chưa có nhân viên nào'}
                options={(nguoiTrongPhong?.data ?? []).map((u) => ({ value: u.id, label: `${u.fullName} (${u.employeeCode})` }))}
              />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
