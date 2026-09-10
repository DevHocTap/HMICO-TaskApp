import { apiClient } from './client';
import type { BaoCaoTienDo } from '../types/report';

export async function layTienDoNop(periodId: string): Promise<BaoCaoTienDo> {
  const { data } = await apiClient.get<BaoCaoTienDo>('/reports/submission-progress', {
    params: { periodId },
  });
  return data;
}
