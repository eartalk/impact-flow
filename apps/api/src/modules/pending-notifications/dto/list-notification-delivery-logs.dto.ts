import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import type { NotificationDeliveryLogQuery } from '@impact-flow/contracts';

export class ListNotificationDeliveryLogsDto
  implements NotificationDeliveryLogQuery
{
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(['SUCCESS', 'FAILED'])
  status?: NotificationDeliveryLogQuery['status'];

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
