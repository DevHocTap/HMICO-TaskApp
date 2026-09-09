import { Grade, KpiSection, Prisma } from '@prisma/client';
import { HE_SO_VUOT_THANG } from '../../kpi-template/kpi-scale.constants.js';

/**
 * Engine tính điểm phiếu KPI — hướng A (số hoá cách chấm tay hiện tại).
 *
 * File THUẦN: không import NestJS, không truy vấn database, không nhận
 * `PrismaService`. Nhận vào một danh sách dòng phiếu, trả ra kết quả.
 *
 * VÌ SAO TÁCH RIÊNG: điểm là căn cứ tính lương. Logic tính điểm nằm rải
 * trong service thì không test được nếu không dựng cả module, và mỗi lần
 * sửa service là một lần có thể làm lệch số mà không ai biết. Ở đây nó
 * chạy được với một mảng dựng bằng tay trong test.
 *
 * Công thức — docs/quy-tac-nghiep-vu.md mục 3:
 *
 *   điểm tiêu chí lá     = điểm nhập trực tiếp
 *   điểm tiêu chí có con = Σ (điểm con × trọng số con ÷ 100)
 *   đóng góp             = (điểm tiêu chí ÷ maxScale) × trọng số tiêu chí
 *   tổng điểm (%)        = Σ đóng góp của tất cả tiêu chí cấp 1
 */

const D = (n: number | string | Prisma.Decimal) => new Prisma.Decimal(n);

const MOT_TRAM = D(100);

/** Số chữ số thập phân khi chốt điểm — docs mục 4. */
export const SO_LE_LAM_TRON = 2;

/**
 * Một dòng phiếu, đủ để tính điểm.
 *
 * `maxScale` lấy từ CHÍNH DÒNG PHIẾU chứ không tra hằng số `MAX_SCALE`:
 * phiếu chụp lại thang điểm lúc lập. Công ty đổi thang sang 100 năm sau thì
 * phiếu cũ vẫn phải tính ra đúng con số cũ.
 */
export interface DongCham {
  id: string;
  parentId: string | null;
  name: string;
  section: KpiSection;
  maxScale: number;
  weight: Prisma.Decimal;
  selfScore: Prisma.Decimal | null;
  managerScore: Prisma.Decimal | null;
}

/** Cột điểm đang tính. Engine chạy HAI LẦN ĐỘC LẬP, mỗi lần một cột. */
export type CotCham = 'self' | 'manager';

export interface KetQuaDong {
  itemId: string;
  /**
   * Điểm của tiêu chí, theo thang của chính nó.
   * `null` = chưa tính được vì còn tiêu chí lá chưa chấm ở nhánh này.
   */
  diem: Prisma.Decimal | null;
  /**
   * Phần đóng góp vào tổng phiếu. CHỈ tiêu chí cấp 1 mới có; tiêu chí con
   * để `null` vì nó đã đóng góp gián tiếp qua cha.
   */
  dongGop: Prisma.Decimal | null;
}

export interface KetQuaCham {
  dong: KetQuaDong[];
  /**
   * Tổng điểm phần trăm, ĐÃ làm tròn 2 chữ số.
   *
   * Khi `daChamDu = false` thì đây là ĐIỂM TÍNH THỬ: các nhánh chưa chấm
   * xong đóng góp 0. Không được lưu vào database, chỉ để hiện lên màn hình
   * cho người đang chấm thấy mình đang ở đâu.
   */
  tongDiem: Prisma.Decimal;
  /**
   * Xếp loại. `null` trong HAI trường hợp:
   *   - chưa chấm đủ, và
   *   - đang tính cột TỰ CHẤM.
   *
   * Xếp loại CHỈ tính trên cột trưởng bộ phận (docs mục 4: biểu mẫu ghi rõ
   * xếp loại theo "Tổng điểm KPI - QL đánh giá"). Cột tự chấm vẫn có tổng
   * điểm để đối chiếu, nhưng không có xếp loại — nếu có, nhân viên sẽ đọc
   * nó như kết quả chính thức.
   *
   * Chặn ngay tại engine chứ không giao cho service tự nhớ.
   */
  xepLoai: Grade | null;
  daChamDu: boolean;
  /** Id các tiêu chí LÁ còn thiếu điểm ở cột đang tính. */
  thieuDiem: string[];
}

export type MaLoiChamDiem =
  | 'DIEM_VAO_TIEU_CHI_CHA'
  | 'DIEM_AM'
  | 'VUOT_TRAN'
  | 'CHUA_CHAM_DU'
  | 'CAY_QUA_SAU'
  | 'CHA_KHONG_TON_TAI';

/**
 * Lỗi nghiệp vụ của việc chấm điểm.
 *
 * Cố ý KHÔNG dùng `BadRequestException` của NestJS: file này phải chạy được
 * ngoài NestJS. Service bắt lỗi này rồi tự đổi sang HTTP 400.
 */
export class LoiChamDiem extends Error {
  constructor(
    readonly ma: MaLoiChamDiem,
    thongDiep: string,
    readonly itemId?: string,
    /** Danh sách item còn thiếu điểm — chỉ dùng cho `CHUA_CHAM_DU`. */
    readonly itemIds?: string[],
  ) {
    super(thongDiep);
    this.name = 'LoiChamDiem';
  }
}

/**
 * Trần điểm cho phép nhập của một dòng.
 *
 * Chỉ `BSC_WORK` được vượt thang (tối đa 1,2 lần). `COMPLIANCE` trần đúng
 * bằng thang: không ai "vượt chỉ tiêu" ở khoản chấp hành nội quy.
 *
 * Tính từ `maxScale` CỦA DÒNG, không từ hằng số — cùng lý do như `DongCham`.
 */
export function tranDiemCuaDong(section: KpiSection, maxScale: number): Prisma.Decimal {
  const thang = D(maxScale);
  return section === KpiSection.BSC_WORK ? thang.times(D(HE_SO_VUOT_THANG)) : thang;
}

/**
 * Xếp loại từ tổng điểm ĐÃ LÀM TRÒN.
 *
 * Tài liệu ghi "80–89" và "90–100", để hở khoảng 89,5–89,99. Chốt theo so
 * sánh liên tục, không có khoảng hở:
 *
 *   total < 80        -> NOT_ACHIEVED
 *   80 <= total < 90  -> NEEDS_IMPROVEMENT
 *   90 <= total <= 100-> COMPLETED
 *   total > 100       -> EXCEEDED
 *
 * So trên giá trị ĐÃ làm tròn để 89,996 ra COMPLETED (làm tròn thành 90,00)
 * thay vì NEEDS_IMPROVEMENT. Làm tròn trước rồi mới xếp loại, không làm
 * ngược lại.
 */
export function xepLoaiTuTongDiem(tongDiem: Prisma.Decimal): Grade {
  if (tongDiem.lessThan(80)) return Grade.NOT_ACHIEVED;
  if (tongDiem.lessThan(90)) return Grade.NEEDS_IMPROVEMENT;
  if (tongDiem.lessThanOrEqualTo(100)) return Grade.COMPLETED;
  return Grade.EXCEEDED;
}

/** Làm tròn ROUND_HALF_UP 2 chữ số — CHỈ gọi ở bước cuối, không gọi giữa chừng. */
export function lamTronDiem(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(SO_LE_LAM_TRON, Prisma.Decimal.ROUND_HALF_UP);
}

const layDiem = (dong: DongCham, cot: CotCham): Prisma.Decimal | null =>
  cot === 'self' ? dong.selfScore : dong.managerScore;

/**
 * Tính điểm MỘT CỘT của phiếu.
 *
 * Ném `LoiChamDiem` khi dữ liệu vào sai (điểm ở tiêu chí có con, điểm âm,
 * vượt trần, cây hỏng). KHÔNG ném khi mới chấm dở — trường hợp đó trả
 * `daChamDu = false` kèm `thieuDiem`, vì màn hình chấm cần xem được điểm
 * tạm tính trong lúc đang gõ.
 *
 * TUYỆT ĐỐI không coi ô trống là 0 điểm: một tiêu chí quên chấm sẽ thành
 * "chấm 0", kéo tổng xuống và người bị chấm không có cách nào biết.
 */
export function tinhDiem(dongs: readonly DongCham[], cot: CotCham): KetQuaCham {
  const conCuaCha = new Map<string, DongCham[]>();
  const theoId = new Map<string, DongCham>();
  for (const d of dongs) theoId.set(d.id, d);
  for (const d of dongs) {
    if (d.parentId === null) continue;
    if (!theoId.has(d.parentId)) {
      throw new LoiChamDiem(
        'CHA_KHONG_TON_TAI',
        `Tiêu chí "${d.name}" trỏ tới tiêu chí cha không có trong phiếu.`,
        d.id,
      );
    }
    const ds = conCuaCha.get(d.parentId);
    if (ds) ds.push(d);
    else conCuaCha.set(d.parentId, [d]);
  }

  // Cây KPI chỉ có HAI cấp (docs mục 2). Cháu là dấu hiệu dữ liệu hỏng,
  // và công thức dưới đây không định nghĩa cho cấp 3.
  for (const d of dongs) {
    if (d.parentId === null) continue;
    if (conCuaCha.has(d.id)) {
      throw new LoiChamDiem(
        'CAY_QUA_SAU',
        `Tiêu chí "${d.name}" ở cấp 2 mà vẫn có tiêu chí con. Phiếu KPI chỉ có hai cấp.`,
        d.id,
      );
    }
  }

  const thieuDiem: string[] = [];
  const ketQua = new Map<string, KetQuaDong>();

  /** Điểm của một tiêu chí; `null` nghĩa là nhánh này chưa chấm xong. */
  const diemCuaDong = (d: DongCham): Prisma.Decimal | null => {
    const con = conCuaCha.get(d.id);
    const diemNhap = layDiem(d, cot);

    if (con && con.length > 0) {
      // Tiêu chí có con thì điểm SUY RA TỪ CON, không bao giờ lưu.
      // Hai nguồn sự thật cho cùng một con số thì chúng sẽ lệch.
      if (diemNhap !== null) {
        throw new LoiChamDiem(
          'DIEM_VAO_TIEU_CHI_CHA',
          `Tiêu chí "${d.name}" có KPI con nên không nhập điểm trực tiếp; điểm tính từ các KPI con.`,
          d.id,
        );
      }
      let tong = D(0);
      let duCon = true;
      for (const c of con) {
        const diemCon = diemCuaDong(c);
        if (diemCon === null) {
          duCon = false;
          continue;
        }
        // Nhân trước, chia sau: giữ được nhiều chữ số có nghĩa hơn.
        tong = tong.plus(diemCon.times(c.weight).div(MOT_TRAM));
      }
      return duCon ? tong : null;
    }

    // Tiêu chí lá
    if (diemNhap === null) {
      thieuDiem.push(d.id);
      return null;
    }
    if (diemNhap.isNegative()) {
      throw new LoiChamDiem('DIEM_AM', `Điểm của "${d.name}" không được âm.`, d.id);
    }
    const tran = tranDiemCuaDong(d.section, d.maxScale);
    if (diemNhap.greaterThan(tran)) {
      throw new LoiChamDiem(
        'VUOT_TRAN',
        `Điểm của "${d.name}" là ${diemNhap.toString()}, vượt trần ${tran.toString()} của thang ${d.maxScale}.`,
        d.id,
      );
    }
    return diemNhap;
  };

  const cap1 = dongs.filter((d) => d.parentId === null);
  let tong = D(0);

  for (const d of cap1) {
    const diem = diemCuaDong(d);
    // đóng góp = (điểm ÷ maxScale) × trọng số. Nhân trước chia sau.
    const dongGop = diem === null ? null : diem.times(d.weight).div(D(d.maxScale));
    ketQua.set(d.id, { itemId: d.id, diem, dongGop });
    if (dongGop !== null) tong = tong.plus(dongGop);
  }

  // Ghi lại điểm của tiêu chí con để màn hình hiện được, sau khi cây đã duyệt.
  for (const d of dongs) {
    if (d.parentId === null) continue;
    ketQua.set(d.id, { itemId: d.id, diem: layDiem(d, cot), dongGop: null });
  }

  const daChamDu = thieuDiem.length === 0;
  // Làm tròn ĐÚNG MỘT LẦN, ở đây. Không làm tròn ở từng tiêu chí: sai số
  // của 9 lần làm tròn cộng lại đủ để đổi xếp loại ở ranh giới 90.
  const tongDiem = lamTronDiem(tong);

  return {
    dong: dongs.map((d) => ketQua.get(d.id)!),
    tongDiem,
    xepLoai: daChamDu && cot === 'manager' ? xepLoaiTuTongDiem(tongDiem) : null,
    daChamDu,
    thieuDiem,
  };
}

export interface DiemDaChot {
  tongDiem: Prisma.Decimal;
  /** `null` khi chốt cột tự chấm — xem `KetQuaCham.xepLoai`. */
  xepLoai: Grade | null;
}

/**
 * Chốt điểm để LƯU vào phiếu. Khác `tinhDiem` ở đúng một chỗ: chưa chấm đủ
 * thì ném lỗi thay vì trả điểm tính thử.
 *
 * Dùng ở `self-submit` / `manager-submit`. Mọi chỗ chỉ hiển thị thì gọi
 * `tinhDiem`.
 */
export function chotDiem(dongs: readonly DongCham[], cot: CotCham): DiemDaChot {
  const kq = tinhDiem(dongs, cot);
  if (!kq.daChamDu) {
    throw new LoiChamDiem(
      'CHUA_CHAM_DU',
      `Phiếu chưa chấm đủ: còn ${kq.thieuDiem.length} tiêu chí chưa có điểm.`,
      undefined,
      kq.thieuDiem,
    );
  }
  return { tongDiem: kq.tongDiem, xepLoai: kq.xepLoai };
}
