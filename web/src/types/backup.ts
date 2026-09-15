/** Trả về của `GET /backups` — thư mục file là nguồn sự thật, không có bảng DB. */
export interface BanSaoLuu {
  tenFile: string;
  taoLuc: string;
  kichThuoc: number;
  nguon: 'TU_DONG' | 'THU_CONG';
  nguoiBamId: string | null;
  nguoiBamTen: string | null;
  migrationMoiNhat: string | null;
  giayChay: number;
  daKiemTra: boolean;
  daChepSangMirror: boolean;
}

export interface TrangThaiSaoLuu {
  thuMuc: string;
  thuMucMirror: string | null;
  cheDo: 'local' | 'docker';
  dangChay: boolean;
  banGanNhat: BanSaoLuu | null;
  lanKeTiep: string | null;
  quaHan: boolean;
  soBan: number;
  tongKichThuoc: number;
  dungLuongTrong: number | null;
  loiGanNhat: { luc: string; thongDiep: string } | null;
}

export interface KetQuaSaoLuu {
  trangThai: TrangThaiSaoLuu;
  danhSach: BanSaoLuu[];
}
