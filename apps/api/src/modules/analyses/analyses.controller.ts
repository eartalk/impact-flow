import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { AnalysesService } from './analyses.service';
import { CreateAnalysisDto } from './dto/create-analysis.dto';

@Controller('analyses')
export class AnalysesController {
  constructor(private readonly analyses: AnalysesService) {}

  @Get()
  list() {
    return this.analyses.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.analyses.get(id);
  }

  @Post()
  create(@Body() input: CreateAnalysisDto) {
    return this.analyses.create(input.projectId);
  }
}
