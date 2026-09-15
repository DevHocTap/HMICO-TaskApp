import { Injectable, NotFoundException } from '@nestjs/common';
import { Grade, KpiSection } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { ScorecardScoringService } from './scorecard-scoring.service.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';

const NHAN_XEP_LOAI: Record<Grade, string> = {
  [Grade.NOT_ACHIEVED]: 'CHƯA ĐẠT',
  [Grade.NEEDS_IMPROVEMENT]: 'CẦN CẢI THIỆN',
  [Grade.COMPLETED]: 'HOÀN THÀNH',
  [Grade.EXCEEDED]: 'VƯỢT CHỈ TIÊU',
};

/** Một dòng đã tính của `getScoring()` — chỉ lấy đúng các trường cần in. */
interface DongIn {
  id: string;
  parentId: string | null;
  section: KpiSection;
  name: string;
  description: string | null;
  measurementText: string | null;
  measureMethod: string | null;
  maxScale: number;
  weight: string;
  selfScore: string | null;
  selfComment: string | null;
  managerScore: string | null;
  managerComment: string | null;
  selfComputed: { diem: string | null; dongGop: string | null };
  managerComputed: { diem: string | null; dongGop: string | null };
}

const SO_COT = 12;
const VIEN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};
const NEN_DAU = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } } as const;
const NEN_MUC = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDD7EE' } } as const;
const NEN_CONG = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } } as const;
const FONT = 'Times New Roman';

const so = (v: string | null): number | null => (v === null ? null : Number(v));
/** Chia lấy tỉ lệ rồi làm tròn 6 chữ số — bỏ rác số thực kiểu 0.09300000000000001 của JS. */
const tyLe = (tu: number | null, mau: number): number | null =>
  tu === null ? null : Math.round((tu / mau) * 1e6) / 1e6;

/**
 * Xuất MỘT phiếu KPI ra Excel theo đúng biểu mẫu công ty BM.01-KPI.KYTHUAT
 * (chốt 14/09/2026): sheet "BM.01" là bản in có bốn ô ký; sheet "Chi tiết"
 * liệt kê KPI con. Số liệu lấy từ engine tính điểm (`getScoring`) — ghi GIÁ
 * TRỊ, không ghi công thức, để không lặp lại lỗi sai số thực của file gốc.
 *
 * "Ngày đánh giá" cố ý ĐỂ TRỐNG (chốt 14/09) — biểu mẫu chỉ ghi tháng; ngày
 * do người ký điền tay.
 */
@Injectable()
export class ScorecardExcelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScorecardScoringService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** Dựng file và ghi nhật ký. Quyền xem do `getScoring()` kiểm (cùng luật với màn Chấm điểm). */
  async export(
    id: string,
    user: AuthenticatedUser,
    ipAddress?: string,
  ): Promise<{ file: Buffer; tenFile: string }> {
    const cham = await this.scoring.getScoring(id, user);
    const phieu = await this.prisma.scorecard.findUnique({
      where: { id },
      select: {
        employeeLevel: true,
        ownerUser: { select: { employeeCode: true, fullName: true } },
        evaluator: { select: { fullName: true } },
        period: { select: { code: true, name: true, submitDeadline: true } },
      },
    });
    if (!phieu) throw new NotFoundException('Không tìm thấy phiếu KPI');

    const maNv = phieu.ownerUser?.employeeCode ?? 'KHONG-MA';
    const tenFile = `KPI_${maNv}_${phieu.period.code}.xlsx`;
    const caiDat = this.settings.lay();

    const wb = new ExcelJS.Workbook();
    wb.creator = 'HMICO APP';
    wb.created = new Date();
    this.sheetBieuMau(wb, {
      thang: phieu.period.code.slice(5, 7) + '/' + phieu.period.code.slice(0, 4),
      tenKy: phieu.period.name,
      hoTen: phieu.ownerUser?.fullName ?? cham.scorecard.ownerName ?? '',
      maNv,
      capBac: phieu.employeeLevel ?? '',
      phong: cham.scorecard.departmentName,
      chucDanh: cham.scorecard.jobTitleName,
      nguoiDanhGia: phieu.evaluator?.fullName ?? '',
      items: cham.items as DongIn[],
      tongTuCham: cham.selfPreview?.daChamDu ? Number(cham.selfPreview.tongDiem) : null,
      tongQuanLy: cham.managerPreview?.daChamDu ? Number(cham.managerPreview.tongDiem) : null,
      xepLoai: cham.scorecard.grade ?? (cham.managerPreview?.daChamDu ? cham.managerPreview.xepLoai : null),
      trongSo: caiDat.trongSo,
      nguong: caiDat.nguongXepLoai,
      hanGuiHcns: phieu.period.submitDeadline,
    });
    this.sheetChiTiet(wb, cham.items as DongIn[]);

    const file = Buffer.from(await wb.xlsx.writeBuffer());
    await this.audit.log({
      actorId: user.id,
      entityType: 'Scorecard',
      entityId: id,
      action: 'EXPORT',
      after: { tenFile, periodCode: phieu.period.code, maNhanVien: maNv },
      ipAddress,
    });
    return { file, tenFile };
  }

  // ------------------------------------------------------------ sheet BM.01

  private sheetBieuMau(
    wb: ExcelJS.Workbook,
    d: {
      thang: string;
      tenKy: string;
      hoTen: string;
      maNv: string;
      capBac: string;
      phong: string;
      chucDanh: string;
      nguoiDanhGia: string;
      items: DongIn[];
      tongTuCham: number | null;
      tongQuanLy: number | null;
      xepLoai: Grade | null;
      trongSo: { bscWork: number; compliance: number };
      nguong: { canCaiThien: number; hoanThanh: number; vuot: number };
      hanGuiHcns: Date | null;
    },
  ) {
    const ws = wb.addWorksheet('BM.01', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      views: [{ showGridLines: false }],
    });
    ws.columns = [
      { width: 6 }, { width: 34 }, { width: 30 }, { width: 10 }, { width: 10 },
      { width: 10 }, { width: 10 }, { width: 11 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 22 },
    ];
    const font = (thay: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 11, ...thay });
    const giua: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const trai: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true };
    let r = 1;

    const oGop = (row: number, tu: number, den: number, gia: ExcelJS.CellValue, f?: Partial<ExcelJS.Font>, al?: Partial<ExcelJS.Alignment>) => {
      ws.mergeCells(row, tu, row, den);
      const c = ws.getCell(row, tu);
      c.value = gia;
      c.font = font(f);
      c.alignment = al ?? giua;
      return c;
    };

    // Đầu trang: công ty · quốc hiệu
    oGop(r, 1, 6, 'CÔNG TY CỔ PHẦN ĐẦU TƯ CÔNG NGHỆ HOÀNG MINH', { bold: true });
    oGop(r, 7, 12, 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true });
    r += 1;
    oGop(r, 1, 6, 'BM.01-KPI.KYTHUAT', { italic: true });
    oGop(r, 7, 12, 'Độc lập - Tự do - Hạnh phúc', { bold: true, underline: true });
    r += 2;
    oGop(r, 1, 12, 'BIỂU MẪU ĐÁNH GIÁ KPI HOÀN THÀNH CÔNG VIỆC', { bold: true, size: 14 });
    r += 1;
    oGop(r, 1, 12, `Tháng: ${d.thang}`, { italic: true });
    r += 2;

    // Khối thông tin — "Ngày đánh giá" ĐỂ TRỐNG (chốt 14/09)
    const thongTin: [string, string, string, string][] = [
      ['Họ và tên:', d.hoTen, 'Cấp bậc (Level):', d.capBac],
      ['Mã nhân viên:', d.maNv, 'Kỳ đánh giá (Tháng/Năm):', d.thang],
      ['Phòng/ Ban:', d.phong, 'Người đánh giá (Trưởng bộ phận):', d.nguoiDanhGia],
      ['Chức danh:', d.chucDanh, 'Ngày đánh giá:', ''],
    ];
    for (const [n1, v1, n2, v2] of thongTin) {
      oGop(r, 1, 2, n1, { bold: true }, trai);
      oGop(r, 3, 5, v1, {}, trai);
      oGop(r, 6, 8, n2, { bold: true }, trai);
      oGop(r, 9, 12, v2, {}, trai);
      r += 1;
    }
    r += 1;

    const dauBang = (row: number) => {
      const cot1 = ['STT', 'Mục tiêu/ Tiêu chí đánh giá', 'Chỉ tiêu cụ thể', 'Trọng số\n(%)', 'Thang điểm\ntối đa'];
      cot1.forEach((t, i) => {
        ws.mergeCells(row, i + 1, row + 1, i + 1);
        const c = ws.getCell(row, i + 1);
        c.value = t;
      });
      oGop(row, 6, 8, 'NGƯỜI LAO ĐỘNG TỰ ĐÁNH GIÁ', { bold: true });
      oGop(row, 9, 11, 'TRƯỞNG BỘ PHẬN ĐÁNH GIÁ', { bold: true });
      ws.mergeCells(row, 12, row + 1, 12);
      ws.getCell(row, 12).value = 'Ghi chú';
      const cot2 = ['Điểm đạt\nđược', '% đạt\ntiêu chí', '% đóng\ngóp/tổng'];
      cot2.forEach((t, i) => {
        ws.getCell(row + 1, 6 + i).value = t;
        ws.getCell(row + 1, 9 + i).value = t;
      });
      for (const rr of [row, row + 1])
        for (let c = 1; c <= SO_COT; c++) {
          const o = ws.getCell(rr, c);
          o.font = font({ bold: true, size: 10 });
          o.alignment = giua;
          o.fill = NEN_DAU;
          o.border = VIEN;
        }
      ws.getRow(row).height = 22;
      ws.getRow(row + 1).height = 30;
    };

    /** Một mục: dòng tiêu đề mục, tiêu chí cấp 1, dòng Cộng. Trả về tổng đóng góp hai cột. */
    const veMuc = (
      section: KpiSection,
      tieuDe: string,
      chuanTrongSo: number,
      tenCong: string,
    ): { tuCham: number | null; quanLy: number | null } => {
      const c = oGop(r, 1, 12, tieuDe, { bold: true }, trai);
      c.fill = NEN_MUC;
      for (let k = 1; k <= SO_COT; k++) ws.getCell(r, k).border = VIEN;
      r += 1;
      dauBang(r);
      r += 2;

      const cap1 = d.items.filter((i) => i.section === section && i.parentId === null);
      let stt = 0;
      let tongTu: number | null = 0;
      let tongQl: number | null = 0;
      let tongTrongSo = 0;
      for (const it of cap1) {
        stt += 1;
        const coCon = d.items.some((x) => x.parentId === it.id);
        const diemTu = so(coCon ? it.selfComputed.diem : it.selfScore);
        const diemQl = so(coCon ? it.managerComputed.diem : it.managerScore);
        const dgTu = so(it.selfComputed.dongGop);
        const dgQl = so(it.managerComputed.dongGop);
        const trongSo = Number(it.weight);
        tongTrongSo += trongSo;
        if (dgTu === null) tongTu = null;
        else if (tongTu !== null) tongTu += dgTu;
        if (dgQl === null) tongQl = null;
        else if (tongQl !== null) tongQl += dgQl;

        const gia: ExcelJS.CellValue[] = [
          stt,
          it.name,
          it.measurementText ?? it.description ?? '',
          tyLe(trongSo, 100),
          it.maxScale,
          diemTu,
          tyLe(diemTu, it.maxScale),
          tyLe(dgTu, 100),
          diemQl,
          tyLe(diemQl, it.maxScale),
          tyLe(dgQl, 100),
          [it.selfComment, it.managerComment].filter(Boolean).join(' / '),
        ];
        gia.forEach((v, i) => {
          const o = ws.getCell(r, i + 1);
          o.value = v;
          o.font = font({ size: 10 });
          o.border = VIEN;
          o.alignment = i === 1 || i === 2 || i === 11 ? trai : giua;
        });
        ws.getCell(r, 4).numFmt = '0%';
        ws.getCell(r, 7).numFmt = '0%';
        ws.getCell(r, 8).numFmt = '0.00%';
        ws.getCell(r, 10).numFmt = '0%';
        ws.getCell(r, 11).numFmt = '0.00%';
        ws.getCell(r, 6).numFmt = '0.##';
        ws.getCell(r, 9).numFmt = '0.##';
        r += 1;
      }

      const cong = oGop(r, 1, 3, tenCong, { bold: true }, trai);
      cong.fill = NEN_CONG;
      const oTs = ws.getCell(r, 4);
      oTs.value = tyLe(tongTrongSo, 100);
      oTs.numFmt = '0%';
      const oTu = ws.getCell(r, 8);
      oTu.value = tyLe(tongTu, 100);
      oTu.numFmt = '0.00%';
      const oQl = ws.getCell(r, 11);
      oQl.value = tyLe(tongQl, 100);
      oQl.numFmt = '0.00%';
      for (let k = 1; k <= SO_COT; k++) {
        const o = ws.getCell(r, k);
        o.font = font({ bold: true, size: 10 });
        o.border = VIEN;
        o.fill = NEN_CONG;
        if (k > 3) o.alignment = giua;
      }
      ws.getCell(r, 12).value = `Chuẩn ${chuanTrongSo}%`;
      r += 1;
      return { tuCham: tongTu, quanLy: tongQl };
    };

    veMuc(KpiSection.BSC_WORK, `MỤC 1. BSC CÔNG VIỆC (BALANCED SCORECARD) — ${d.trongSo.bscWork}%`, d.trongSo.bscWork, 'Cộng Mục 1 (BSC công việc)');
    veMuc(KpiSection.COMPLIANCE, `MỤC 2. CHẤP HÀNH NỘI QUY, QUY ĐỊNH CÔNG TY — ${d.trongSo.compliance}%`, d.trongSo.compliance, 'Cộng Mục 2 (Chấp hành nội quy)');

    // Tổng + xếp loại — tổng lấy từ engine (đã làm tròn đúng một lần), không cộng lại
    const tong = oGop(r, 1, 5, 'TỔNG ĐIỂM KPI HOÀN THÀNH CÔNG VIỆC', { bold: true }, trai);
    tong.fill = NEN_CONG;
    oGop(r, 6, 7, 'TỔNG (NLĐ tự ĐG):', { bold: true, size: 10 });
    const oT1 = ws.getCell(r, 8);
    oT1.value = tyLe(d.tongTuCham, 100);
    oT1.numFmt = '0.00%';
    oGop(r, 9, 10, 'TỔNG (QL đánh giá):', { bold: true, size: 10 });
    const oT2 = ws.getCell(r, 11);
    oT2.value = tyLe(d.tongQuanLy, 100);
    oT2.numFmt = '0.00%';
    for (let k = 1; k <= SO_COT; k++) {
      const o = ws.getCell(r, k);
      o.border = VIEN;
      o.fill = NEN_CONG;
      o.font = font({ bold: true, size: 10 });
      if (k >= 6) o.alignment = giua;
    }
    r += 1;
    const xl = oGop(r, 1, 5, 'XẾP LOẠI KẾT QUẢ ĐÁNH GIÁ', { bold: true }, trai);
    xl.fill = NEN_CONG;
    const oXl = oGop(r, 6, 12, d.xepLoai ? NHAN_XEP_LOAI[d.xepLoai] : '', { bold: true, size: 12 });
    oXl.fill = NEN_CONG;
    for (let k = 1; k <= SO_COT; k++) ws.getCell(r, k).border = VIEN;
    r += 1;
    const n = d.nguong;
    oGop(r, 1, 12, 'Thang xếp loại (4 bậc, theo Tổng điểm KPI cột Trưởng bộ phận đánh giá):', { italic: true, size: 10 }, trai);
    r += 1;
    oGop(
      r,
      1,
      12,
      `(*) Chưa đạt (<${n.canCaiThien}%) · Cần cải thiện (${n.canCaiThien}–${(n.hoanThanh - 0.01).toFixed(2)}%) · Hoàn thành (${n.hoanThanh}–${n.vuot}%) · Vượt chỉ tiêu (>${n.vuot}%)`,
      { italic: true, size: 10 },
      trai,
    );
    r += 2;

    // Bốn ô ký — đúng thứ tự biểu mẫu
    const oKy: [number, number, string, string][] = [
      [1, 2, 'NGƯỜI LAO ĐỘNG', 'Ký ghi rõ họ tên'],
      [3, 5, 'TRƯỞNG BỘ PHẬN', 'Ký ghi rõ họ tên'],
      [6, 9, 'PHÒNG HCNS', 'Ký ghi rõ họ tên'],
      [10, 12, 'BAN GIÁM ĐỐC', 'Ký ghi rõ họ tên\n(Trường hợp phải soát xét)'],
    ];
    for (const [tu, den, ten, phu] of oKy) {
      oGop(r, tu, den, ten, { bold: true });
      oGop(r + 1, tu, den, phu, { italic: true, size: 10 });
      ws.mergeCells(r + 2, tu, r + 5, den);
    }
    ws.getRow(r + 1).height = 28;
    r += 7;
    const han = d.hanGuiHcns
      ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(d.hanGuiHcns)
      : '';
    oGop(r, 1, 12, `Gửi kết quả đánh giá về Phòng HCNS trước ngày ${han || '…'} để tổng hợp.`, { italic: true, size: 10 }, trai);
  }

  // ------------------------------------------------------------ sheet Chi tiết

  private sheetChiTiet(wb: ExcelJS.Workbook, items: DongIn[]) {
    const ws = wb.addWorksheet('Chi tiết', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [
      { width: 6 }, { width: 44 }, { width: 36 }, { width: 16 }, { width: 12 }, { width: 10 },
      { width: 11 }, { width: 11 }, { width: 28 }, { width: 28 },
    ];
    const font = (thay: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: FONT, size: 10, ...thay });
    const giua: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
    const trai: Partial<ExcelJS.Alignment> = { horizontal: 'left', vertical: 'middle', wrapText: true };
    let r = 1;
    ws.mergeCells(r, 1, r, 10);
    ws.getCell(r, 1).value = 'CHI TIẾT KPI CON THEO TỪNG TIÊU CHÍ';
    ws.getCell(r, 1).font = font({ bold: true, size: 13 });
    ws.getCell(r, 1).alignment = giua;
    r += 2;

    const dau = ['STT', 'KPI', 'Cách đo', 'Mục tiêu', 'Trọng số\ntrong nhóm', 'Thang', 'Điểm NV\ntự chấm', 'Điểm TBP\nchấm', 'Ghi chú tự chấm', 'Nhận xét trưởng BP'];
    const cap1 = items.filter((i) => i.parentId === null);
    let sttCha = 0;
    for (const cha of cap1) {
      const con = items.filter((i) => i.parentId === cha.id);
      if (con.length === 0) continue;
      sttCha += 1;
      ws.mergeCells(r, 1, r, 10);
      const o = ws.getCell(r, 1);
      o.value = `${sttCha}. ${cha.name} — trọng số ${Number(cha.weight)}% (${cha.section === KpiSection.BSC_WORK ? 'Mục 1' : 'Mục 2'})`;
      o.font = font({ bold: true, size: 11 });
      o.fill = NEN_MUC;
      o.alignment = trai;
      for (let k = 1; k <= 10; k++) ws.getCell(r, k).border = VIEN;
      r += 1;
      dau.forEach((t, i) => {
        const c = ws.getCell(r, i + 1);
        c.value = t;
        c.font = font({ bold: true });
        c.alignment = giua;
        c.fill = NEN_DAU;
        c.border = VIEN;
      });
      ws.getRow(r).height = 28;
      r += 1;
      con.forEach((it, j) => {
        const gia: ExcelJS.CellValue[] = [
          `${sttCha}.${j + 1}`,
          it.name,
          it.measureMethod ?? '',
          it.measurementText ?? '',
          tyLe(Number(it.weight), 100),
          it.maxScale,
          so(it.selfScore),
          so(it.managerScore),
          it.selfComment ?? '',
          it.managerComment ?? '',
        ];
        gia.forEach((v, i) => {
          const c = ws.getCell(r, i + 1);
          c.value = v;
          c.font = font();
          c.border = VIEN;
          c.alignment = i === 1 || i === 2 || i === 3 || i >= 8 ? trai : giua;
        });
        ws.getCell(r, 5).numFmt = '0%';
        ws.getCell(r, 7).numFmt = '0.##';
        ws.getCell(r, 8).numFmt = '0.##';
        r += 1;
      });
      r += 1;
    }
    if (sttCha === 0) {
      ws.getCell(r, 1).value = 'Phiếu này không có KPI con — mọi tiêu chí chấm trực tiếp ở sheet BM.01.';
      ws.getCell(r, 1).font = font({ italic: true });
    }
  }
}
