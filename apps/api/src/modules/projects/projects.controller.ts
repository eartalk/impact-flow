import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ListInspectionLogsDto } from './dto/list-inspection-logs.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list() {
    return this.projects.list();
  }

  @Get('inspection-logs')
  listInspectionLogs(@Query() query: ListInspectionLogsDto) {
    return this.projects.listInspectionLogs(query);
  }

  @Post()
  create(@Body() input: CreateProjectDto) {
    return this.projects.create(input);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() input: UpdateProjectDto) {
    return this.projects.update(id, input);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.projects.remove(id);
  }

  @Post(':id/detect-version')
  detectVersion(@Param('id') id: string) {
    return this.projects.detectVersion(id);
  }

  @Post(':id/test-connection')
  testConnection(@Param('id') id: string) {
    return this.projects.testConnection(id);
  }

  @Post('inspect-all')
  inspectAll() {
    return this.projects.inspectAll();
  }

  @Post(':id/inspect-version')
  inspectVersion(@Param('id') id: string) {
    return this.projects.inspectVersion(id);
  }
}
