import type { Role } from '../types/auth';

/**
 * Ai thấy màn hình nào, và ai được bấm nút ghi.
 *
 * ẨN MENU VÀ ẨN NÚT KHÔNG PHẢI BẢO MẬT. Backend chặn độc lập bằng
 * RolesGuard và getAccessibleDepartmentIds — gõ thẳng URL hay gọi API trực
 * tiếp đều bị chặn ở đó. Mấy hàm dưới đây chỉ để giao diện không bày ra
 * thứ bấm vào sẽ báo lỗi.
 *
 * Cố ý TÁCH quyền xem khỏi quyền ghi. Gộp làm một là nguyên nhân khiến
 * EXECUTIVE từng không thấy màn quản trị nào, dù backend vẫn cho họ đọc
 * toàn công ty.
 */

/** Ghi được vào module org: tạo, sửa, vô hiệu hoá, đặt lại mật khẩu. */
export function coTheGhiToChuc(role: Role | undefined): boolean {
  return role === 'ADMIN' || role === 'HR';
}

/**
 * Xem được cơ cấu tổ chức (phòng ban, chức danh).
 *
 * EXECUTIVE xem toàn công ty ở MỌI màn hình, kể cả màn quản trị — xem
 * docs/quy-tac-nghiep-vu.md mục 7. Chỉ khác là không ghi được gì.
 */
export function coTheXemToChuc(role: Role | undefined): boolean {
  return coTheGhiToChuc(role) || role === 'EXECUTIVE';
}

/**
 * Xem được danh sách nhân viên.
 *
 * MANAGER cũng xem được, nhưng bị giới hạn trong phạm vi phòng ban của
 * mình — giới hạn đó do backend áp qua getAccessibleDepartmentIds, không
 * phải do giao diện.
 */
export function coTheXemNhanVien(role: Role | undefined): boolean {
  return coTheXemToChuc(role) || role === 'MANAGER';
}

/**
 * Giao KPI cho người khác.
 *
 * STAFF không vào — không ai tự giao KPI cho mình. Ban giám đốc vào được
 * vì họ giao KPI cho trưởng bộ phận (quy tắc nghiệp vụ mục 5.0).
 *
 * CHỈ LÀ GIAO DIỆN. Backend chặn độc lập bằng RolesGuard và
 * getAccessibleDepartmentIds — trưởng phòng R&D vẫn nhận 403 khi cố xem
 * phòng Kỹ thuật, dù có gõ thẳng URL.
 */
export function coTheGiaoKpi(role: Role | undefined): boolean {
  return role === 'ADMIN' || role === 'HR' || role === 'MANAGER' || role === 'EXECUTIVE';
}

/**
 * Chốt sổ kỳ đánh giá — khoá và mở lại.
 *
 * HCNS chốt 03/09/2026 (câu A5): chốt sổ là quyết định NGHIỆP VỤ, không
 * phải thao tác kỹ thuật, nên HCNS và ban giám đốc làm được. ADMIN giữ
 * quyền theo câu A4 (tài khoản quản trị có toàn quyền).
 */
export function coTheChotSo(role: Role | undefined): boolean {
  return role === 'ADMIN' || role === 'HR' || role === 'EXECUTIVE';
}

/**
 * Tạo kỳ đánh giá thủ công.
 *
 * Kỳ tháng do tác vụ định kỳ tự sinh; đường tạo tay chỉ dùng khi cần một
 * kỳ quá khứ mà tác vụ cố ý không bù. Ban giám đốc KHÔNG tạo kỳ — dựng kỳ
 * là việc vận hành, khác với chốt sổ.
 */
export function coTheTaoKy(role: Role | undefined): boolean {
  return role === 'ADMIN' || role === 'HR';
}
