import type { ReactNode } from 'react';
import { Typography } from 'antd';
import { mauChuDao, mauNhan, mauXanhLa } from '../config/theme';

export interface TheSoLieuProps {
  nhan: string;
  /** Con số lớn — đã định dạng sẵn. */
  so: string | number;
  /** "/200", "điểm", "%" — in nhỏ cạnh số. */
  donVi?: ReactNode;
  /** 0–100 cho thanh tiến độ; bỏ qua thì thanh đầy. */
  phanTram?: number;
  /** Dòng chú thích dưới thanh. */
  chuThich?: ReactNode;
  /** Tô hồng khi con số là thứ cần chú ý (thiếu, chậm, dưới ngưỡng). */
  canChuY?: boolean;
  /** Icon góc phải (theo bộ mẫu 12/09). */
  icon?: ReactNode;
  /** Chưa có số để hiện (khác với số 0): số và thanh in xám. */
  khongCoSo?: boolean;
  /** Việc đã hoàn tất: số và thanh xanh lá. */
  daXong?: boolean;
  /** Dòng "so với tháng trước" — in giữa số và thanh. */
  soSanh?: ReactNode;
  /** Khối bên phải con số (vòng tiến độ) — có thì ẩn thanh ngang. */
  phai?: ReactNode;
}

/**
 * Thẻ một con số trên trang chủ: nhãn, số lớn, thanh, chú thích.
 *
 * Màu KHÔNG tự suy từ con số — mỗi thẻ tự quyết `canChuY`, vì "7/14 đã chốt"
 * là bình thường giữa tháng nhưng "2 phòng dưới 80" thì luôn đáng chú ý.
 */
export function TheSoLieu({
  nhan,
  so,
  donVi,
  phanTram = 100,
  chuThich,
  canChuY,
  icon,
  soSanh,
  khongCoSo,
  daXong,
  phai,
}: TheSoLieuProps) {
  const mau = khongCoSo
    ? '#9ca3af'
    : canChuY
      ? mauNhan
      : daXong
        ? mauXanhLa
        : mauChuDao;
  return (
    <div className={`the-so-lieu${canChuY ? ' the-so-lieu-chu-y' : ''}`}>
      <div className="the-so-lieu-dau">
        <Typography.Text type="secondary" className="eyebrow">
          {nhan}
        </Typography.Text>
        {icon && (
          <span className="the-so-lieu-icon" style={{ color: mau }}>
            {icon}
          </span>
        )}
      </div>
      <div className="the-so-lieu-than">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="the-so-lieu-so" style={{ color: mau }}>
            {so}
            {donVi && <span className="the-so-lieu-don-vi">{donVi}</span>}
          </div>
          {soSanh && <div className="the-so-lieu-so-sanh">{soSanh}</div>}
        </div>
        {phai && <div className="the-so-lieu-phai">{phai}</div>}
      </div>
      {!phai && (
        <div className="the-so-lieu-thanh">
          <span
            style={{
              width: `${Math.max(0, Math.min(100, phanTram))}%`,
              background: mau,
            }}
          />
        </div>
      )}
      {chuThich && (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {chuThich}
        </Typography.Text>
      )}
    </div>
  );
}
