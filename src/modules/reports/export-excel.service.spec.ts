import { describe, it, expect, beforeAll } from 'vitest';
import { Grade, PeriodType, Prisma, ResultStatus, type Period } from '@prisma/client';
import ExcelJS from 'exceljs';
import { ExportExcelService, type DongXuat } from './export-excel.service.js';

/**
 * Test này ĐỌC LẠI file vừa sinh bằng chính exceljs rồi kiểm từng ô.
 *
 * Không kiểm bằng mắt, và cũng không chỉ kiểm "ghi được file": ghi thành
 * công vẫn có thể ra một file mà mọi ô điểm là CHUỖI. Excel hiện chuỗi
 * "95.50" trông y hệt số 95,5, nhưng HCNS không cộng được, không lọc được,
 * không dựng pivot được — mà đó là toàn bộ lý do họ cần file này.
 */

const KY: Period = {
  id: 'ky-1',
  code: '2026-08',
  name: 'Tháng 08/2026',
  type: PeriodType.MONTH,
  parentId: null,
  startDate: new Date('2026-08-01'),
  endDate: new Date('2026-08-31'),
  assignDeadline: null,
  selfScoreDeadline: null,
  managerScoreDeadline: null,
  submitDeadline: null,
  isLocked: false,
  lockedAt: null,
  lockedById: null,
  createdById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Period;

const D = (n: string) => new Prisma.Decimal(n);

function dong(ghiDe: Partial<DongXuat> = {}): DongXuat {
  return {
    employeeCode: 'HM010',
    fullName: 'Nguyễn Văn Đủ',
    departmentName: 'Phòng Kỹ thuật',
    jobTitleName: 'Kỹ sư triển khai',
    resultStatus: ResultStatus.RECEIVED,
    selfTotalScore: D('100'),
    managerTotalScore: D('95.5'),
    grade: Grade.COMPLETED,
    evaluatorName: 'Trần Thị Quản Lý',
    managerScoredAt: new Date('2026-08-29T03:00:00Z'),
    receivedAt: new Date('2026-08-30T03:00:00Z'),
    noSelfScoreReason: null,
    ...ghiDe,
  };
}

describe('ExportExcelService — đọc lại file vừa sinh', () => {
  const service = new ExportExcelService();
  let ws: ExcelJS.Worksheet;

  beforeAll(async () => {
    const buf = await service.buildWorkbook(KY, [
      dong(),
      // Phiếu chưa chốt điểm: hai ô điểm phải TRỐNG, không phải 0
      dong({
        employeeCode: 'HM011',
        fullName: 'Lê Thị Chưa Chấm',
        resultStatus: ResultStatus.PENDING,
        selfTotalScore: null,
        managerTotalScore: null,
        grade: null,
        managerScoredAt: null,
        receivedAt: null,
      }),
      // Người chưa có phiếu nào trong kỳ
      dong({
        employeeCode: 'HM012',
        fullName: 'Phạm Văn Chưa Giao',
        resultStatus: null,
        selfTotalScore: null,
        managerTotalScore: null,
        grade: null,
        evaluatorName: null,
        managerScoredAt: null,
        receivedAt: null,
      }),
      dong({
        employeeCode: 'HM013',
        fullName: 'Đỗ Thị Nghỉ Việc',
        grade: Grade.NOT_ACHIEVED,
        managerTotalScore: D('62.25'),
        selfTotalScore: null,
        noSelfScoreReason: 'Nghỉ việc từ 15/08, không tự chấm được',
      }),
    ]);

    const doc = new ExcelJS.Workbook();
    await doc.xlsx.load(buf as unknown as ArrayBuffer);
    ws = doc.worksheets[0];
  });

  it('có đúng một sheet, tiêu đề 13 cột', () => {
    expect(ws.getRow(1).getCell(1).value).toBe('Mã NV');
    expect(ws.getRow(1).getCell(7).value).toBe('Tổng điểm QL đánh giá');
    expect(ws.getRow(1).getCell(13).value).toBe('Lý do không tự chấm');
  });

  it('ô điểm là KIỂU SỐ, không phải chuỗi', () => {
    const tuCham = ws.getRow(2).getCell(6).value;
    const quanLy = ws.getRow(2).getCell(7).value;

    expect(typeof tuCham).toBe('number');
    expect(typeof quanLy).toBe('number');
    expect(tuCham).toBe(100);
    expect(quanLy).toBe(95.5);
  });

  it('cột điểm có định dạng 0.00', () => {
    expect(ws.getColumn(6).numFmt).toBe('0.00');
    expect(ws.getColumn(7).numFmt).toBe('0.00');
  });

  it('phiếu chưa chốt điểm -> ô điểm TRỐNG, không phải 0', () => {
    const tuCham = ws.getRow(3).getCell(6).value;
    const quanLy = ws.getRow(3).getCell(7).value;

    expect(tuCham ?? null).toBeNull();
    expect(quanLy ?? null).toBeNull();
    // Ghi 0 thì AVERAGE của Excel tính nó vào và kéo trung bình cả phòng xuống
    expect(tuCham).not.toBe(0);
  });

  it('người chưa có phiếu -> trạng thái "Chưa có phiếu"', () => {
    expect(ws.getRow(4).getCell(9).value).toBe('Chưa có phiếu');
    expect(ws.getRow(4).getCell(8).value ?? '').toBe('');
  });

  it('xếp loại ghi NHÃN TIẾNG VIỆT, không ghi hằng số', () => {
    expect(ws.getRow(2).getCell(8).value).toBe('Hoàn thành');
    expect(ws.getRow(5).getCell(8).value).toBe('Chưa đạt');

    const moiO = ws
      .getColumn(8)
      .values.filter((v): v is string => typeof v === 'string');
    expect(moiO.some((v) => v.includes('NOT_ACHIEVED'))).toBe(false);
    expect(moiO.some((v) => v.includes('COMPLETED'))).toBe(false);
  });

  it('tiếng Việt có dấu giữ nguyên qua vòng ghi rồi đọc lại', () => {
    expect(ws.getRow(2).getCell(2).value).toBe('Nguyễn Văn Đủ');
    expect(ws.getRow(2).getCell(3).value).toBe('Phòng Kỹ thuật');
    expect(ws.getRow(5).getCell(13).value).toBe('Nghỉ việc từ 15/08, không tự chấm được');
  });

  it('đóng băng dòng tiêu đề và bật bộ lọc', () => {
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
  });

  it('ngày hiện theo giờ Việt Nam', () => {
    // 29/08 03:00 UTC là 10:00 giờ VN cùng ngày — không được lùi sang 28
    expect(ws.getRow(2).getCell(11).value).toBe('29/08/2026');
    expect(ws.getRow(2).getCell(12).value).toBe('30/08/2026');
  });

  it('số dòng đúng bằng số người, không thừa dòng trống', () => {
    expect(ws.actualRowCount).toBe(5); // 1 tiêu đề + 4 người
  });
});

describe('ExportExcelService.fileName', () => {
  it('không dấu, không khoảng trắng, có mã kỳ và mốc thời gian', () => {
    const ten = new ExportExcelService().fileName(KY, new Date('2026-09-10T02:05:00Z'));

    // 02:05 UTC = 09:05 giờ VN
    expect(ten).toBe('KPI_2026-08_20260910-0905.xlsx');
    expect(ten).not.toMatch(/\s/);
    expect(ten).toMatch(/^[\x20-\x7E]+$/);
  });
});
