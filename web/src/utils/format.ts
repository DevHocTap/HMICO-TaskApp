/**
 * "88.20" (chuỗi Decimal từ backend) → "88,2" để in lên thẻ số liệu.
 *
 * Một chữ số thập phân là đủ cho thẻ tóm tắt; bảng chi tiết vẫn in hai
 * chữ số như backend trả. Dấu phẩy theo cách viết tiếng Việt.
 */
export function diemTomTat(diem: string | null | undefined): string {
  if (diem === null || diem === undefined) return '—';
  return Number(diem).toLocaleString('vi-VN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/** Phần trăm nguyên, 0 khi mẫu số bằng 0 — không bao giờ NaN. */
export function phanTram(tu: number, mau: number): number {
  if (mau <= 0) return 0;
  return Math.round((tu / mau) * 100);
}

const MUI_GIO_VN = 'Asia/Ho_Chi_Minh';

/** "25/09/2026" — giờ Việt Nam bất kể máy người dùng đặt múi giờ nào. */
export function ngayVN(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: MUI_GIO_VN,
  }).format(new Date(iso));
}

/** "09:27 25/09/2026". */
export function ngayGioVN(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const gio = new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: MUI_GIO_VN,
  }).format(d);
  return `${gio} ${ngayVN(iso)}`;
}
