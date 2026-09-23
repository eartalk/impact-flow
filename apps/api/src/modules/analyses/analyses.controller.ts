import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { ListAnalysisLogsDto } from './dto/list-analysis-logs.dto';
import { CurrentSession, Roles } from '../auth/auth.decorators';
import type { AuthSession } from '@impact-flow/contracts';
import { UpdateRegressionFeedbackDto } from './dto/update-regression-feedback.dto';

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

  @Patch(':id/regression-targets/:targetId/feedback')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  updateRegressionFeedback(
    @Param('id') id: string,
    @Param('targetId') targetId: string,
    @Body() input: UpdateRegressionFeedbackDto,
    @CurrentSession() session: AuthSession,
  ) {
    return this.analyses.updateRegressionFeedback(
      id,
      targetId,
      input,
      session.workspace.id,
      session.user,
    );
  }

}
