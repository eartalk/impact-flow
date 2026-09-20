import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { PendingNotificationsService } from './pending-notifications.service';
import { UpdatePendingNotificationDto } from './dto/update-pending-notification.dto';
import { CurrentSession, Roles } from '../auth/auth.decorators';
import type { AuthSession } from '@impact-flow/contracts';

@Controller('pending-notification-config')
export class PendingNotificationsController {
  constructor(private readonly notifications: PendingNotificationsService) {}

  @Get()
  getConfig(@CurrentSession() session: AuthSession) {
    return this.notifications.getConfig(session.workspace.id);
  }

  @Patch()
  @Roles('OWNER', 'ADMIN')
  updateConfig(@Body() input: UpdatePendingNotificationDto, @CurrentSession() session: AuthSession) {
    return this.notifications.updateConfig(session.workspace.id, input);
  }

  @Post('test')
  @Roles('OWNER', 'ADMIN')
  test(@CurrentSession() session: AuthSession) {
    return this.notifications.test(session.workspace.id);
  }
}
