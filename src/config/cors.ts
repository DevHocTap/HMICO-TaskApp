/**
 * Quyết định một Origin có được gọi API hay không.
 *
 * Ở môi trường dev, chấp nhận mọi cổng của localhost và 127.0.0.1. Lý do:
 * Vite tự nhảy sang cổng khác khi cổng mặc định bị chiếm (5173 -> 5174),
 * và trình duyệt coi localhost với 127.0.0.1 là hai nguồn khác nhau. Cố
 * định danh sách cổng ở dev chỉ tạo ra lỗi "không kết nối được máy chủ"
 * rất khó đoán ra nguyên nhân.
 *
 * Ở production KHÔNG nới lỏng gì: chỉ đúng những địa chỉ khai trong
 * CORS_ORIGINS mới qua được.
 */
const LOCALHOST_MOI_CONG = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export type KiemTraOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) => void;

export function taoKiemTraOrigin(
  duocPhep: readonly string[],
  laMoiTruongDev: boolean,
): KiemTraOrigin {
  return (origin, callback) => {
    // Không có Origin: curl, ứng dụng di động, hoặc request cùng nguồn.
    // CORS không áp dụng cho những trường hợp này.
    if (!origin) return callback(null, true);

    if (duocPhep.includes(origin)) return callback(null, true);

    if (laMoiTruongDev && LOCALHOST_MOI_CONG.test(origin)) {
      return callback(null, true);
    }

    // Không ném lỗi: chỉ đơn giản không gắn header Allow-Origin, trình
    // duyệt sẽ tự chặn. Ném lỗi sẽ làm bẩn log bằng những request vô hại.
    return callback(null, false);
  };
}
