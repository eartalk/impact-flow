import { Controller, Get } from '@nestjs/common';
import { Public } from './modules/auth/auth.decorators';

@Controller('health')
export class HealthController {
  @Get()
  @Public()
  getHealth() {
    return {
      status: 'ok',
      service: 'impact-flow-api',
      timestamp: new Date().toISOString(),
    };
  }
}
