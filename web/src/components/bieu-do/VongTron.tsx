import { useState } from 'react';
import { TooltipBieuDo } from './Tooltip';

export interface DoanVong {
  ten: string;
  giaTri: number;
  mau: string;
}

interface Props {
  doan: DoanVong[];
  /** Số in giữa vòng — thường là tổng. */
  soGiua: string | number;
  nhanGiua?: string;
  kichThuoc?: number;
  /** Độ dày vành, px. */
  day?: number;
}

/**
 * Biểu đồ vành khuyên (donut) vẽ tay bằng SVG — không thêm thư viện.
 *
 * Mỗi phần là một cung `stroke-dasharray` trên cùng một vòng tròn, xoay
 * -90° để bắt đầu từ đỉnh. Phần 0 không vẽ (cung rỗng vẫn ăn tooltip).
 */
export function VongTron({
  doan,
  soGiua,
  nhanGiua,
  kichThuoc = 150,
  day = 18,
}: Props) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const tong = doan.reduce((a, d) => a + d.giaTri, 0);
  const r = (kichThuoc - day) / 2;
  const chuVi = 2 * Math.PI * r;
  const tam = kichThuoc / 2;
  let daQua = 0;

  return (
    <div style={{ position: 'relative', width: kichThuoc, height: kichThuoc }}>
      <svg
        width={kichThuoc}
        height={kichThuoc}
        viewBox={`0 0 ${kichThuoc} ${kichThuoc}`}
        role="img"
        aria-label={doan.map((d) => `${d.ten} ${d.giaTri}`).join(', ')}
      >
        <circle cx={tam} cy={tam} r={r} fill="none" stroke="#e5e7eb" strokeWidth={day} />
        {tong > 0 &&
          doan.map((d, i) => {
            if (d.giaTri === 0) return null;
            const doDai = (d.giaTri / tong) * chuVi;
            const lech = daQua;
            daQua += doDai;
            return (
              <circle
                key={d.ten}
                cx={tam}
                cy={tam}
                r={r}
                fill="none"
                stroke={d.mau}
                strokeWidth={hover?.i === i ? day + 4 : day}
                strokeDasharray={`${doDai} ${chuVi - doDai}`}
                strokeDashoffset={-lech}
                transform={`rotate(-90 ${tam} ${tam})`}
                style={{ transition: 'stroke-width 120ms' }}
                onMouseMove={(e) => {
                  const hop = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                  setHover({ i, x: e.clientX - hop.left, y: e.clientY - hop.top });
                }}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        <text
          x={tam}
          y={nhanGiua ? tam - 4 : tam}
          textAnchor="middle"
          dominantBaseline="middle"
          className="bd-chu bd-dam"
          style={{ fontSize: 26 }}
        >
          {soGiua}
        </text>
        {nhanGiua && (
          <text
            x={tam}
            y={tam + 18}
            textAnchor="middle"
            dominantBaseline="middle"
            className="bd-chu-nho"
            style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            {nhanGiua}
          </text>
        )}
      </svg>
      {hover && doan[hover.i] && (
        <TooltipBieuDo x={hover.x} y={hover.y}>
          <strong>{doan[hover.i]!.ten}</strong>
          <div>
            {doan[hover.i]!.giaTri} / {tong}
          </div>
        </TooltipBieuDo>
      )}
    </div>
  );
}

/** Vòng tiến độ nhỏ (một phần) — dùng trong thẻ số liệu. */
export function VongTienDo({
  phanTram,
  mau,
  kichThuoc = 64,
  day = 8,
}: {
  phanTram: number;
  mau: string;
  kichThuoc?: number;
  day?: number;
}) {
  const r = (kichThuoc - day) / 2;
  const chuVi = 2 * Math.PI * r;
  const tam = kichThuoc / 2;
  const pt = Math.max(0, Math.min(100, phanTram));
  return (
    <svg
      width={kichThuoc}
      height={kichThuoc}
      viewBox={`0 0 ${kichThuoc} ${kichThuoc}`}
      role="img"
      aria-label={`${pt}%`}
    >
      <circle cx={tam} cy={tam} r={r} fill="none" stroke="#e5e7eb" strokeWidth={day} />
      <circle
        cx={tam}
        cy={tam}
        r={r}
        fill="none"
        stroke={mau}
        strokeWidth={day}
        strokeLinecap="round"
        strokeDasharray={`${(pt / 100) * chuVi} ${chuVi}`}
        transform={`rotate(-90 ${tam} ${tam})`}
      />
      <text
        x={tam}
        y={tam}
        textAnchor="middle"
        dominantBaseline="middle"
        className="bd-chu bd-dam"
        style={{ fontSize: 13 }}
      >
        {pt}%
      </text>
    </svg>
  );
}
