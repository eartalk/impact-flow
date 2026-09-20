import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AiConfigsService } from './ai-configs.service';
import { CreateAiConfigDto } from './dto/create-ai-config.dto';
import { UpdateAiConfigDto } from './dto/update-ai-config.dto';
import { CurrentSession, Roles } from '../auth/auth.decorators';
import type { AuthSession } from '@impact-flow/contracts';

@Controller('ai-configs')
export class AiConfigsController {
  constructor(private readonly configs: AiConfigsService) {}

  @Get()
  list(@CurrentSession() session: AuthSession) {
    return this.configs.list(session.workspace.id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN')
  create(@Body() input: CreateAiConfigDto, @CurrentSession() session: AuthSession) {
    return this.configs.create(session.workspace.id, input);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN')
  update(@Param('id') id: string, @Body() input: UpdateAiConfigDto, @CurrentSession() session: AuthSession) {
    return this.configs.update(id, session.workspace.id, input);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  remove(@Param('id') id: string, @CurrentSession() session: AuthSession) {
    return this.configs.remove(id, session.workspace.id);
  }

  @Post(':id/test')
  @Roles('OWNER', 'ADMIN')
  test(@Param('id') id: string, @CurrentSession() session: AuthSession) {
    return this.configs.test(id, session.workspace.id);
  }
}
