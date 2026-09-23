import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { AnalysisLogQuery } from '@impact-flow/contracts';

const STATUSES = [
  'READY',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'NO_CHANGES',
] as const;

export class ListAnalysisLogsDto implements AnalysisLogQuery {
  @IsIn(['CHANGE_ANALYSIS'])
  type!: AnalysisLogQuery['type'];

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: AnalysisLogQuery['status'];

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
