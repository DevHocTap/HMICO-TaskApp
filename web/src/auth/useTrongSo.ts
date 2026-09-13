import { useQuery } from '@tanstack/react-query';
import { layCaiDat } from '../api/settings';
import { TONG_TRONG_SO, type KpiSection } from '../types/kpi-template';
import type { CaiDatHeThong } from '../types/settings';

/** Toàn bộ cài đặt hệ thống (cache 5 phút) — `undefined` khi chưa tải xong. */
export function useCaiDat(): CaiDatHeThong | undefined {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: layCaiDat,
    staleTime: 5 * 60 * 1000,
  });
  return data?.caiDat;
}

/**
 * Tỉ lệ trọng số hai mục (BSC / nội quy) từ Cài đặt hệ thống — chốt 13/09:
 * không bó cứng 70/30. Trong lúc chưa tải xong dùng mặc định trong mã, cùng
 * giá trị với backend nên không có khoảnh khắc hiện số sai.
 */
export function useTrongSo(): Record<KpiSection, number> {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: layCaiDat,
    staleTime: 5 * 60 * 1000,
  });
  const t = data?.caiDat.trongSo;
  return t ? { BSC_WORK: t.bscWork, COMPLIANCE: t.compliance } : TONG_TRONG_SO;
}
