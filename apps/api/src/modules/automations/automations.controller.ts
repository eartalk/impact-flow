import { Body, Controller, Get, Patch } from '@nestjs/common';
import type { AuthSession } from '@impact-flow/contracts';
import { CurrentSession, Roles } from '../auth/auth.decorators';
import { AutomationPoliciesService } from './automation-policies.service';
import { UpdateAutomationConfigDto } from './dto/update-automation-config.dto';

@Controller('automation-config')
export class AutomationsController {
  constructor(private readonly automation: AutomationPoliciesService) {}

  @Get()
  getConfig(@CurrentSession() session: AuthSession) {
    return this.automation.getConfig(session.workspace.id);
  }

  @Patch()
  @Roles('OWNER', 'ADMIN')
  updateConfig(
    @Body() input: UpdateAutomationConfigDto,
    @CurrentSession() session: AuthSession,
  ) {
    return this.automation.updateConfig(
      session.workspace.id,
      session.user.id,
      input,
    );
  }
}
