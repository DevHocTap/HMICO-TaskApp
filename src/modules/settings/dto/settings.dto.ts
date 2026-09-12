import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Body của `PUT /settings` — cập nhật MỘT PHẦN: nhóm nào gửi lên thì thay
 * trọn nhóm đó, nhóm không gửi giữ nguyên. Quan hệ giữa các giá trị
 * (tự chấm trước trưởng chấm…) kiểm ở `kiemTraCaiDat`, không ở đây.
 */
export class LichKyDto {
  @IsInt() @Min(1) @Max(31) ngayLenKpiThangSau!: number;
  @IsInt() @Min(1) @Max(31) ngayTuCham!: number;
  @IsInt() @Min(1) @Max(31) ngayTruongCham!: number;
  @IsInt() @Min(1) @Max(31) ngayGuiHcns!: number;
}

export class NguongXepLoaiDto {
  @IsNumber() @Min(0) @Max(200) canCaiThien!: number;
  @IsNumber() @Min(0) @Max(200) hoanThanh!: number;
  @IsNumber() @Min(0) @Max(200) vuot!: number;
}

export class BaoMatDto {
  @IsBoolean() batBuocDoiMatKhauLanDau!: boolean;
  @IsBoolean() khoaTamKhiSaiNhieu!: boolean;
  @IsInt() @Min(3) @Max(100) soLanSaiToiDa!: number;
  @IsInt() @Min(1) @Max(1440) phutKhoaTam!: number;
}

export class KyDanhGiaDto {
  @IsBoolean() tuSinhHangThang!: boolean;
}

export class ChamDiemDto {
  @IsBoolean() choPhepTraLaiPhieuDaChot!: boolean;
}

export class UpdateSettingsDto {
  @IsOptional() @ValidateNested() @Type(() => LichKyDto) lichKy?: LichKyDto;
  @IsOptional() @ValidateNested() @Type(() => NguongXepLoaiDto) nguongXepLoai?: NguongXepLoaiDto;
  @IsOptional() @ValidateNested() @Type(() => BaoMatDto) baoMat?: BaoMatDto;
  @IsOptional() @ValidateNested() @Type(() => KyDanhGiaDto) kyDanhGia?: KyDanhGiaDto;
  @IsOptional() @ValidateNested() @Type(() => ChamDiemDto) chamDiem?: ChamDiemDto;
}
