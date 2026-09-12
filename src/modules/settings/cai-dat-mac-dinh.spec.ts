import { describe, expect, it } from 'vitest';
import { CAI_DAT_MAC_DINH, kiemTraCaiDat } from './cai-dat-mac-dinh.js';

const sua = (phan: Partial<{ [K in keyof typeof CAI_DAT_MAC_DINH]: Partial<(typeof CAI_DAT_MAC_DINH)[K]> }>) =>
  ({
    lichKy: { ...CAI_DAT_MAC_DINH.lichKy, ...phan.lichKy },
    nguongXepLoai: { ...CAI_DAT_MAC_DINH.nguongXepLoai, ...phan.nguongXepLoai },
    baoMat: { ...CAI_DAT_MAC_DINH.baoMat, ...phan.baoMat },
    kyDanhGia: { ...CAI_DAT_MAC_DINH.kyDanhGia, ...phan.kyDanhGia },
    chamDiem: { ...CAI_DAT_MAC_DINH.chamDiem, ...phan.chamDiem },
  });

describe('kiemTraCaiDat', () => {
  it('mặc định hợp lệ — đúng số đang chạy trước khi có màn Cài đặt', () => {
    expect(kiemTraCaiDat(CAI_DAT_MAC_DINH)).toEqual([]);
    expect(CAI_DAT_MAC_DINH.lichKy).toEqual({
      ngayLenKpiThangSau: 25,
      ngayTuCham: 25,
      ngayTruongCham: 29,
      ngayGuiHcns: 30,
    });
    expect(CAI_DAT_MAC_DINH.nguongXepLoai).toEqual({ canCaiThien: 80, hoanThanh: 90, vuot: 100 });
  });

  it('thứ tự mốc: tự chấm ≤ trưởng chấm ≤ gửi HCNS', () => {
    expect(kiemTraCaiDat(sua({ lichKy: { ngayTuCham: 30, ngayTruongCham: 29 } }))).toContainEqual(
      expect.stringContaining('tự chấm xong TRƯỚC'),
    );
    expect(kiemTraCaiDat(sua({ lichKy: { ngayGuiHcns: 28 } }))).toContainEqual(
      expect.stringContaining('gửi hành chính'),
    );
    // Bằng nhau thì được (25 = 25 là lịch thật)
    expect(kiemTraCaiDat(sua({ lichKy: { ngayTruongCham: 30 } }))).toEqual([]);
  });

  it('ngày ngoài 1..31 hoặc không nguyên bị từ chối', () => {
    expect(kiemTraCaiDat(sua({ lichKy: { ngayTuCham: 0 } })).length).toBeGreaterThan(0);
    expect(kiemTraCaiDat(sua({ lichKy: { ngayGuiHcns: 32 } })).length).toBeGreaterThan(0);
    expect(kiemTraCaiDat(sua({ lichKy: { ngayTuCham: 25.5 } })).length).toBeGreaterThan(0);
  });

  it('ngưỡng phải tăng dần, hoàn thành được BẰNG vượt', () => {
    expect(kiemTraCaiDat(sua({ nguongXepLoai: { canCaiThien: 90, hoanThanh: 80 } }))).toContainEqual(
      expect.stringContaining('tăng dần'),
    );
    expect(kiemTraCaiDat(sua({ nguongXepLoai: { hoanThanh: 100, vuot: 100 } }))).toEqual([]);
    expect(kiemTraCaiDat(sua({ nguongXepLoai: { vuot: 250 } })).length).toBeGreaterThan(0);
  });

  it('khoá tạm: số lần 3..100, phút 1..1440', () => {
    expect(kiemTraCaiDat(sua({ baoMat: { soLanSaiToiDa: 2 } })).length).toBeGreaterThan(0);
    expect(kiemTraCaiDat(sua({ baoMat: { phutKhoaTam: 0 } })).length).toBeGreaterThan(0);
    expect(kiemTraCaiDat(sua({ baoMat: { soLanSaiToiDa: 5, phutKhoaTam: 30 } }))).toEqual([]);
  });
});
