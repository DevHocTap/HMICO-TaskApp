import { useState } from 'react';
import { TooltipBieuDo } from './Tooltip';

export interface ThanhNgangItem {
  ten: string;
  giaTri: number;
  /** Chuỗi in ở đầu thanh; bỏ trống thì in `giaTri`. */
  nhan?: string;
  /** Dòng phụ trong tooltip. */
  phu?: string;
  mau?: string;
}

interface Props {
  items: ThanhNgangItem[];
  /** Trục x tối đa; bỏ trống thì lấy max dữ liệu. */
  toiDa?: number;
  mauMacDinh?: string;
  /** Vạch tham chiếu dọc (ví dụ ngưỡng 80, 90). */
  vach?: { giaTri: number; nhan: string }[];
  /** Độ rộng cột tên (px). */
  rongTen?: number;
}

const CAO_DONG = 34;
const DAY_THANH = 20;

/**
 * Thanh ngang so sánh độ lớn. Thanh ≤ 24px, đầu bo 4px, gốc vuông; nhãn số
 * ở đầu thanh; lưới hairline; tooltip khi rê chuột.
 */
export function ThanhNgang({ items, toiDa, mauMacDinh = '#0987b1', vach = [], rongTen = 180 }: Props) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const max = toiDa ?? Math.max(1, ...items.map((d) => d.giaTri));
  const rong = 600;
  const rongVe = rong - rongTen - 56;
  const cao = items.length * CAO_DONG + 8;
  const x = (v: number) => rongTen + (Math.max(0, Math.min(v, max)) / max) * rongVe;

  return (
    <div className="bd-khung" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${rong} ${cao}`} width="100%" height={cao} role="img">
        {/* Lưới: 0, 25, 50, 75, 100 % của trục */}
        {[0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={x(max * t)}
            x2={x(max * t)}
            y1={0}
            y2={cao}
            className="bd-luoi"
          />
        ))}
        {vach.map((v) => (
          <g key={v.nhan}>
            <line x1={x(v.giaTri)} x2={x(v.giaTri)} y1={0} y2={cao} className="bd-vach" />
            <text x={x(v.giaTri) + 4} y={cao - 2} className="bd-chu-nho">
              {v.nhan}
            </text>
          </g>
        ))}
        {items.map((d, i) => {
          const y = 4 + i * CAO_DONG;
          const w = Math.max(0, x(d.giaTri) - rongTen);
          const mau = d.mau ?? mauMacDinh;
          return (
            <g
              key={d.ten}
              onMouseMove={(e) => {
                const r = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                setHover({ i, x: e.clientX - r.left, y: e.clientY - r.top });
              }}
            >
              {/* Vùng bắt chuột rộng hơn thanh */}
              <rect x={0} y={y} width={rong} height={CAO_DONG} fill="transparent" />
              <text x={rongTen - 10} y={y + CAO_DONG / 2} className="bd-chu" textAnchor="end" dominantBaseline="middle">
                {d.ten.length > 26 ? `${d.ten.slice(0, 25)}…` : d.ten}
              </text>
              {w > 0 && (
                <path
                  d={`M${rongTen},${y + (CAO_DONG - DAY_THANH) / 2} h${Math.max(w - 4, 0)} a4,4 0 0 1 4,4 v${DAY_THANH - 8} a4,4 0 0 1 -4,4 h-${Math.max(w - 4, 0)} z`}
                  fill={mau}
                  opacity={hover && hover.i !== i ? 0.55 : 1}
                />
              )}
              <text x={rongTen + w + 8} y={y + CAO_DONG / 2} className="bd-chu bd-dam" dominantBaseline="middle">
                {d.nhan ?? d.giaTri}
              </text>
            </g>
          );
        })}
      </svg>
      {hover && items[hover.i] && (
        <TooltipBieuDo x={hover.x} y={hover.y}>
          <strong>{items[hover.i]!.ten}</strong>
          <div>{items[hover.i]!.nhan ?? items[hover.i]!.giaTri}</div>
          {items[hover.i]!.phu && <div className="bd-tooltip-phu">{items[hover.i]!.phu}</div>}
        </TooltipBieuDo>
      )}
    </div>
  );
}
