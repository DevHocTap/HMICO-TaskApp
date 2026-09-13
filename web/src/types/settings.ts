// Khớp `CaiDatHeThong` ở backend (settings/cai-dat-mac-dinh.ts).

export interface MocLichKy {
  ngayLenKpiThangSau: number;
  ngayTuCham: number;
  ngayTruongCham: number;
  ngayGuiHcns: number;
}

export interface NguongXepLoai {
  canCaiThien: number;
  hoanThanh: number;
  vuot: number;
}

export interface CaiDatBaoMat {
  batBuocDoiMatKhauLanDau: boolean;
  khoaTamKhiSaiNhieu: boolean;
  soLanSaiToiDa: number;
  phutKhoaTam: number;
}

export interface TrongSoHaiMuc {
  bscWork: number;
  compliance: number;
}

export interface CaiDatHeThong {
  trongSo: TrongSoHaiMuc;
  lichKy: MocLichKy;
  nguongXepLoai: NguongXepLoai;
  baoMat: CaiDatBaoMat;
  kyDanhGia: { tuSinhHangThang: boolean };
  chamDiem: { choPhepTraLaiPhieuDaChot: boolean };
}

export type NhomCaiDat = keyof CaiDatHeThong;

export interface CaiDatKemThoiDiem {
  caiDat: CaiDatHeThong;
  capNhat: Record<NhomCaiDat, { updatedAt: string; updatedByName: string | null } | null>;
}
