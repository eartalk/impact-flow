import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { UpdateWorkspaceInput } from '@impact-flow/contracts';

export class UpdateWorkspaceDto implements UpdateWorkspaceInput {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '工作空间名称不能为空' })
  @MaxLength(100)
  name?: string;

  /** 传空字符串表示清空描述 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
