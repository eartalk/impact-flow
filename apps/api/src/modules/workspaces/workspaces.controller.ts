import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthSession, WorkspaceOverview } from '@impact-flow/contracts';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { AuthService } from '../auth/auth.service';
import { CurrentSession, Roles } from '../auth/auth.decorators';
import { readCookie } from '../auth/auth-cookie';
import { SESSION_COOKIE } from '../auth/auth.constants';

type HttpRequest = { ip?: string; headers: { cookie?: string } };

@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspacesService,
    private readonly auth: AuthService,
  ) {}

  /** 当前账号可访问的工作空间列表 */
  @Get()
  list(@CurrentSession() session: AuthSession): Promise<WorkspaceOverview[]> {
    return this.workspaces.list(session.user.id);
  }

  /** 用户级创建策略，前端据此决定是否展示“创建工作空间”入口 */
  @Get('creation-policy')
  creationPolicy(@CurrentSession() session: AuthSession) {
    return this.workspaces.creationPolicy(session.user.id);
  }

  /** 当前会话所在的工作空间详情 */
  @Get('current')
  getCurrent(@CurrentSession() session: AuthSession): Promise<WorkspaceOverview> {
    return this.workspaces.getCurrent(session.user.id, session.workspace.id);
  }

  @Patch('current')
  @Roles('OWNER', 'ADMIN')
  updateCurrent(
    @Body() input: UpdateWorkspaceDto,
    @CurrentSession() session: AuthSession,
    @Req() request: HttpRequest,
  ): Promise<WorkspaceOverview> {
    return this.workspaces.update(
      session.workspace.id,
      session.user.id,
      input,
      request.ip,
    );
  }

  /**
   * 创建工作空间：事务内完成空间、OWNER 成员与通知配置初始化，
   * 随后自动把当前会话切换到新空间，调用方可直接使用返回的 session。
   */
  @Post()
  async create(
    @Body() input: CreateWorkspaceDto,
    @CurrentSession() session: AuthSession,
    @Req() request: HttpRequest,
  ): Promise<{ workspace: WorkspaceOverview; session: AuthSession }> {
    const workspace = await this.workspaces.create(
      session.user.id,
      input,
      request.ip,
    );
    const switched = await this.auth.switchWorkspace(
      this.requireSessionToken(request),
      workspace.id,
      request.ip,
    );
    return { workspace, session: switched };
  }

  /** 切换工作空间：就地更新会话，不轮换 token，因此响应中不需要重设 Cookie */
  @Post(':id/switch')
  @HttpCode(200)
  switch(
    @Param('id') id: string,
    @Req() request: HttpRequest,
  ): Promise<AuthSession> {
    return this.auth.switchWorkspace(
      this.requireSessionToken(request),
      id,
      request.ip,
    );
  }

  /** 归档当前工作空间。归档后本空间进入只读，未运行的分析任务被取消 */
  @Post('current/archive')
  @Roles('OWNER')
  archive(
    @CurrentSession() session: AuthSession,
    @Req() request: HttpRequest,
  ) {
    return this.workspaces.archive(
      session.workspace.id,
      session.user.id,
      request.ip,
    );
  }

  /**
   * 恢复归档工作空间。注意：归档空间的会话仍是有效的（只读管理态），
   * 因此本接口在全局只读守卫中作为例外放行，允许所有者在归档空间内撤销归档。
   */
  @Post(':id/restore')
  @Roles('OWNER')
  restore(
    @Param('id') id: string,
    @CurrentSession() session: AuthSession,
    @Req() request: HttpRequest,
  ) {
    return this.workspaces.restore(id, session.user.id, request.ip);
  }

  private requireSessionToken(request: HttpRequest): string {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!token) throw new UnauthorizedException('请先登录');
    return token;
  }
}
