import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: '新密码至少 8 位' })
  password!: string;
}
