/**
 * Quy tắc THUẦN về tên file và dọn bản sao lưu — không import NestJS, không
 * chạm ổ đĩa, để test được từng ca.
 *
 * Tên file: `kpi_YYYY-MM-DD_HHmmss.dump` (giờ Việt Nam; có giây vì bản tự động
 * lúc khởi động và bản bấm tay có thể rơi cùng một phút). Cạnh mỗi `.dump` có
 * một `.json` ghi kích thước, thời gian, nguồn, người bấm, migration mới
 * nhất — THƯ MỤC FILE là nguồn sự thật, không có bảng trong database (DB
 * hỏng thì bảng cũng hỏng theo).
 */

export const MUI_GIO_VN_PHUT = 7 * 60;

export interface ThongTinBanSao {
  tenFile: string;
  /** ISO, thời điểm bắt đầu dump. */
  taoLuc: string;
  kichThuoc: number;
  nguon: 'TU_DONG' | 'THU_CONG';
  nguoiBamId: string | null;
  nguoiBamTen: string | null;
  /** Migration Prisma mới nhất lúc dump — để biết bản này khôi phục vào mã nào. */
  migrationMoiNhat: string | null;
  giayChay: number;
  daKiemTra: boolean;
  daChepSangMirror: boolean;
}

/** `Date` → các phần theo giờ Việt Nam, không phụ thuộc múi giờ máy chủ. */
export function phanNgayVN(d: Date): { nam: number; thang: number; ngay: number; gio: number; phut: number; giay: number } {
  const t = new Date(d.getTime() + MUI_GIO_VN_PHUT * 60_000);
  return {
    nam: t.getUTCFullYear(),
    thang: t.getUTCMonth() + 1,
    ngay: t.getUTCDate(),
    gio: t.getUTCHours(),
    phut: t.getUTCMinutes(),
    giay: t.getUTCSeconds(),
  };
}

export function tenFileSaoLuu(luc: Date): string {
  const p = phanNgayVN(luc);
  const hai = (n: number) => String(n).padStart(2, '0');
  return `kpi_${p.nam}-${hai(p.thang)}-${hai(p.ngay)}_${hai(p.gio)}${hai(p.phut)}${hai(p.giay)}.dump`;
}

const MAU_TEN = /^kpi_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\.dump$/;

/** Đọc ngày (giờ VN) từ tên file; `null` nếu không đúng khuôn — file lạ không bao giờ bị dọn. */
export function ngayTuTenFile(tenFile: string): { nam: number; thang: number; ngay: number; khoa: string } | null {
  const m = MAU_TEN.exec(tenFile);
  if (!m) return null;
  const [, nam, thang, ngay] = m;
  return { nam: Number(nam), thang: Number(thang), ngay: Number(ngay), khoa: `${nam}-${thang}-${ngay}` };
}

/**
 * Chọn file CẦN XOÁ theo ba bậc (chốt 15/09/2026):
 *  - bản ngày: giữ `giuBanNgay` NGÀY gần nhất có bản (mỗi ngày có thể nhiều bản, giữ hết trong ngày đó);
 *  - bản cuối tháng: với mỗi tháng, bản MUỘN NHẤT của tháng đó là "bản cuối tháng" — giữ `giuBanThang` tháng gần nhất;
 *  - bản cuối năm: bản muộn nhất của mỗi năm giữ VĨNH VIỄN.
 * Tháng/năm ĐANG DIỄN RA chưa có "bản cuối" thật, nhưng bản muộn nhất hiện có
 * vẫn được coi là cuối tháng/năm tạm — tháng sau nó tự trượt sang bản mới.
 * File không đúng khuôn tên bị bỏ qua (không xoá).
 */
export function chonFileCanXoa(
  cacTenFile: string[],
  giuBanNgay: number,
  giuBanThang: number,
): string[] {
  const hopLe = cacTenFile
    .map((t) => ({ ten: t, ngay: ngayTuTenFile(t) }))
    .filter((x): x is { ten: string; ngay: NonNullable<ReturnType<typeof ngayTuTenFile>> } => x.ngay !== null)
    .sort((a, b) => (a.ten < b.ten ? -1 : 1)); // tên chứa ngày giờ nên thứ tự chuỗi = thứ tự thời gian

  const giu = new Set<string>();

  // Bậc 1: N ngày gần nhất
  const cacNgay = [...new Set(hopLe.map((x) => x.ngay.khoa))].sort().slice(-giuBanNgay);
  for (const x of hopLe) if (cacNgay.includes(x.ngay.khoa)) giu.add(x.ten);

  // Bậc 2: bản muộn nhất mỗi tháng, M tháng gần nhất
  const cuoiThang = new Map<string, string>();
  for (const x of hopLe) cuoiThang.set(`${x.ngay.nam}-${String(x.ngay.thang).padStart(2, '0')}`, x.ten);
  for (const th of [...cuoiThang.keys()].sort().slice(-giuBanThang)) giu.add(cuoiThang.get(th)!);

  // Bậc 3: bản muộn nhất mỗi năm, vĩnh viễn
  const cuoiNam = new Map<number, string>();
  for (const x of hopLe) cuoiNam.set(x.ngay.nam, x.ten);
  for (const t of cuoiNam.values()) giu.add(t);

  return hopLe.filter((x) => !giu.has(x.ten)).map((x) => x.ten);
}

/** Bóc host/port/user/pass/db từ `DATABASE_URL` của Prisma. */
export function bocDatabaseUrl(url: string): { host: string; port: string; user: string; pass: string; db: string } {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    pass: decodeURIComponent(u.password),
    db: u.pathname.replace(/^\//, ''),
  };
}
