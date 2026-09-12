import dayjs from 'dayjs';
import type { KyDanhGia } from '../types/scorecard';

/**
 * Kỳ THÁNG chứa ngày hôm nay, hoặc `undefined` nếu chưa được sinh.
 *
 * Backend tự sinh kỳ tháng này và tháng kế tiếp nên bình thường luôn có;
 * thiếu chỉ khi database mới dựng hoặc máy chủ dừng lâu ngày.
 */
export function kyChuaHomNay(danhSach: KyDanhGia[], homNay = dayjs()): KyDanhGia | undefined {
  return danhSach.find(
    (ky) =>
      ky.type === 'MONTH' &&
      !homNay.isBefore(dayjs(ky.startDate), 'day') &&
      !homNay.isAfter(dayjs(ky.endDate), 'day'),
  );
}

/** Kỳ THÁNG bắt đầu ngay sau kỳ đã cho, hoặc `undefined`. */
export function kyKeTiep(danhSach: KyDanhGia[], ky: KyDanhGia): KyDanhGia | undefined {
  const ngaySau = dayjs(ky.endDate).add(1, 'day');
  return danhSach.find(
    (k) => k.type === 'MONTH' && dayjs(k.startDate).isSame(ngaySau, 'day'),
  );
}

/** "25" từ chuỗi ngày ISO; "—" khi kỳ tạo tay không có mốc. */
export function ngayTrongThang(iso: string | null): string {
  return iso ? dayjs(iso).format('D') : '—';
}

/**
 * Tên gọi từ họ tên đầy đủ: tiếng Việt đặt tên gọi ở cuối.
 * "Trần Quốc Việt" → "Việt". Tên một từ trả nguyên.
 */
export function tenGoi(fullName: string): string {
  const tu = fullName.trim().split(/\s+/);
  return tu[tu.length - 1] ?? fullName;
}

/** "sự" -> "Sự": tên gọi lấy từ họ tên gõ thường (dữ liệu seed) vẫn đọc được. */
export function vietHoaDau(s: string): string {
  return s.charAt(0).toLocaleUpperCase('vi') + s.slice(1);
}

/** Hai chữ đầu của tên gọi, viết hoa — dùng cho avatar. */
export function chuVietTat(fullName: string): string {
  return tenGoi(fullName).slice(0, 2).toUpperCase();
}

export interface GiaiDoanKy {
  /** 1 tự chấm · 2 trưởng bộ phận chấm · 3 HCNS chốt sổ · 4 đã qua mọi mốc. */
  so: 1 | 2 | 3 | 4;
  ten: string;
  /** Mốc kết thúc giai đoạn hiện tại (ISO) — `null` ở giai đoạn 4 hoặc kỳ tạo tay thiếu mốc. */
  han: string | null;
  /** Ngày còn lại tới `han`, âm nếu đã qua. `null` khi không có hạn. */
  conNgay: number | null;
}

/**
 * Giai đoạn của kỳ THÁNG tại một ngày, suy từ ba mốc trong tháng
 * (quy-tac-nghiep-vu.md 5.5): tới hết ngày tự chấm là GĐ1, tới hết ngày
 * trưởng bộ phận chấm là GĐ2, tới hết ngày gửi HCNS là GĐ3, sau đó là GĐ4.
 * Mốc thiếu (kỳ tạo tay) thì coi như đã qua giai đoạn đó.
 */
export function giaiDoanCuaKy(ky: KyDanhGia, homNay = dayjs()): GiaiDoanKy {
  const ngay = homNay.startOf('day');
  const conToi = (iso: string | null) => (iso ? dayjs(iso).startOf('day').diff(ngay, 'day') : null);
  const chua = (iso: string | null) => iso !== null && !ngay.isAfter(dayjs(iso), 'day');

  if (chua(ky.selfScoreDeadline)) {
    return { so: 1, ten: 'Nhân viên tự chấm', han: ky.selfScoreDeadline, conNgay: conToi(ky.selfScoreDeadline) };
  }
  if (chua(ky.managerScoreDeadline)) {
    return { so: 2, ten: 'Trưởng bộ phận chấm', han: ky.managerScoreDeadline, conNgay: conToi(ky.managerScoreDeadline) };
  }
  if (chua(ky.submitDeadline)) {
    return { so: 3, ten: 'HCNS tiếp nhận & chốt sổ', han: ky.submitDeadline, conNgay: conToi(ky.submitDeadline) };
  }
  return { so: 4, ten: ky.isLocked ? 'Đã chốt sổ' : 'Đã qua hạn, chờ chốt sổ', han: null, conNgay: null };
}
