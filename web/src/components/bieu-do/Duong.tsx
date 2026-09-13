import { useState } from 'react';
import { TooltipBieuDo } from './Tooltip';

export interface DiemDuong {
  nhan: string;
  /** `null` = không có số (kỳ chưa có phiếu chốt) — đường bị ngắt ở đó. */
  giaTri: number | null;
  phu?: string;
}

interface Props {
  diem: DiemDuong[];
  mau?: string;
  /** Trục y cố định (ví dụ 0–100 cho điểm). Bỏ trống thì lấy theo dữ liệu. */
  yMin?: number;
  yMax?: number;
  donVi?: string;
  /** Vạch ngang tham chiếu. */
  vach?: { giaTri: number; nhan: string }[];
  /** Chiều cao (px) — mặc định 220; tăng khi thẻ chứa nó cao hơn. */
  cao?: number;
}

/**
 * Đường một chuỗi theo thời gian. Đường 2px, chấm r=5 có viền nền 2px, lưới
 * hairline, nhãn giá trị chỉ ở điểm cuối, crosshair + tooltip khi rê chuột.
 */
export function Duong({
  diem,
  mau = '#0987b1',
  yMin,
  yMax,
  donVi = '',
  vach = [],
  cao = 220,
}: Props) {
  const [hover, setHover] = useState<{
    i: number;
    x: number;
    y: number;
  } | null>(null);
  const rong = 600;
  const le = { trai: 44, phai: 20, tren: 16, duoi: 30 };
  const coSo = diem.map((d) => d.giaTri).filter((v): v is number => v !== null);
  const min = yMin ?? Math.floor(Math.min(0, ...coSo));
  const max = yMax ?? Math.ceil(Math.max(1, ...coSo) * 1.1);
  const w = rong - le.trai - le.phai;
  const h = cao - le.tren - le.duoi;
  const px = (i: number) =>
    le.trai + (diem.length === 1 ? w / 2 : (i / (diem.length - 1)) * w);
  const py = (v: number) => le.tren + h - ((v - min) / (max - min)) * h;

  // Nối các đoạn liên tiếp có số; null thì ngắt
  const cacDoan: string[] = [];
  let doan: string[] = [];
  diem.forEach((d, i) => {
    if (d.giaTri === null) {
      if (doan.length) cacDoan.push(doan.join(' '));
      doan = [];
      return;
    }
    doan.push(`${doan.length ? 'L' : 'M'}${px(i)},${py(d.giaTri)}`);
  });
  if (doan.length) cacDoan.push(doan.join(' '));

  const cuoi = [...diem].reverse().find((d) => d.giaTri !== null);
  const iCuoi = cuoi ? diem.lastIndexOf(cuoi) : -1;
  const buocY = 4;

  return (
    <div className="bd-khung" onMouseLeave={() => setHover(null)}>
      <svg
        viewBox={`0 0 ${rong} ${cao}`}
        width="100%"
        height={cao}
        role="img"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const xSvg = ((e.clientX - r.left) / r.width) * rong;
          let gan = 0;
          diem.forEach((_, i) => {
            if (Math.abs(px(i) - xSvg) < Math.abs(px(gan) - xSvg)) gan = i;
          });
          setHover({ i: gan, x: e.clientX - r.left, y: e.clientY - r.top });
        }}
      >
        {Array.from({ length: buocY + 1 }, (_, k) => {
          const v = min + ((max - min) * k) / buocY;
          return (
            <g key={k}>
              <line
                x1={le.trai}
                x2={rong - le.phai}
                y1={py(v)}
                y2={py(v)}
                className="bd-luoi"
              />
              <text
                x={le.trai - 8}
                y={py(v)}
                className="bd-chu-nho"
                textAnchor="end"
                dominantBaseline="middle"
              >
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        {vach.map((v) => (
          <g key={v.nhan}>
            <line
              x1={le.trai}
              x2={rong - le.phai}
              y1={py(v.giaTri)}
              y2={py(v.giaTri)}
              className="bd-vach"
            />
            <text
              x={rong - le.phai}
              y={py(v.giaTri) - 4}
              className="bd-chu-nho"
              textAnchor="end"
            >
              {v.nhan}
            </text>
          </g>
        ))}
        {diem.map((d, i) => (
          <text
            key={d.nhan}
            x={px(i)}
            y={cao - 8}
            className="bd-chu-nho"
            textAnchor="middle"
          >
            {d.nhan}
          </text>
        ))}
        {hover && (
          <line
            x1={px(hover.i)}
            x2={px(hover.i)}
            y1={le.tren}
            y2={le.tren + h}
            className="bd-crosshair"
          />
        )}
        {cacDoan.map((d, k) => (
          <path
            key={k}
            d={d}
            fill="none"
            stroke={mau}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {diem.map(
          (d, i) =>
            d.giaTri !== null && (
              <circle
                key={d.nhan}
                cx={px(i)}
                cy={py(d.giaTri)}
                r={hover?.i === i ? 6 : 5}
                fill={mau}
                className="bd-cham"
              />
            ),
        )}
        {cuoi && cuoi.giaTri !== null && (
          <text
            x={px(iCuoi)}
            y={py(cuoi.giaTri) - 12}
            className="bd-chu bd-dam"
            textAnchor="middle"
          >
            {cuoi.giaTri.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}
            {donVi}
          </text>
        )}
      </svg>
      {hover && diem[hover.i] && (
        <TooltipBieuDo x={hover.x} y={hover.y}>
          <strong>{diem[hover.i]!.nhan}</strong>
          <div>
            {diem[hover.i]!.giaTri === null
              ? 'Chưa có phiếu chốt'
              : `${diem[hover.i]!.giaTri!.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}${donVi}`}
          </div>
          {diem[hover.i]!.phu && (
            <div className="bd-tooltip-phu">{diem[hover.i]!.phu}</div>
          )}
        </TooltipBieuDo>
      )}
    </div>
  );
}
