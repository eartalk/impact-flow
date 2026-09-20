import {
  IsBoolean,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateAiConfigDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsString()
  @Matches(/^https?:\/\//, { message: 'baseUrl 必须以 http:// 或 https:// 开头' })
  @MaxLength(500)
  baseUrl!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  apiKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  model!: string;

  @IsIn(['OPENAI', 'ANTHROPIC'])
  apiFormat!: 'OPENAI' | 'ANTHROPIC';

  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  isDefault!: boolean;

  @IsInt()
  @Min(1000)
  @Max(300000)
  timeoutMs!: number;

  @IsInt()
  @Min(1)
  @Max(500)
  maxFiles!: number;

  @IsInt()
  @Min(1)
  @Max(500)
  maxSymbols!: number;
}
