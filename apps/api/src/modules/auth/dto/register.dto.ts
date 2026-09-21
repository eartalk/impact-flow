import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { RegisterInput } from '@impact-flow/contracts';

export class RegisterDto implements RegisterInput {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.@-]+$/, {
    message: '用户名只能包含字母、数字及 . _ @ -',
  })
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

  @Matches(/^[a-z0-9][a-z0-9-]{1,99}$/, {
    message: '工作空间编码只能包含小写字母、数字与连字符，长度 2-100',
  })
  workspaceCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  workspaceDescription?: string;
}
