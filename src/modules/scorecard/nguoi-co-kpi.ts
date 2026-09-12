import { Role } from '@prisma/client';

/**
 * Vai trò KHÔNG có phiếu KPI — chốt 03/09/2026 (câu 0b):
 * - `ADMIN`: tài khoản kỹ thuật, không phải vị trí nhân sự
 * - `EXECUTIVE`: không ai chấm ngược lại ban giám đốc
 *
 * CHỈ chặn việc CÓ phiếu. Ban giám đốc vẫn là NGƯỜI CHẤM của trưởng phòng —
 * hai việc khác nhau, đừng gộp.
 *
 * File thuần, không import NestJS, để `reports/` dùng chung mà không kéo
 * theo service của `scorecard/`.
 */
export const VAI_TRO_KHONG_AP_KPI: Role[] = [Role.ADMIN, Role.EXECUTIVE];

/** Điều kiện Prisma: chỉ nhân sự thật sự được giao KPI. */
export const NGUOI_CO_KPI = {
  isActive: true,
  role: { notIn: VAI_TRO_KHONG_AP_KPI },
} as const;
