import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class BootstrapDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.@-]+$/, { message: '用户名只能包含字母、数字及 . _ @ -' })
  @MinLength(3)
  @MaxLength(100)
  username!: string;

  @IsString()
  @MinLength(8, { message: '密码至少需要 8 个字符' })
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  workspaceName!: string;
}
