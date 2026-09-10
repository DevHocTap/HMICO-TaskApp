import { Injectable } from '@nestjs/common';
import { Grade, Prisma, ResultStatus, type Period } from '@prisma/client';
import ExcelJS from 'exceljs';

/** Nhãn tiếng Việt của xếp loại. File cho người đọc, không phải cho máy. */
export const NHAN_XEP_LOAI: Record<Grade, string> = {
  [Grade.NOT_ACHIEVED]: 'Chưa đạt',
  [Grade.NEEDS_IMPROVEMENT]: 'Cần cải thiện',
  [Grade.COMPLETED]: 'Hoàn thành',
  [Grade.EXCEEDED]: 'Vượt chỉ tiêu',
};

export const NHAN_TRANG_THAI: Record<ResultStatus, string> = {
  [ResultStatus.PENDING]: 'Chưa chấm',
  [ResultStatus.SELF_SCORED]: 'Đã tự chấm, chờ QL',
  [ResultStatus.MANAGER_SCORED]: 'Đã chốt điểm',
  [ResultStatus.REJECTED]: 'Bị trả lại',
  [ResultStatus.RECEIVED]: 'HCNS đã tiếp nhận',
};

export const CHUA_CO_PHIEU = 'Chưa có phiếu';

/** Một người trong bảng tổng hợp. Người chưa có phiếu vẫn có dòng. */
export interface DongXuat {
  employeeCode: string;
  fullName: string;
  departmentName: string;
  jobTitleName: string | null;
  resultStatus: ResultStatus | null;
  selfTotalScore: Prisma.Decimal | null;
  managerTotalScore: Prisma.Decimal | null;
  grade: Grade | null;
  evaluatorName: string | null;
  managerScoredAt: Date | null;
  receivedAt: Date | null;
  noSelfScoreReason: string | null;
}

const CAC_COT: { header: string; width: number }[] = [
  { header: 'Mã NV', width: 12 },
  { header: 'Họ tên', width: 26 },
  { header: 'Phòng ban', width: 24 },
  { header: 'Chức danh', width: 24 },
  { header: 'Kỳ', width: 14 },
  { header: 'Tổng điểm tự chấm', width: 18 },
  { header: 'Tổng điểm QL đánh giá', width: 20 },
  { header: 'Xếp loại', width: 16 },
  { header: 'Trạng thái', width: 22 },
  { header: 'Người chấm', width: 24 },
  { header: 'Ngày QL chấm', width: 16 },
  { header: 'Ngày HCNS tiếp nhận', width: 18 },
  { header: 'Lý do không tự chấm', width: 34 },
];

/** Vị trí hai cột điểm (1-based) — dùng để đặt định dạng số. */
const COT_DIEM_TU_CHAM = 6;
const COT_DIEM_QL = 7;

const DINH_DANG_NGAY: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Ho_Chi_Minh',
};

@Injectable()
export class ExportExcelService {
  /**
   * Dựng file .xlsx tổng hợp một kỳ, mỗi người một dòng.
   *
   * ĐIỂM GHI VÀO Ô DƯỚI DẠNG SỐ, không phải chuỗi. Đây là toàn bộ lý do
   * HCNS cần file này: ghi chuỗi thì họ không cộng, không lọc, không dựng
   * pivot được, và file chỉ còn là ảnh chụp màn hình dạng bảng.
   */
  async buildWorkbook(ky: Period, dongs: readonly DongXuat[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Phần mềm KPI HMICO';
    wb.created = new Date();

    const ws = wb.addWorksheet('Tổng hợp KPI', {
      // Đóng băng dòng tiêu đề: bảng 200 dòng mà cuộn xuống mất tiêu đề thì
      // không ai biết cột thứ bảy là điểm gì.
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = CAC_COT.map((c) => ({ header: c.header, width: c.width }));
    ws.getRow(1).font = { bold: true };

    for (const d of dongs) {
      ws.addRow([
        d.employeeCode,
        d.fullName,
        d.departmentName,
        d.jobTitleName ?? '',
        ky.name,
        this.sangSo(d.selfTotalScore),
        this.sangSo(d.managerTotalScore),
        d.grade ? NHAN_XEP_LOAI[d.grade] : '',
        d.resultStatus ? NHAN_TRANG_THAI[d.resultStatus] : CHUA_CO_PHIEU,
        d.evaluatorName ?? '',
        this.ngayVN(d.managerScoredAt),
        this.ngayVN(d.receivedAt),
        d.noSelfScoreReason ?? '',
      ]);
    }

    // Định dạng hai cột điểm. Đặt cho CẢ cột kể cả dòng trống: người dùng gõ
    // thêm điểm vào file cũng ra đúng hai chữ số thập phân.
    for (const viTri of [COT_DIEM_TU_CHAM, COT_DIEM_QL]) {
      const cot = ws.getColumn(viTri);
      cot.numFmt = '0.00';
      cot.alignment = { horizontal: 'right' };
    }

    // Bật bộ lọc trên dòng tiêu đề — rẻ, và là lý do người ta mở file bằng
    // Excel thay vì đọc trên màn hình.
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: CAC_COT.length },
    };

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  /**
   * `Decimal` -> số của Excel.
   *
   * Qua `.toFixed(2)` rồi `Number()`, KHÔNG ép thẳng `Number(decimal)`:
   * `Decimal` của Prisma là object, ép thẳng đi qua `valueOf()` và có thể
   * ra chuỗi hoặc `NaN` tuỳ phiên bản. Số trong ô Excel mà là `NaN` thì cả
   * cột hỏng.
   *
   * `null` -> `null`, KHÔNG phải 0. Phiếu chưa chốt điểm để ô TRỐNG: ghi 0
   * là bịa ra một điểm chưa ai cho, và hàm AVERAGE của Excel sẽ tính nó vào
   * rồi kéo trung bình cả phòng xuống.
   */
  private sangSo(d: Prisma.Decimal | null): number | null {
    if (d === null || d === undefined) return null;
    return Number(d.toFixed(2));
  }

  private ngayVN(d: Date | null): string {
    if (!d) return '';
    return new Intl.DateTimeFormat('vi-VN', DINH_DANG_NGAY).format(d);
  }

  /**
   * Tên file: `KPI_<mã kỳ>_<yyyyMMdd-HHmm>.xlsx`.
   *
   * Không dấu, không khoảng trắng — tên file có dấu đi qua HTTP header sẽ
   * hỏng ở một số trình duyệt, và khoảng trắng làm hỏng lệnh trên máy chủ.
   */
  fileName(ky: Period, bayGio = new Date()): string {
    const p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(bayGio);
    const lay = (loai: string) => p.find((x) => x.type === loai)?.value ?? '00';
    const dau = `${lay('year')}${lay('month')}${lay('day')}-${lay('hour')}${lay('minute')}`;
    return `KPI_${ky.code}_${dau}.xlsx`;
  }
}
