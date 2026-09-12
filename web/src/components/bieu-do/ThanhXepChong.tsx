import { useState } from 'react';
import { TooltipBieuDo } from './Tooltip';

export interface DoanXepChong {
  ten: string;
  giaTri: number;
  mau: string;
}

/**
 * MỘT thanh ngang chia phần — tỉ lệ phiếu theo trạng thái. Các đoạn cách
 * nhau 2px nền; chú giải luôn hiện vì có ≥ 2 phần; số in ở chú giải, không
 * nhồi vào từng đoạn.
 */
export function ThanhXepChong({ doan, tong }: { doan: DoanXepChong[]; tong: number }) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const rong = 600;
  const cao = 28;
  let x = 0;

  return (
    <div className="bd-khung" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${rong} ${cao}`} width="100%" height={cao} role="img">
        {tong === 0 && <rect x={0} y={4} width={rong} height={20} rx={4} className="bd-rong" />}
        {tong > 0 &&
          doan.map((d, i) => {
            const w = (d.giaTri / tong) * rong;
            const x0 = x;
            x += w;
            if (w <= 0) return null;
            return (
              <rect
                key={d.ten}
                x={x0 + 1}
                y={4}
                width={Math.max(w - 2, 0)}
                height={20}
                rx={4}
                fill={d.mau}
                opacity={hover && hover.i !== i ? 0.55 : 1}
                onMouseMove={(e) => {
                  const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                  setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
              />
            );
          })}
      </svg>
      <div className="bd-chu-giai">
        {doan.map((d) => (
          <span key={d.ten} className="bd-chu-giai-muc">
            <i style={{ background: d.mau }} />
            {d.ten} <strong>{d.giaTri}</strong>
          </span>
        ))}
      </div>
      {hover && doan[hover.i] && (
        <TooltipBieuDo x={hover.x} y={hover.y}>
          <strong>{doan[hover.i]!.ten}</strong>
          <div>
            {doan[hover.i]!.giaTri} phiếu · {tong > 0 ? Math.round((doan[hover.i]!.giaTri / tong) * 100) : 0}%
          </div>
        </TooltipBieuDo>
      )}
    </div>
  );
}
