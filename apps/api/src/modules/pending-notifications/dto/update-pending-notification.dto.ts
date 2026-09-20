import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { UpdatePendingNotificationConfigInput } from '@impact-flow/contracts';

export class UpdatePendingNotificationDto
  implements UpdatePendingNotificationConfigInput
{
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  dingTalkWebhook?: string;
}
