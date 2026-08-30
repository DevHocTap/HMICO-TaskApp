import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Chưa nhập mật khẩu' })
  password!: string;
}
