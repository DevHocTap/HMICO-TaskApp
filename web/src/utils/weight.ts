/**
 * Cộng trọng số mà không dùng số thực.
 *
 * `28.4 + 35.8 + 35.8` trong JavaScript ra `99.99999999999999`, còn
 * `28.6 + 35.7 + 35.7` ra `100.00000000000001`. Nếu thanh tổng trọng số
 * cộng kiểu đó thì người dùng nhập một mẫu hoàn toàn đúng mà màn hình vẫn
 * báo đỏ — không cách nào hiểu nổi.
 *
 * Cách xử lý: quy về số nguyên phần trăm-của-trăm (như quy về xu), cộng
 * bằng số nguyên rồi mới chia lại. Trọng số chỉ có tối đa 2 chữ số thập
 * phân nên không mất gì.
 *
 * Backend cộng bằng Prisma.Decimal; hai bên phải ra cùng kết quả, nếu
 * không giao diện sẽ báo hợp lệ mà API vẫn từ chối.
 */

const DON_VI = 100;

/** Đổi chuỗi người dùng gõ thành số nguyên đơn vị. Không đọc được thì 0. */
export function sangDonVi(giaTri: string | number | null | undefined): number {
  if (giaTri === null || giaTri === undefined || giaTri === '') return 0;
  const so = typeof giaTri === 'number' ? giaTri : Number(String(giaTri).replace(',', '.'));
  if (!Number.isFinite(so)) return 0;
  return Math.round(so * DON_VI);
}

export function tongTrongSo(cac: Array<string | number | null | undefined>): number {
  return cac.reduce<number>((tong, g) => tong + sangDonVi(g), 0) / DON_VI;
}

/** So sánh chính xác, không dùng dấu bằng của số thực. */
export function bang(a: string | number, b: number): boolean {
  return sangDonVi(a) === sangDonVi(b);
}

/** Bỏ số 0 thừa ở đuôi: 70.00 -> "70", 12.50 -> "12.5" */
export function hienSo(giaTri: number): string {
  return String(Math.round(giaTri * DON_VI) / DON_VI);
}

/**
 * Chia đều `tong` cho `soPhan`, phần dư dồn vào các phần đầu.
 *
 * Chia 100 cho 3 ra 33.34 / 33.33 / 33.33 — cộng lại đúng 100. Chia đều
 * kiểu làm tròn từng phần sẽ ra 33.33 × 3 = 99.99 và mẫu không xuất bản
 * được, đúng thứ nút "Chia đều" phải tránh.
 */
export function chiaDeu(tong: number, soPhan: number): number[] {
  if (soPhan <= 0) return [];
  const tongDonVi = Math.round(tong * DON_VI);
  const moiPhan = Math.floor(tongDonVi / soPhan);
  const du = tongDonVi - moiPhan * soPhan;
  return Array.from({ length: soPhan }, (_, i) => (moiPhan + (i < du ? 1 : 0)) / DON_VI);
}
