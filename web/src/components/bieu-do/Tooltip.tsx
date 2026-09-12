import type { ReactNode } from 'react';

/** Hộp chú thích nhỏ đi theo con trỏ — vị trí tính theo khung của biểu đồ. */
export function TooltipBieuDo({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <div className="bd-tooltip" style={{ left: x, top: y }}>
      {children}
    </div>
  );
}
