/**
 * Địa chỉ API. Không ghi cứng — mỗi môi trường một giá trị khác nhau.
 * Khai báo trong web/.env (xem web/.env.example).
 */
const apiUrl = import.meta.env.VITE_API_URL;

if (!apiUrl) {
  throw new Error(
    'Thiếu biến môi trường VITE_API_URL. Sao chép web/.env.example thành web/.env.',
  );
}

export const API_URL: string = apiUrl;
