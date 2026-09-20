import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, Min } from 'class-validator';
import type { AnalysisLogQuery } from '@impact-flow/contracts';

export class ListAnalysisLogsDto implements AnalysisLogQuery {
  @IsString()
  projectId!: string;

  @IsIn(['CHANGE_ANALYSIS', 'AI_ANALYSIS'])
  type!: AnalysisLogQuery['type'];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(50)
  pageSize = 10;
}
