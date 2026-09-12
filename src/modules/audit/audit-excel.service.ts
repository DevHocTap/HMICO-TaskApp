import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { DongNhatKy } from './audit-query.service.js';

const MUI_GIO = 'Asia/Ho_Chi_Minh';

const CAC_COT = [
  { header: 'Thời điểm', width: 20 },
  { header: 'Mã NV', width: 10 },
  { header: 'Người thực hiện', width: 26 },
  { header: 'Thao tác', width: 70 },
  { header: 'Đối tượng', width: 14 },
  { header: 'Mã thao tác', width: 18 },
  { header: 'Mã đối tượng', width: 38 },
  { header: 'Địa chỉ IP', width: 16 },
  { header: 'Trước', width: 40 },
  { header: 'Sau', width: 40 },
] as const;

/**
 * Nhật ký thao tác ra .xlsx, mỗi dòng một bản ghi.
 *
 * Cột "Thao tác" là câu tiếng Việt đã dựng (`moTaBanGhi`); hai cột Trước /
 * Sau giữ JSON thô để khi tranh cãi vẫn tra được đúng giá trị — file này là
 * bằng chứng, không phải bản đọc cho đẹp.
 */
@Injectable()
export class AuditExcelService {
  async buildWorkbook(dongs: readonly DongNhatKy[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Phần mềm KPI HMICO';
    wb.created = new Date();

    const ws = wb.addWorksheet('Nhật ký thao tác', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = CAC_COT.map((c) => ({ header: c.header, width: c.width }));
    ws.getRow(1).font = { bold: true };

    for (const d of dongs) {
      ws.addRow([
        this.gioVN(d.createdAt),
        d.actor?.employeeCode ?? '',
        d.actor?.fullName ?? 'Hệ thống',
        d.moTa,
        d.nhanDoiTuong,
        d.action,
        d.entityId,
        d.ipAddress ?? '',
        this.json(d.before),
        this.json(d.after),
      ]);
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: CAC_COT.length } };

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  fileName(bayGio = new Date()): string {
    const d = new Intl.DateTimeFormat('sv-SE', { timeZone: MUI_GIO }).format(bayGio);
    return `nhat-ky-thao-tac-${d}.xlsx`;
  }

  private gioVN(d: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: MUI_GIO,
    }).format(d);
  }

  private json(v: unknown): string {
    if (v === null || v === undefined) return '';
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
}
