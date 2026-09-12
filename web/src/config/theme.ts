import type { ThemeConfig } from 'antd';

/**
 * Bảng màu và chữ của toàn ứng dụng — đổi ở đây là mọi màn đổi theo.
 *
 * Bộ mẫu 12/09/2026 (phong cách PerformKPI): chữ không chân Inter, xanh
 * dương đậm, nền xám nhạt, thẻ trắng viền mảnh. Thay cho bộ Lora + xanh ngọc
 * của 11/09 — chốt 12/09 vì bảng số liệu dày đọc dễ hơn với chữ không chân.
 *
 * - `mauChuDao`: nút, link, mục menu đang chọn
 * - `mauNenDam`: mảng nền tối (cột trái đăng nhập, thẻ tổng điểm)
 * - `mauNhan`: số liệu cần chú ý (thiếu, chậm, dưới ngưỡng); `mauVang` chờ ai
 *   đó; `mauXanhLa` đã xong. KHÔNG phải màu lỗi của form — antd giữ đỏ mặc định.
 *
 * Các biến CSS cùng tên nằm ở index.css `:root` — sửa cả hai chỗ khi đổi.
 */
export const mauChuDao = '#1d4ed8';
export const mauNenDam = '#1e3a8a';
export const mauNhan = '#dc2626';
export const mauVang = '#d97706';
export const mauXanhLa = '#16a34a';
export const mauNenAm = '#ffffff';
export const mauNenTrang = '#ffffff';
export const mauDo = mauNhan;

/**
 * Phòng có điểm trung bình DƯỚI mốc này thì tô đỏ — khớp
 * `NGUONG_PHONG_CAN_CHU_Y` ở backend (reports/home-summary.service.ts).
 */
export const NGUONG_PHONG_CAN_CHU_Y = 80;

export const fontSans =
  "'Inter', -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
/** @deprecated giữ tên cũ cho chỗ còn import; cùng giá trị với `fontSans`. */
export const fontSerif = fontSans;

export const theme: ThemeConfig = {
  token: {
    colorPrimary: mauChuDao,
    colorLink: mauChuDao,
    colorSuccess: mauXanhLa,
    colorWarning: mauVang,
    colorError: mauNhan,
    fontFamily: fontSans,
    borderRadius: 8,
    colorBgLayout: '#f5f7fb',
    colorBorderSecondary: '#e5e7eb',
  },
  components: {
    Layout: {
      headerBg: mauNenTrang,
      siderBg: mauNenAm,
    },
    Menu: {
      itemBg: 'transparent',
      groupTitleColor: '#6b7280',
      itemSelectedBg: '#e8efff',
      itemSelectedColor: mauChuDao,
      itemBorderRadius: 10,
      itemHeight: 38,
      iconMarginInlineEnd: 10,
    },
    Card: {
      borderRadiusLG: 14,
    },
    Tag: {
      borderRadiusSM: 999,
      fontSizeSM: 12,
    },
  },
};
