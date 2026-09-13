import { useEffect, useRef, useState } from 'react';
import { TooltipBieuDo } from './Tooltip';

export interface DiemDuongVung {
  nhan: string;
  giaTri: number | null;
  phu?: string;
}

interface Props {
  diem: DiemDuongVung[];
  mau: string;
  /** Vạch chỉ tiêu nằm ngang, nét đứt. */
  chiTieu: { giaTri: number; mau: string };
  cao?: number;
}

/**
 * Đường có vùng tô nhạt bên dưới + vạch chỉ tiêu nét đứt, đúng SVG trong mẫu
 * bảng điều hành 13/09: điểm đầu và cuối chạm hai mép, lưới ngang nét đứt,
 * nhãn tháng do trang vẽ bên dưới (hàng chữ, không nằm trong SVG).
 */
export function DuongVung({ diem, mau, chiTieu, cao: caoMacDinh = 150 }: Props) {
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  // viewBox rộng đúng bằng khung thật (đo bằng ResizeObserver) để không phải
  // kéo giãn SVG — kéo giãn là chấm tròn thành bầu dục trên màn rộng (13/09).
  const khung = useRef<HTMLDivElement>(null);
  const [rong, setRong] = useState(540);
  const [cao, setCao] = useState(caoMacDinh);
  useEffect(() => {
    const el = khung.current;
    if (!el) return;
    const capNhat = () => {
      setRong(Math.max(200, Math.round(el.clientWidth)));
      setCao(Math.max(120, Math.round(el.clientHeight) || caoMacDinh));
    };
    capNhat();
    const ro = new ResizeObserver(capNhat);
    ro.observe(el);
    return () => ro.disconnect();
  }, [caoMacDinh]);
  const day = cao - 25; // đường đáy lưới
  const coSo = diem.map((d) => d.giaTri).filter((v): v is number => v !== null);
  const min = Math.max(0, Math.floor((Math.min(chiTieu.giaTri, ...coSo) - 15) / 10) * 10);
  const max = Math.min(120, Math.ceil((Math.max(chiTieu.giaTri, ...coSo) + 8) / 10) * 10);
  const px = (i: number) => (diem.length === 1 ? rong / 2 : (i / (diem.length - 1)) * rong);
  const py = (v: number) => 10 + (day - 10) - ((v - min) / (max - min || 1)) * (day - 10);

  // Các đoạn liên tục có số; mỗi đoạn kèm vùng tô xuống đáy
  const doan: { duong: string; vung: string }[] = [];
  let hienTai: number[] = [];
  const dong = () => {
    if (hienTai.length === 0) return;
    const toaDo = hienTai.map((i) => `${px(i)},${py(diem[i]!.giaTri!)}`);
    doan.push({
      duong: toaDo.join(' '),
      vung: `${px(hienTai[0]!)},${day} ${toaDo.join(' ')} ${px(hienTai[hienTai.length - 1]!)},${day}`,
    });
    hienTai = [];
  };
  diem.forEach((d, i) => (d.giaTri === null ? dong() : hienTai.push(i)));
  dong();

  return (
    <div className="tq-bd" style={{ position: 'relative' }} ref={khung}>
      <svg
        viewBox={`0 0 ${rong} ${cao}`}
        width={rong}
        height={cao}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={diem.map((d) => `${d.nhan}: ${d.giaTri ?? 'không có'}`).join(', ')}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const hop = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - hop.left) / hop.width) * rong;
          let gan = 0;
          diem.forEach((_, i) => {
            if (Math.abs(px(i) - x) < Math.abs(px(gan) - x)) gan = i;
          });
          setHover({ i: gan, x: e.clientX - hop.left, y: e.clientY - hop.top });
        }}
      >
        <defs>
          <linearGradient id="tq-vung" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.15, 0.4, 0.65].map((t) => (
          <line key={t} x1={0} x2={rong} y1={day * t} y2={day * t} stroke="#e2e8f0" strokeDasharray="3,3" />
        ))}
        <line x1={0} x2={rong} y1={day} y2={day} stroke="#e2e8f0" />
        <line
          x1={0}
          x2={rong}
          y1={py(chiTieu.giaTri)}
          y2={py(chiTieu.giaTri)}
          stroke={chiTieu.mau}
          strokeWidth={1.5}
          strokeDasharray="4,4"
        />
        {doan.map((d, k) => (
          <polygon key={`v${k}`} points={d.vung} fill="url(#tq-vung)" />
        ))}
        {doan.map((d, k) => (
          <polyline
            key={`d${k}`}
            points={d.duong}
            fill="none"
            stroke={mau}
            strokeWidth={3}
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
                r={i === diem.length - 1 || hover?.i === i ? 5 : 4}
                fill={mau}
                stroke="#fff"
                strokeWidth={2}
              />
            ),
        )}
      </svg>
      {hover && diem[hover.i] && (
        <TooltipBieuDo x={hover.x} y={hover.y}>
          <strong>{diem[hover.i]!.nhan}</strong>
          <div>
            {diem[hover.i]!.giaTri === null
              ? 'Chưa có phiếu chốt'
              : `${diem[hover.i]!.giaTri!.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} điểm`}
          </div>
          {diem[hover.i]!.phu && <div className="bd-tooltip-phu">{diem[hover.i]!.phu}</div>}
        </TooltipBieuDo>
      )}
    </div>
  );
}
