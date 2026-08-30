import { KpiSection } from '@prisma/client';

/**
 * Thang điểm tối đa của mỗi mục, theo biểu mẫu KPI thật của công ty.
 *
 * VÌ SAO LÀ HẰNG SỐ TRONG CODE, KHÔNG PHẢI CỘT TRONG BẢNG:
 *
 * `maxScale` là hàm của `section` — biết section là biết thang điểm. Nếu
 * để thành cột thì database cho phép tồn tại dữ liệu vô nghĩa
 * (`section = COMPLIANCE` nhưng `maxScale = 10`), và kéo theo một ràng
 * buộc nữa phải tự kiểm: tiêu chí cha và KPI con phải cùng thang. Bỏ cột
 * đi là bỏ luôn cả hai chỗ dễ sai.
 *
 * LÁT CẮT SAU: `ScorecardItem` sẽ CHỤP LẠI giá trị này vào từng dòng phiếu.
 * Nếu công ty đổi thang điểm sang 100 vào năm sau, phiếu cũ vẫn giữ nguyên
 * thang 10 — điểm đã chấm không được đổi nghĩa.
 */
export const MAX_SCALE: Record<KpiSection, number> = {
  [KpiSection.BSC_WORK]: 10,
  [KpiSection.COMPLIANCE]: 3,
};

/**
 * Tổng trọng số bắt buộc của tiêu chí cấp 1 trong mỗi mục.
 *
 * Kiểm theo LOẠI MẪU chứ không phải cho mọi mẫu (xem
 * docs/quy-tac-nghiep-vu.md mục 2):
 *   - mẫu chức danh  (isSystem = false) chỉ chứa BSC_WORK, tổng 70
 *   - mẫu hệ thống   (isSystem = true)  chỉ chứa COMPLIANCE, tổng 30
 *
 * Ràng buộc "tổng phiếu = 100" thuộc về lúc GHÉP hai mẫu thành phiếu
 * (lát cắt sau), không phải lúc xuất bản từng mẫu.
 */
export const TONG_TRONG_SO: Record<KpiSection, number> = {
  [KpiSection.BSC_WORK]: 70,
  [KpiSection.COMPLIANCE]: 30,
};

/** Tổng trọng số của các KPI con trong một tiêu chí cha. */
export const TONG_TRONG_SO_CON = 100;

/**
 * Hệ số trần khi chấm vượt thang, chỉ áp cho BSC_WORK.
 *
 * COMPLIANCE trần đúng bằng thang: không ai "vượt chỉ tiêu" ở khoản chấp
 * hành nội quy (docs mục 3).
 */
export const HE_SO_VUOT_THANG = 1.2;

/** Thang điểm tối đa cho phép nhập, đã tính cả phần vượt thang. */
export function tranDiem(section: KpiSection): number {
  const thang = MAX_SCALE[section];
  return section === KpiSection.BSC_WORK ? thang * HE_SO_VUOT_THANG : thang;
}
