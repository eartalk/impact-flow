import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { ListAnalysisLogsDto } from './dto/list-analysis-logs.dto';
import { CurrentSession, Roles } from '../auth/auth.decorators';
import type { AuthSession } from '@impact-flow/contracts';

@Controller('analyses')
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Get()
  list(@CurrentSession() session: AuthSession) {
    return this.analyses.list(session.workspace.id);
  }

  @Get('logs')
  listLogs(@Query() query: ListAnalysisLogsDto, @CurrentSession() session: AuthSession) {
    return this.analyses.listLogs(query, session.workspace.id);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentSession() session: AuthSession) {
    return this.analyses.get(id, session.workspace.id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  create(@Body() input: CreateAnalysisDto, @CurrentSession() session: AuthSession) {
    return this.analyses.create(input.projectId, session.workspace.id);
  }

  @Post(':id/rerun')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  rerun(@Param('id') id: string, @CurrentSession() session: AuthSession) {
    return this.analyses.rerun(id, session.workspace.id);
  }

  @Post(':id/ai-analysis')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  analyzeWithAi(@Param('id') id: string, @CurrentSession() session: AuthSession) {
    return this.analyses.analyzeWithAi(id, session.workspace.id);
  }
}
