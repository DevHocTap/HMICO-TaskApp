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

/** Năm và tháng hiện tại theo giờ Việt Nam. */
export function namThangHienTai(bayGio: Date = new Date()): {
  nam: number;
  thang: number;
} {
  const phanTich = new Intl.DateTimeFormat('en-CA', {
    timeZone: MUI_GIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(bayGio);
  const [nam, thang] = phanTich.split('-').map(Number);
  return { nam, thang };
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
