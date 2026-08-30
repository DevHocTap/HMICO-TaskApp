import { IsString, MinLength } from 'class-validator';

export const MIN_PASSWORD_LENGTH = 8;

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Chưa nhập mật khẩu hiện tại' })
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LENGTH} ký tự`,
  })
  newPassword!: string;
}
