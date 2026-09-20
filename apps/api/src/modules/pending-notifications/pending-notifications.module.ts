import { Module } from '@nestjs/common';
import { NOTIFICATION_GATEWAY } from '../../core/ports/notification.gateway';
import { DingTalkNotificationAdapter } from '../../infrastructure/notification/dingtalk-notification.adapter';
import { PendingNotificationsController } from './pending-notifications.controller';
import { PendingNotificationsService } from './pending-notifications.service';

@Module({
  controllers: [PendingNotificationsController],
  providers: [
    PendingNotificationsService,
    DingTalkNotificationAdapter,
    {
      provide: NOTIFICATION_GATEWAY,
      useExisting: DingTalkNotificationAdapter,
    },
  ],
  exports: [PendingNotificationsService],
})
export class PendingNotificationsModule {}
