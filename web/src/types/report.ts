/** Một dòng tiến độ nộp. Số liệu ĐÃ được backend cộng dồn từ cây con. */
export interface DongTienDo {
  departmentId: string;
  departmentName: string;
  parentId: string | null;
  tongNhanSu: number;
  chuaCoPhieu: number;
  chuaKyNhan: number;
  choTuCham: number;
  choTruongCham: number;
  choTiepNhan: number;
  daNop: number;
}

export interface BaoCaoTienDo {
  period: { id: string; code: string; name: string };
  /** Chờ HCNS chốt mốc hạn nộp — hiện luôn null / false. */
  daysUntilDeadline: number | null;
  isOverdue: boolean;
  departments: DongTienDo[];
}

/** Dòng cho Table dạng cây của Ant Design. */
export interface DongTienDoCay extends DongTienDo {
  children?: DongTienDoCay[];
}

/**
 * Dựng cây từ danh sách phẳng.
 *
 * Backend đã cắt `parentId` trỏ ra ngoài phạm vi thành `null`, nên phòng
 * nào không tìm thấy cha ở đây là gốc thật. Vẫn phòng thân: dòng mồ côi
 * được đẩy lên mức gốc thay vì biến mất khỏi bảng.
 */
export function dungCayPhong(dongs: DongTienDo[]): DongTienDoCay[] {
  const nut = new Map<string, DongTienDoCay>();
  for (const d of dongs) nut.set(d.departmentId, { ...d });

  const goc: DongTienDoCay[] = [];
  for (const d of dongs) {
    const hienTai = nut.get(d.departmentId)!;
    const cha = d.parentId ? nut.get(d.parentId) : undefined;
    if (!cha) {
      goc.push(hienTai);
      continue;
    }
    (cha.children ??= []).push(hienTai);
  }
  return goc;
}

/** Mọi id trong cây — để mở hết mọi nhánh mặc định. */
export function moiIdPhong(dongs: DongTienDo[]): string[] {
  return dongs.map((d) => d.departmentId);
}

// ----------------------------------------------------------- dashboard

export type TrangThaiCham =
  | 'PENDING'
  | 'SELF_SCORED'
  | 'MANAGER_SCORED'
  | 'REJECTED'
  | 'RECEIVED';

export type XepLoaiKpi =
  | 'NOT_ACHIEVED'
  | 'NEEDS_IMPROVEMENT'
  | 'COMPLETED'
  | 'EXCEEDED';

export interface DiemTrungBinhPhong {
  departmentId: string;
  departmentName: string;
  soPhieuDaChot: number;
  /** Chuỗi hai chữ số thập phân; `null` khi phòng chưa có phiếu nào chốt. */
  diemTrungBinh: string | null;
}

export interface DiemTrungBinhChucDanh {
  /** Tên chức danh chụp trên phiếu. */
  jobTitleName: string;
  soPhieuDaChot: number;
  diemTrungBinh: string | null;
}

export interface SoLieuDashboard {
  period: { id: string; code: string; name: string };
  soPhieuTrongKy: number;
  soPhieuDaChot: number;
  theoTrangThai: Record<TrangThaiCham, number>;
  phanBoXepLoai: Record<XepLoaiKpi, number>;
  /** Điểm TB của từng hạng (chuỗi hai chữ số), `null` khi hạng chưa có ai. */
  diemTrungBinhTheoXepLoai: Record<XepLoaiKpi, string | null>;
  diemTrungBinhTheoPhong: DiemTrungBinhPhong[];
  /** Theo chức danh — thẻ "Hiệu suất theo chức danh" của trưởng phòng (13/09). */
  diemTrungBinhTheoChucDanh: DiemTrungBinhChucDanh[];
}

// ------------------------------------------------- tóm tắt trang chủ
// Khớp `TomTatTrangChu` ở backend (reports/home-summary.service.ts).
// Một object theo vai của người gọi; kỳ luôn là kỳ THÁNG chứa hôm nay.

interface KyTomTat {
  id: string;
  code: string;
  name: string;
}

export interface TomTatAdmin {
  role: 'ADMIN';
  period: KyTomTat | null;
  taiKhoanHoatDong: number;
  tongTaiKhoan: number;
  chuaDoiMatKhau: number;
  soPhongBan: number;
  phongThieuTruong: string[];
  mauDaXuatBan: number;
  tongMau: number;
  thaoTac24h: number;
}

export interface TomTatExecutive {
  role: 'EXECUTIVE';
  period: KyTomTat | null;
  soPhieuTrongKy: number;
  soPhieuDaChot: number;
  diemTrungBinh: string | null;
  soNguoiDat: number;
  soNguoiCanCaiThien: number;
  phongCanChuY: { departmentName: string; diemTrungBinh: string }[];
}

export interface TomTatHr {
  role: 'HR';
  period: KyTomTat | null;
  soNhanSu: number;
  soPhieuTrongKy: number;
  soPhieuDaChot: number;
  daTiepNhan: number;
  phongDaNopDu: number;
  tongPhongCoNhanSu: number;
  phongConThieu: string[];
}

export interface TomTatManager {
  role: 'MANAGER';
  period: KyTomTat | null;
  soNhanSu: number;
  soPhieuTrongKy: number;
  daTuCham: number;
  daChot: number;
  diemTrungBinh: string | null;
}

export interface TomTatStaff {
  role: 'STAFF';
  period: KyTomTat | null;
  thangTruoc: { periodName: string; diem: string | null; grade: XepLoaiKpi | null } | null;
  trungBinhGanDay: { diem: string; soPhieu: number; periodNames: string[] } | null;
  tuCham: { chua: number; tong: number; scorecardId: string } | null;
}

export type TomTatTrangChu =
  | TomTatAdmin
  | TomTatExecutive
  | TomTatHr
  | TomTatManager
  | TomTatStaff;

/** Một điểm trên đường xu hướng — `GET /reports/trend`. */
export interface DiemXuHuong {
  period: { id: string; code: string; name: string };
  soPhieuTrongKy: number;
  soPhieuDaChot: number;
  /** Chuỗi hai chữ số thập phân; `null` khi kỳ chưa có phiếu chốt. */
  diemTrungBinh: string | null;
}
