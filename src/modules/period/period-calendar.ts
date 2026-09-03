import { PeriodType } from '@prisma/client';

/**
 * Múi giờ nghiệp vụ. Máy chủ có thể chạy UTC, nhưng "tháng 9" phải hiểu
 * theo giờ Việt Nam — nếu không, đêm 31/08 giờ VN vẫn là 30/08 giờ UTC và
 * hệ thống sinh nhầm kỳ.
 */
export const MUI_GIO = 'Asia/Ho_Chi_Minh';

/**
 * Hạn nộp kết quả về HCNS: ngày thứ N của tháng kế tiếp.
 *
 * Biểu mẫu ghi "trước ngày 02 tháng kế tiếp" — chưa rõ là hết ngày 01 hay
 * hết ngày 02, HCNS sẽ chốt sau. Đổi đúng một số ở đây là xong.
 */
export const NGAY_HAN_NOP = 2;

/**
 * Ngày lịch hiện tại theo giờ Việt Nam.
 *
 * Phải đi qua `Intl` chứ không dùng `getDate()`: máy chủ chạy UTC thì
 * 06:00 ngày 03 giờ VN vẫn là 23:00 ngày 02 giờ UTC, lệch đúng một ngày ở
 * mọi mốc so sánh.
 */
export function ngayLichHienTai(bayGio: Date = new Date()): {
  nam: number;
  thang: number;
  ngay: number;
} {
  const phanTich = new Intl.DateTimeFormat('en-CA', {
    timeZone: MUI_GIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(bayGio);
  const [nam, thang, ngay] = phanTich.split('-').map(Number);
  return { nam, thang, ngay };
}

/** Năm và tháng hiện tại theo giờ Việt Nam. */
export function namThangHienTai(bayGio: Date = new Date()): {
  nam: number;
  thang: number;
} {
  const { nam, thang } = ngayLichHienTai(bayGio);
  return { nam, thang };
}

/**
 * Hôm nay dưới dạng `Date` ngày-thuần, khớp kiểu `@db.Date` của Prisma.
 * Dùng để so với `Period.startDate` / `Period.endDate`.
 */
export function homNayDangNgay(bayGio: Date = new Date()): Date {
  const { nam, thang, ngay } = ngayLichHienTai(bayGio);
  return new Date(Date.UTC(nam, thang - 1, ngay));
}

/**
 * Số ngày kể từ epoch của một `Date` NGÀY-THUẦN.
 *
 * Cố ý đọc bằng `getUTC*()`: cả `homNayDangNgay()` lẫn cột `@db.Date` của
 * Prisma đều gói ngày lịch vào nửa đêm UTC. Dùng `getDate()` ở đây sẽ đọc
 * theo múi giờ của máy chạy và làm kết quả phụ thuộc chỗ deploy.
 */
function soNgayEpoch(d: Date): number {
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

export interface TinhTrangHanNop {
  /**
   * Số ngày CÒN NỘP ĐƯỢC, tính cả hôm nay. Không bao giờ âm.
   * `null` khi việc đó không có hạn.
   */
  daysUntilDeadline: number | null;
  isOverdue: boolean;
}

/**
 * Đối chiếu hạn nộp với hôm nay theo NGÀY LỊCH giờ Việt Nam.
 *
 * Quy tắc nghiệp vụ (`quy-tac-nghiep-vu.md` mục 5.5): hạn là **HẾT ngày
 * `NGAY_HAN_NOP`** của tháng kế tiếp, nên chính ngày hạn vẫn còn nộp được.
 * Với hạn 02/10: ngày 01 còn 2, ngày 02 còn 1, ngày 03 là quá hạn.
 *
 * So NGÀY LỊCH chứ không so mốc thời gian: lấy hiệu hai mốc rồi chia
 * 86400000 sẽ lệch đúng 7 tiếng so với giờ VN — đủ để sai một ngày ở chính
 * hôm hạn chót.
 *
 * NGỮ NGHĨA HAI THAM SỐ KHÁC NHAU, đừng đối xử giống nhau:
 *
 * - `hanNop` là **NGÀY LỊCH THUẦN**, không phải thời điểm. Nó đến từ cột
 *   `Period.submitDeadline` kiểu `@db.Date` — trong database chỉ có
 *   `2026-10-02`, không có giờ, không có múi giờ. Prisma dựng lại thành
 *   `Date` bằng cách gắn nửa đêm UTC, nhưng số 00:00Z đó là **quy ước lưu
 *   trữ, không phải một thời điểm có thật**: hạn nộp không xảy ra lúc 0 giờ
 *   ở bất kỳ đâu.
 *
 *   Vì vậy **KHÔNG quy đổi `hanNop` sang giờ VN**. Quy đổi một ngày lịch
 *   sang múi giờ khác là phép toán vô nghĩa — 02/10 giờ UTC không "thành"
 *   01/10 hay 03/10 giờ VN, nó vẫn là ngày 02. Đọc thẳng ba số
 *   năm/tháng/ngày ra bằng `getUTC*()`, đúng như lúc ghi vào.
 *
 * - `bayGio` NGƯỢC LẠI là một **thời điểm thật**, nên BẮT BUỘC phải quy đổi
 *   sang giờ VN mới biết "hôm nay" là ngày mấy. Máy chủ chạy UTC thì 06:00
 *   ngày 03 giờ VN vẫn là 23:00 ngày 02 giờ UTC.
 *
 * Trộn hai thứ này lại — quy đổi cả hai, hoặc không quy đổi cái nào — là
 * đúng nguyên nhân của lỗi lệch một ngày đã sửa ở GĐ2.6.
 */
export function tinhTinhTrangHanNop(
  hanNop: Date | null,
  bayGio: Date = new Date(),
): TinhTrangHanNop {
  if (!hanNop) return { daysUntilDeadline: null, isOverdue: false };

  const chenhLech = soNgayEpoch(hanNop) - soNgayEpoch(homNayDangNgay(bayGio));
  if (chenhLech < 0) return { daysUntilDeadline: 0, isOverdue: true };
  return { daysUntilDeadline: chenhLech + 1, isOverdue: false };
}

/** Cộng thêm `soThang` vào một mốc năm/tháng, tự nhảy năm khi vượt tháng 12. */
export function congThang(
  nam: number,
  thang: number,
  soThang: number,
): { nam: number; thang: number } {
  const tong = (nam * 12 + (thang - 1)) + soThang;
  return { nam: Math.floor(tong / 12), thang: (tong % 12) + 1 };
}

/** Ngày dạng UTC thuần, khớp kiểu `@db.Date` (không có phần giờ). */
function ngay(nam: number, thang: number, ngayTrongThang: number): Date {
  return new Date(Date.UTC(nam, thang - 1, ngayTrongThang));
}

export const maKyThang = (nam: number, thang: number): string =>
  `${nam}-${String(thang).padStart(2, '0')}`;

export const maKyQuy = (nam: number, quy: number): string => `${nam}-Q${quy}`;

export const maKyNam = (nam: number): string => String(nam);

export const quyCuaThang = (thang: number): number => Math.ceil(thang / 3);

export interface KyCanTao {
  code: string;
  name: string;
  type: PeriodType;
  startDate: Date;
  endDate: Date;
  /** CHỈ kỳ tháng có hạn nộp. Kỳ quý và năm chỉ để tổng hợp. */
  submitDeadline: Date | null;
  /** Mã kỳ cha, hoặc null nếu là kỳ năm. */
  parentCode: string | null;
}

export function kyThang(nam: number, thang: number): KyCanTao {
  const hanNop = congThang(nam, thang, 1);
  return {
    code: maKyThang(nam, thang),
    name: `Tháng ${String(thang).padStart(2, '0')}/${nam}`,
    type: PeriodType.MONTH,
    startDate: ngay(nam, thang, 1),
    // Ngày 0 của tháng sau chính là ngày cuối tháng này — không cần bảng
    // số ngày, cũng đúng luôn với năm nhuận.
    endDate: new Date(Date.UTC(nam, thang, 0)),
    submitDeadline: ngay(hanNop.nam, hanNop.thang, NGAY_HAN_NOP),
    parentCode: maKyQuy(nam, quyCuaThang(thang)),
  };
}

export function kyQuy(nam: number, quy: number): KyCanTao {
  const thangDau = (quy - 1) * 3 + 1;
  return {
    code: maKyQuy(nam, quy),
    name: `Quý ${quy}/${nam}`,
    type: PeriodType.QUARTER,
    startDate: ngay(nam, thangDau, 1),
    endDate: new Date(Date.UTC(nam, thangDau + 2, 0)),
    submitDeadline: null,
    parentCode: maKyNam(nam),
  };
}

export function kyNam(nam: number): KyCanTao {
  return {
    code: maKyNam(nam),
    name: `Năm ${nam}`,
    type: PeriodType.YEAR,
    startDate: ngay(nam, 1, 1),
    endDate: ngay(nam, 12, 31),
    submitDeadline: null,
    parentCode: null,
  };
}

/**
 * Danh sách kỳ cần bảo đảm tồn tại, tính từ thời điểm `bayGio`.
 *
 * QUY TẮC BÙ KỲ: chỉ **tháng hiện tại và tháng kế tiếp**, cộng kỳ quý và
 * kỳ năm chứa chúng. **KHÔNG BAO GIỜ bù ngược về quá khứ.**
 *
 * Vì sao không bù ngược: khởi động lại máy chủ vào tháng 9 mà sinh ngược
 * 8 kỳ đầu năm thì tạo ra 8 kỳ rỗng không ai điền, làm rác ô chọn kỳ và
 * khiến bảng theo dõi tiến độ nộp báo "chưa nộp" cho những tháng chưa từng
 * dùng hệ thống. Kỳ quá khứ nếu thật sự cần thì HCNS tạo tay.
 *
 * Trả về theo thứ tự CHA TRƯỚC CON, để tạo tuần tự là nối được parentId.
 */
export function cacKyCanBaoDam(bayGio: Date = new Date()): KyCanTao[] {
  const { nam, thang } = namThangHienTai(bayGio);
  const ke = congThang(nam, thang, 1);

  const thangCanCo = [
    { nam, thang },
    { nam: ke.nam, thang: ke.thang },
  ];

  const ra: KyCanTao[] = [];
  const daCo = new Set<string>();
  const them = (k: KyCanTao) => {
    if (daCo.has(k.code)) return;
    daCo.add(k.code);
    ra.push(k);
  };

  for (const t of thangCanCo) {
    them(kyNam(t.nam));
    them(kyQuy(t.nam, quyCuaThang(t.thang)));
  }
  // Kỳ tháng thêm sau cùng để mọi kỳ cha chắc chắn đã có mặt trước
  for (const t of thangCanCo) them(kyThang(t.nam, t.thang));

  return ra;
}
