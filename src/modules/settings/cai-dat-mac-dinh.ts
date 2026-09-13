/**
 * Hình dạng và giá trị mặc định của cài đặt hệ thống. FILE THUẦN — không
 * import NestJS, không chạm database — để engine chấm điểm và lịch kỳ (cũng
 * là file thuần) dùng được mà không kéo theo DI.
 *
 * Giá trị mặc định = đúng những hằng số đang chạy trước khi có màn Cài đặt
 * (11/09/2026): bốn mốc 25/25/29/30 (quy-tac-nghiep-vu.md 5.5), ngưỡng xếp
 * loại 80/90/100 (mục 4), khoá tạm 10 lần/15 phút (`LoginAttemptService`).
 * Thiếu dòng trong bảng `SystemSetting` thì hệ thống chạy y như cũ.
 */

/** Bốn mốc trong tháng — ngày trong tháng, 1..31, kẹp về ngày cuối tháng ngắn. */
export interface MocLichKy {
  /** Trưởng bộ phận lên KPI cho THÁNG SAU — hạn `assignDeadline` của kỳ sau. */
  ngayLenKpiThangSau: number;
  /** Nhân viên tự chấm xong — `selfScoreDeadline`. */
  ngayTuCham: number;
  /** Trưởng bộ phận chấm và chốt — `managerScoreDeadline`. */
  ngayTruongCham: number;
  /** Gửi HCNS bản cuối — `submitDeadline`. */
  ngayGuiHcns: number;
}

/**
 * Ngưỡng xếp loại, so sánh LIÊN TỤC trên tổng điểm đã làm tròn 2 chữ số:
 *   tong <  canCaiThien           -> NOT_ACHIEVED
 *   canCaiThien <= tong < hoanThanh -> NEEDS_IMPROVEMENT
 *   hoanThanh <= tong <= vuot     -> COMPLETED
 *   tong >  vuot                  -> EXCEEDED
 */
export interface NguongXepLoai {
  canCaiThien: number;
  hoanThanh: number;
  vuot: number;
}

export interface CaiDatBaoMat {
  /** Tài khoản mới và tài khoản vừa đặt lại mật khẩu phải đổi mật khẩu khi đăng nhập. */
  batBuocDoiMatKhauLanDau: boolean;
  /** Bật khoá tạm theo email khi sai quá nhiều lần. */
  khoaTamKhiSaiNhieu: boolean;
  /** Sai QUÁ số này trong cửa sổ thì khoá. */
  soLanSaiToiDa: number;
  /** Cửa sổ đếm và thời gian khoá, tính bằng phút. */
  phutKhoaTam: number;
}

export interface CaiDatKyDanhGia {
  /** Tự sinh kỳ tháng hiện tại + tháng kế tiếp (lúc khởi động và 01:00 mỗi ngày). */
  tuSinhHangThang: boolean;
}

export interface CaiDatChamDiem {
  /**
   * Cho phép TRẢ LẠI phiếu đã chốt điểm (MANAGER_SCORED) hoặc đã HCNS tiếp
   * nhận (RECEIVED) để chấm lại. Vẫn đi qua `reject` và để lại
   * `ScorecardEvent` — KHÔNG có đường ghi đè điểm trực tiếp, và kỳ đã khoá
   * sổ vẫn không đụng được.
   */
  choPhepTraLaiPhieuDaChot: boolean;
}

/**
 * Tỉ lệ trọng số hai mục của một phiếu — chốt 13/09/2026: KHÔNG bó cứng
 * 70/30 nữa, HCNS/ADMIN đặt được, miễn cộng đúng 100. Mẫu chức danh phải
 * đủ `bscWork`, mẫu hệ thống đủ `compliance`, phiếu ghép hai mục đủ 100.
 */
export interface TrongSoHaiMuc {
  bscWork: number;
  compliance: number;
}

export interface CaiDatHeThong {
  trongSo: TrongSoHaiMuc;
  lichKy: MocLichKy;
  nguongXepLoai: NguongXepLoai;
  baoMat: CaiDatBaoMat;
  kyDanhGia: CaiDatKyDanhGia;
  chamDiem: CaiDatChamDiem;
}

export type NhomCaiDat = keyof CaiDatHeThong;

export const CAI_DAT_MAC_DINH: CaiDatHeThong = {
  trongSo: { bscWork: 70, compliance: 30 },
  lichKy: { ngayLenKpiThangSau: 25, ngayTuCham: 25, ngayTruongCham: 29, ngayGuiHcns: 30 },
  nguongXepLoai: { canCaiThien: 80, hoanThanh: 90, vuot: 100 },
  baoMat: {
    batBuocDoiMatKhauLanDau: true,
    khoaTamKhiSaiNhieu: true,
    soLanSaiToiDa: 10,
    phutKhoaTam: 15,
  },
  kyDanhGia: { tuSinhHangThang: true },
  chamDiem: { choPhepTraLaiPhieuDaChot: false },
};

export const CAC_NHOM_CAI_DAT = Object.keys(CAI_DAT_MAC_DINH) as NhomCaiDat[];

/**
 * Kiểm quan hệ giữa các giá trị — DTO chỉ kiểm từng ô (kiểu, khoảng), còn
 * "tự chấm phải trước trưởng chấm" thì phải nhìn cả nhóm.
 * Trả danh sách lỗi tiếng Việt; rỗng là hợp lệ.
 */
export function kiemTraCaiDat(caiDat: CaiDatHeThong): string[] {
  const loi: string[] = [];
  const { lichKy: l, nguongXepLoai: n, baoMat: b, trongSo: t } = caiDat;

  for (const [ten, v] of [
    ['Trọng số mục BSC công việc', t.bscWork],
    ['Trọng số mục Chấp hành nội quy', t.compliance],
  ] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 100) loi.push(`${ten} phải là số nguyên 0–100`);
  }
  if (t.bscWork + t.compliance !== 100) {
    loi.push(`Hai mục phải cộng đúng 100 (đang ${t.bscWork} + ${t.compliance} = ${t.bscWork + t.compliance})`);
  }

  const ngay = (ten: string, v: number) => {
    if (!Number.isInteger(v) || v < 1 || v > 31) loi.push(`${ten} phải là ngày từ 1 đến 31`);
  };
  ngay('Ngày lên KPI tháng sau', l.ngayLenKpiThangSau);
  ngay('Ngày nhân viên tự chấm', l.ngayTuCham);
  ngay('Ngày trưởng bộ phận chấm', l.ngayTruongCham);
  ngay('Ngày gửi hành chính', l.ngayGuiHcns);
  if (l.ngayTuCham > l.ngayTruongCham) {
    loi.push('Nhân viên phải tự chấm xong TRƯỚC hoặc cùng ngày trưởng bộ phận chấm');
  }
  if (l.ngayTruongCham > l.ngayGuiHcns) {
    loi.push('Trưởng bộ phận phải chấm xong TRƯỚC hoặc cùng ngày gửi hành chính');
  }

  for (const [ten, v] of [
    ['Ngưỡng cần cải thiện', n.canCaiThien],
    ['Ngưỡng hoàn thành', n.hoanThanh],
    ['Ngưỡng vượt chỉ tiêu', n.vuot],
  ] as const) {
    if (!Number.isFinite(v) || v < 0 || v > 200) loi.push(`${ten} phải nằm trong 0–200`);
  }
  if (!(n.canCaiThien < n.hoanThanh && n.hoanThanh <= n.vuot)) {
    loi.push('Ngưỡng phải tăng dần: cần cải thiện < hoàn thành ≤ vượt chỉ tiêu');
  }

  if (!Number.isInteger(b.soLanSaiToiDa) || b.soLanSaiToiDa < 3 || b.soLanSaiToiDa > 100) {
    loi.push('Số lần sai tối đa phải từ 3 đến 100');
  }
  if (!Number.isInteger(b.phutKhoaTam) || b.phutKhoaTam < 1 || b.phutKhoaTam > 1440) {
    loi.push('Thời gian khoá tạm phải từ 1 đến 1440 phút');
  }
  return loi;
}
