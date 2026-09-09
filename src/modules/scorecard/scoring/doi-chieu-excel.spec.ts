import { describe, it, expect } from 'vitest';
import { KpiSection, Grade, Prisma } from '@prisma/client';
import { chotDiem, LoiChamDiem, tinhDiem, type DongCham } from './scoring-engine.js';
import { PHIEU_EXCEL, type PhieuExcel } from './excel-mau-kpi.data.js';

/**
 * MỐC ĐỐI CHIẾU EXCEL — điểm hệ thống tính ra phải khớp tuyệt đối với bốn
 * biểu mẫu thật trong `docs/mau-kpi/`.
 *
 * Số so sánh lấy TỪ CHÍNH FILE EXCEL (`excel-mau-kpi.data.ts`, sinh bằng
 * máy), không phải số tôi tự tính rồi chép vào. So từng dòng: điểm tiêu chí
 * cha suy từ con, đóng góp từng tiêu chí cấp 1, tổng hai cột.
 *
 * HAI ĐIỀU PHẢI BIẾT TRƯỚC KHI ĐỌC KẾT QUẢ:
 *
 * 1. Bốn file KHÔNG PHẢI phiếu đã chấm của một người. Ô "Họ và tên", "Mã
 *    nhân viên", "Người đánh giá", "Ngày đánh giá" đều trống. HCNS đã xác
 *    nhận 03/09/2026 (Câu 3): đây là mẫu thử nghiệm.
 *
 * 2. MỤC 2 (chấp hành nội quy) KHÔNG CÓ ĐIỂM ở cả bốn file. Excel ngầm coi ô
 *    trống là 0 nên nó ra tổng 70% và xếp loại "CHƯA ĐẠT". Hệ thống KHÔNG
 *    làm vậy — xem test cuối file.
 */

const D = (n: number) => new Prisma.Decimal(n);
const so = (d: Prisma.Decimal | null) => (d === null ? null : d.toNumber());

/** Dựng cây dòng phiếu từ số của Excel. */
function dungPhieu(p: PhieuExcel, kemMuc2Diem: number | null = null): DongCham[] {
  const dongs: DongCham[] = [];

  for (const [i, tc] of p.muc1.entries()) {
    const idCha = `m1-${i}`;
    dongs.push({
      id: idCha,
      parentId: null,
      name: tc.ten,
      section: KpiSection.BSC_WORK,
      maxScale: tc.maxScale,
      weight: D(tc.trongSo),
      // Tiêu chí có con KHÔNG mang điểm — điểm suy từ con.
      selfScore: null,
      managerScore: null,
    });
    for (const [j, con] of tc.con.entries()) {
      dongs.push({
        id: `${idCha}-c${j}`,
        parentId: idCha,
        name: con.ten,
        section: KpiSection.BSC_WORK,
        maxScale: tc.maxScale,
        weight: D(con.trongSo),
        selfScore: con.diemTu === null ? null : D(con.diemTu),
        managerScore: con.diemQl === null ? null : D(con.diemQl),
      });
    }
  }

  for (const [i, d] of p.muc2.entries()) {
    dongs.push({
      id: `m2-${i}`,
      parentId: null,
      name: d.ten,
      section: KpiSection.COMPLIANCE,
      maxScale: d.maxScale,
      weight: D(d.trongSo),
      selfScore: kemMuc2Diem === null ? null : D(kemMuc2Diem),
      managerScore: kemMuc2Diem === null ? null : D(kemMuc2Diem),
    });
  }

  return dongs;
}

describe.each(PHIEU_EXCEL.map((p) => [p.file, p] as const))(
  'Đối chiếu Excel — %s',
  (_ten, phieu) => {
    const dongs = dungPhieu(phieu);
    const tuCham = tinhDiem(dongs, 'self');
    const quanLy = tinhDiem(dongs, 'manager');

    it('trọng số KPI con của mỗi nhóm cộng đúng 100', () => {
      for (const tc of phieu.muc1) {
        const tong = tc.con.reduce((a, c) => a.plus(D(c.trongSo)), D(0));
        expect([tc.ten, tong.toNumber()]).toEqual([tc.ten, 100]);
      }
    });

    it('điểm tiêu chí CHA suy từ con, khớp cột "Điểm đạt được" của Excel', () => {
      for (const [i, tc] of phieu.muc1.entries()) {
        expect([tc.ten, so(tuCham.dong.find((d) => d.itemId === `m1-${i}`)!.diem)]).toEqual([
          tc.ten,
          tc.excelDiemChaTu,
        ]);
        expect([tc.ten, so(quanLy.dong.find((d) => d.itemId === `m1-${i}`)!.diem)]).toEqual([
          tc.ten,
          tc.excelDiemChaQl,
        ]);
      }
    });

    it('đóng góp từng tiêu chí cấp 1 khớp cột "% đóng góp/tổng" của Excel', () => {
      for (const [i, tc] of phieu.muc1.entries()) {
        const dg = (kq: typeof tuCham) =>
          so(kq.dong.find((d) => d.itemId === `m1-${i}`)!.dongGop);
        expect([tc.ten, dg(tuCham)]).toEqual([tc.ten, tc.excelDongGopTu]);
        expect([tc.ten, dg(quanLy)]).toEqual([tc.ten, tc.excelDongGopQl]);
      }
    });

    it('tổng Mục 1 đúng 70 ở cả hai cột', () => {
      // Excel ghi 0.70000000000000007 và 0.70000000000000018 ở ba trong bốn
      // file — chính lỗi số thực mà dự án phòng bằng Decimal. Con số ĐÚNG là
      // 70, và đây là chỗ hệ thống hơn Excel chứ không phải lệch.
      const tongMuc1 = (kq: typeof tuCham) =>
        phieu.muc1
          .map((_, i) => kq.dong.find((d) => d.itemId === `m1-${i}`)!.dongGop!)
          .reduce((a, b) => a.plus(b), D(0));

      expect(tongMuc1(tuCham).toNumber()).toBe(70);
      expect(tongMuc1(quanLy).toNumber()).toBe(70);
    });

    it('Mục 2 không có điểm trong Excel -> hệ thống báo CHƯA CHẤM ĐỦ, KHÔNG coi là 0', () => {
      // ĐÂY LÀ CHỖ HỆ THỐNG CỐ Ý KHÁC EXCEL.
      //
      // Excel để trống ba dòng Mục 2, coi như 0 điểm, rồi ra tổng 70% và in
      // "CHƯA ĐẠT". Ai đọc tờ giấy đó cũng tưởng người này bị đánh giá kém,
      // trong khi sự thật là chưa ai chấm phần nội quy.
      //
      // Hệ thống từ chối chốt và chỉ đúng ba dòng còn thiếu.
      expect(quanLy.daChamDu).toBe(false);
      expect(quanLy.thieuDiem).toEqual(phieu.muc2.map((_, i) => `m2-${i}`));
      expect(quanLy.xepLoai).toBeNull();

      try {
        chotDiem(dongs, 'manager');
        expect.unreachable('phải ném lỗi CHUA_CHAM_DU');
      } catch (e) {
        expect((e as LoiChamDiem).ma).toBe('CHUA_CHAM_DU');
        expect((e as LoiChamDiem).itemIds).toHaveLength(phieu.muc2.length);
      }
    });

    it('chấm nốt Mục 2 đủ 3/3 -> tổng đúng 100,00 và xếp loại HOÀN THÀNH', () => {
      // Con số Excel LẼ RA phải ra nếu ba dòng nội quy được chấm đủ.
      const day = dungPhieu(phieu, 3);

      expect(chotDiem(day, 'manager')).toEqual({
        tongDiem: D(100),
        xepLoai: Grade.COMPLETED,
      });
      expect(chotDiem(day, 'self').tongDiem.toNumber()).toBe(100);
    });
  },
);

describe('Đối chiếu Excel — tổng hợp', () => {
  it('phủ đủ bốn file, 27 tiêu chí cấp 1 và 120 KPI con', () => {
    expect(PHIEU_EXCEL).toHaveLength(4);
    expect(PHIEU_EXCEL.reduce((a, p) => a + p.muc1.length, 0)).toBe(27);
    expect(PHIEU_EXCEL.reduce((a, p) => a + p.muc1.reduce((b, t) => b + t.con.length, 0), 0)).toBe(
      120,
    );
  });

  it('cả bốn file đều bỏ trống toàn bộ Mục 2', () => {
    for (const p of PHIEU_EXCEL) {
      for (const d of p.muc2) {
        expect([p.file, d.excelDiemTu, d.excelDiemQl]).toEqual([p.file, null, null]);
      }
    }
  });

  it('hai file ghi tên tiêu chí lệch nhau giữa hai sheet — docs Câu 2', () => {
    const lech = PHIEU_EXCEL.flatMap((p) =>
      p.muc1.filter((t) => t.ten !== t.tenSheetChiTiet).map((t) => [p.file, t.ten, t.tenSheetChiTiet]),
    );

    expect(lech).toEqual([
      ['KPI kỹ sư cấu hình V1', 'Tiến độ thi công/ triển khai', 'Tiến độ triển khai'],
      ['KPI kỹ sư triển khai V1', 'Tiến độ thi công/ triển khai', 'Tiến độ triển khai'],
    ]);
  });
});
