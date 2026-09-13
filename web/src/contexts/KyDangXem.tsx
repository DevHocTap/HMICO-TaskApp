import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { layKyDanhGia } from '../api/scorecard';
import type { KyDanhGia } from '../types/scorecard';
import { kyChuaHomNay } from '../utils/period';

interface GiaTri {
  /** Toàn bộ kỳ THÁNG, mới nhất trước. */
  cacKy: KyDanhGia[];
  /** Kỳ đang xem — mặc định kỳ chứa hôm nay, đổi bằng ô chọn ở header. */
  ky: KyDanhGia | undefined;
  datKyId: (id: string) => void;
}

const KyDangXemContext = createContext<GiaTri>({
  cacKy: [],
  ky: undefined,
  datKyId: () => {},
});

/**
 * Kỳ đang xem dùng chung giữa header (ô chọn "Kỳ:") và Tổng quan — mẫu 13/09
 * đặt ô chọn kỳ ở thanh trên chứ không ở trong trang.
 */
export function KyDangXemProvider({ children }: { children: ReactNode }) {
  const { data: cacKy = [] } = useQuery({
    queryKey: ['periods', 'MONTH'],
    queryFn: () => layKyDanhGia('MONTH'),
    staleTime: 5 * 60 * 1000,
  });
  const [kyIdChon, setKyIdChon] = useState<string | undefined>();
  const ky =
    (kyIdChon ? cacKy.find((k) => k.id === kyIdChon) : undefined) ??
    kyChuaHomNay(cacKy) ??
    cacKy[0];
  return (
    <KyDangXemContext.Provider value={{ cacKy, ky, datKyId: setKyIdChon }}>
      {children}
    </KyDangXemContext.Provider>
  );
}

export function useKyDangXem(): GiaTri {
  return useContext(KyDangXemContext);
}
