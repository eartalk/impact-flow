import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { CreateWorkspaceInput } from '@impact-flow/contracts';

export class CreateWorkspaceDto implements CreateWorkspaceInput {
  @IsString()
  @IsNotEmpty({ message: '工作空间名称不能为空' })
  @MaxLength(100)
  name!: string;

  @Matches(/^[a-z0-9][a-z0-9-]{1,99}$/, {
    message: '编码只能包含小写字母、数字与连字符，长度 2-100，且以字母或数字开头',
  })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
