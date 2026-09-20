import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ListInspectionLogsDto } from './dto/list-inspection-logs.dto';
import { ProjectsService } from './projects.service';
import { CurrentSession, Roles } from '../auth/auth.decorators';
import type { AuthSession } from '@impact-flow/contracts';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentSession() session: AuthSession) {
    return this.projects.list(session.workspace.id);
  }

  @Get('inspection-logs')
  listInspectionLogs(@Query() query: ListInspectionLogsDto, @CurrentSession() session: AuthSession) {
    return this.projects.listInspectionLogs(query, session.workspace.id);
  }

  @Post()
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  create(@Body() input: CreateProjectDto, @CurrentSession() session: AuthSession) {
    return this.projects.create(session.workspace.id, input);
  }

  @Patch(':id')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  update(@Param('id') id: string, @Body() input: UpdateProjectDto, @CurrentSession() session: AuthSession) {
    return this.projects.update(id, input, session.workspace.id);
  }

  @Delete(':id')
  @Roles('OWNER', 'ADMIN')
  remove(@Param('id') id: string, @CurrentSession() session: AuthSession) {
    return this.projects.remove(id, session.workspace.id);
  }

  @Post(':id/detect-version')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  detectVersion(@Param('id') id: string, @CurrentSession() session: AuthSession) {
    return this.projects.detectVersion(id, session.workspace.id);
  }

  @Post(':id/test-connection')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  testConnection(@Param('id') id: string, @CurrentSession() session: AuthSession) {
    return this.projects.testConnection(id, session.workspace.id);
  }

  @Post('inspect-all')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  inspectAll(@CurrentSession() session: AuthSession) {
    return this.projects.inspectAll('MANUAL', session.workspace.id);
  }

  @Post(':id/inspect-version')
  @Roles('OWNER', 'ADMIN', 'MEMBER')
  inspectVersion(@Param('id') id: string, @CurrentSession() session: AuthSession) {
    return this.projects.inspectVersion(id, 'MANUAL', session.workspace.id);
  }
}
