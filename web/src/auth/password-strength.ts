export interface PasswordStrength {
  /** 0–4. */
  score: number;
  label: string;
  color: string;
}

const MUC = [
  { label: 'Rất yếu', color: '#ff4d4f' },
  { label: 'Yếu', color: '#ff7a45' },
  { label: 'Trung bình', color: '#faad14' },
  { label: 'Khá', color: '#52c41a' },
  { label: 'Mạnh', color: '#237804' },
];

/**
 * Chấm độ mạnh mật khẩu, tự viết để khỏi kéo thêm thư viện.
 *
 * Chỉ là gợi ý cho người dùng — ràng buộc thật (tối thiểu 8 ký tự) nằm ở
 * backend. Đừng dùng hàm này để chặn gửi biểu mẫu.
 */
export function danhGiaMatKhau(matKhau: string): PasswordStrength {
  if (matKhau.length === 0) {
    return { score: 0, label: '', color: MUC[0].color };
  }

  let diem = 0;
  if (matKhau.length >= 8) diem += 1;
  if (matKhau.length >= 12) diem += 1;
  if (/[a-z]/.test(matKhau) && /[A-Z]/.test(matKhau)) diem += 1;
  if (/\d/.test(matKhau)) diem += 1;
  if (/[^A-Za-z0-9]/.test(matKhau)) diem += 1;

  // Ngắn hơn 8 ký tự thì dù có đủ loại ký tự vẫn là yếu
  if (matKhau.length < 8) diem = Math.min(diem, 1);

  const score = Math.min(diem, 4);
  return { score, label: MUC[score].label, color: MUC[score].color };
}
