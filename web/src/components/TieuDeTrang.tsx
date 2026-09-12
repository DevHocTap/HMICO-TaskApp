import type { ReactNode } from 'react';
import { Typography } from 'antd';

interface TieuDeTrangProps {
  tieuDe: ReactNode;
  /** Câu dẫn nhỏ dưới tiêu đề. */
  moTa?: ReactNode;
  /** Nút, bộ chọn… xếp bên phải, tự xuống dòng khi hẹp. */
  phai?: ReactNode;
  /** Dòng chữ hoa nhỏ phía trên tiêu đề (tuỳ chọn). */
  eyebrow?: ReactNode;
  /** Nút "Quay lại" hay tương tự, đứng trước tiêu đề. */
  truoc?: ReactNode;
}

/** Đầu trang thống nhất cho mọi màn sau đăng nhập — cùng bố cục với trang chủ. */
export function TieuDeTrang({ tieuDe, moTa, phai, eyebrow, truoc }: TieuDeTrangProps) {
  return (
    <header className="tieu-de-trang">
      {truoc}
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <Typography.Text className="eyebrow">{eyebrow}</Typography.Text>}
        <Typography.Title level={2} style={{ margin: eyebrow ? '4px 0 4px' : '0 0 4px' }}>
          {tieuDe}
        </Typography.Title>
        {moTa && (
          <Typography.Text type="secondary" style={{ fontSize: 15 }}>
            {moTa}
          </Typography.Text>
        )}
      </div>
      {phai && <div className="tieu-de-trang-phai">{phai}</div>}
    </header>
  );
}
