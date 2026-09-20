import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';
import { ListAnalysisLogsDto } from './dto/list-analysis-logs.dto';

@Controller('analyses')
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Get()
  list() {
    return this.analyses.list();
  }

  @Get('logs')
  listLogs(@Query() query: ListAnalysisLogsDto) {
    return this.analyses.listLogs(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.analyses.get(id);
  }

  @Post()
  create(@Body() input: CreateAnalysisDto) {
    return this.analyses.create(input.projectId);
  }

  @Post(':id/rerun')
  rerun(@Param('id') id: string) {
    return this.analyses.rerun(id);
  }

  @Post(':id/ai-analysis')
  analyzeWithAi(@Param('id') id: string) {
    return this.analyses.analyzeWithAi(id);
  }
}
