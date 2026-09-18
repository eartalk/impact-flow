import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { InspectionLogQuery } from '@impact-flow/contracts';

export class ListInspectionLogsDto implements InspectionLogQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(['RUNNING', 'SUCCESS', 'FAILED'])
  status?: InspectionLogQuery['status'];

  @IsOptional()
  @IsIn(['SCHEDULED', 'MANUAL'])
  triggerType?: InspectionLogQuery['triggerType'];
}
