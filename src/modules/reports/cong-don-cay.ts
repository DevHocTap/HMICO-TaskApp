/**
 * Cộng dồn số liệu theo cây phòng ban.
 *
 * File THUẦN: không import NestJS, không chạm database.
 *
 * VÌ SAO PHẢI CỘNG DỒN Ở BACKEND, không để giao diện tự tính: `Table` dạng
 * cây của Ant Design hiện đúng số của từng dòng, và nếu dòng cha chỉ mang
 * nhân sự TRỰC THUỘC thì "Hà Nội (trụ sở)" hiện 0 người trong khi bên dưới
 * nó có 14 người. HCNS nhìn dòng đó rồi kết luận trụ sở chưa ai nộp.
 *
 * Cây thật hiện tại chỉ ba tầng (Công ty → chi nhánh → phòng), nhưng hàm
 * này không giả định độ sâu: cây tổ chức là thứ sẽ đổi.
 */

/** Các cột số được cộng dồn. Thêm cột mới ở đây là tự động được cộng. */
export interface SoLieuPhong {
  tongNhanSu: number;
  chuaCoPhieu: number;
  chuaKyNhan: number;
  choTuCham: number;
  choTruongCham: number;
  choTiepNhan: number;
  daNop: number;
}

export interface DongPhong extends SoLieuPhong {
  departmentId: string;
  departmentName: string;
  parentId: string | null;
}

const CAC_COT: (keyof SoLieuPhong)[] = [
  'tongNhanSu',
  'chuaCoPhieu',
  'chuaKyNhan',
  'choTuCham',
  'choTruongCham',
  'choTiepNhan',
  'daNop',
];

export class LoiCayPhong extends Error {
  constructor(
    readonly ma: 'CHA_KHONG_TON_TAI' | 'CAY_CO_VONG_LAP',
    thongDiep: string,
  ) {
    super(thongDiep);
    this.name = 'LoiCayPhong';
  }
}

/**
 * Trả về danh sách phòng với số liệu ĐÃ CỘNG DỒN từ toàn bộ cây con.
 *
 * Số của một phòng = số trực thuộc phòng đó + số của mọi phòng con, cháu,
 * chắt. Mỗi người chỉ được cộng đúng MỘT lần ở mỗi mức: người của tổ được
 * cộng vào tổ, vào phòng, vào chi nhánh, vào công ty — mỗi nơi một lần.
 *
 * Không đụng vào mảng đầu vào; trả mảng mới theo đúng thứ tự đã nhận.
 */
export function congDonTheoCay(dongs: readonly DongPhong[]): DongPhong[] {
  const conCuaCha = new Map<string, string[]>();
  const theoId = new Map<string, DongPhong>();
  for (const d of dongs) theoId.set(d.departmentId, d);

  for (const d of dongs) {
    if (d.parentId === null) continue;
    if (!theoId.has(d.parentId)) {
      // Xảy ra khi MANAGER chỉ thấy một nhánh: phòng gốc của nhánh đó có
      // `parentId` trỏ ra ngoài phạm vi. Coi nó như gốc, KHÔNG ném lỗi —
      // xem `chuanHoaNhanhCon()`.
      continue;
    }
    const ds = conCuaCha.get(d.parentId);
    if (ds) ds.push(d.departmentId);
    else conCuaCha.set(d.parentId, [d.departmentId]);
  }

  const ketQua = new Map<string, SoLieuPhong>();
  const dangDuyet = new Set<string>();

  /** Cộng dồn một nhánh. Ghi nhớ để không duyệt lại cây con nhiều lần. */
  function congNhanh(id: string): SoLieuPhong {
    const daCo = ketQua.get(id);
    if (daCo) return daCo;

    if (dangDuyet.has(id)) {
      // Cây phòng ban có vòng lặp thì đệ quy ở đây chạy vô hạn. Module org
      // đã chặn lúc ghi, nhưng dữ liệu cũ hoặc sửa thẳng database vẫn tạo
      // được vòng — thà chết ngay với thông điệp rõ.
      throw new LoiCayPhong(
        'CAY_CO_VONG_LAP',
        `Cây phòng ban có vòng lặp tại ${id}. Kiểm tra cột parentId.`,
      );
    }
    dangDuyet.add(id);

    const goc = theoId.get(id)!;
    const tong: SoLieuPhong = { ...laySoLieu(goc) };
    for (const idCon of conCuaCha.get(id) ?? []) {
      const cua = congNhanh(idCon);
      for (const cot of CAC_COT) tong[cot] += cua[cot];
    }

    dangDuyet.delete(id);
    ketQua.set(id, tong);
    return tong;
  }

  return dongs.map((d) => ({ ...d, ...congNhanh(d.departmentId) }));
}

function laySoLieu(d: DongPhong): SoLieuPhong {
  return {
    tongNhanSu: d.tongNhanSu,
    chuaCoPhieu: d.chuaCoPhieu,
    chuaKyNhan: d.chuaKyNhan,
    choTuCham: d.choTuCham,
    choTruongCham: d.choTruongCham,
    choTiepNhan: d.choTiepNhan,
    daNop: d.daNop,
  };
}

/**
 * Cắt `parentId` trỏ ra NGOÀI danh sách thành `null`.
 *
 * Cần cho MANAGER: họ chỉ thấy nhánh phòng mình, nên phòng gốc của nhánh
 * vẫn mang `parentId` của chi nhánh mà họ không được xem. Giao diện dựng
 * cây theo `parentId` sẽ không tìm thấy cha và **làm rơi mất cả nhánh** —
 * bảng hiện trống trong khi dữ liệu vẫn về đủ.
 */
export function chuanHoaNhanhCon(dongs: readonly DongPhong[]): DongPhong[] {
  const co = new Set(dongs.map((d) => d.departmentId));
  return dongs.map((d) => ({
    ...d,
    parentId: d.parentId && co.has(d.parentId) ? d.parentId : null,
  }));
}
