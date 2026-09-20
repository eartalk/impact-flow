import {
  IsBoolean,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateAiConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\//, { message: 'baseUrl 必须以 http:// 或 https:// 开头' })
  @MaxLength(500)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  model?: string;

  @IsOptional()
  @IsIn(['OPENAI', 'ANTHROPIC'])
  apiFormat?: 'OPENAI' | 'ANTHROPIC';

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(300000)
  timeoutMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxFiles?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  maxSymbols?: number;
}
