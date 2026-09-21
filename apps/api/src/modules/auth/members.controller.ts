import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import type { AuthSession } from '@impact-flow/contracts';
import { AuthService } from './auth.service';
import { CurrentSession, Roles } from './auth.decorators';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

type HttpRequest = { ip?: string };

@Controller('members')
export class MembersController {
  constructor(private readonly auth: AuthService) {}

  @Roles('OWNER', 'ADMIN')
  @Get()
  list(@CurrentSession() session: AuthSession) {
    return this.auth.listMembers(session.workspace.id);
  }

  @Roles('OWNER', 'ADMIN')
  @Post()
  create(
    @CurrentSession() session: AuthSession,
    @Body() input: CreateMemberDto,
  ) {
    return this.auth.createMember(session.workspace.id, session.user.id, input);
  }

  @Roles('OWNER', 'ADMIN')
  @Patch(':userId/role')
  updateRole(
    @CurrentSession() session: AuthSession,
    @Param('userId') userId: string,
    @Body() input: UpdateMemberRoleDto,
  ) {
    return this.auth.updateMemberRole(
      session.workspace.id,
      session.user.id,
      userId,
      input.role,
    );
  }

  @Roles('OWNER', 'ADMIN')
  @Delete(':userId')
  remove(
    @CurrentSession() session: AuthSession,
    @Param('userId') userId: string,
  ) {
    return this.auth.removeMember(session.workspace.id, session.user.id, userId);
  }

  /** 停用账号：撤销其在所有工作空间下的会话（账号级操作） */
  @Roles('OWNER', 'ADMIN')
  @Post(':userId/disable')
  disable(
    @CurrentSession() session: AuthSession,
    @Param('userId') userId: string,
    @Req() request: HttpRequest,
  ) {
    return this.auth.disableAccount(
      session.workspace.id,
      session.user.id,
      userId,
      request.ip,
    );
  }

  @Roles('OWNER', 'ADMIN')
  @Post(':userId/restore')
  restore(
    @CurrentSession() session: AuthSession,
    @Param('userId') userId: string,
    @Req() request: HttpRequest,
  ) {
    return this.auth.restoreAccount(
      session.workspace.id,
      session.user.id,
      userId,
      request.ip,
    );
  }

  /** 管理员直接重置成员密码，并撤销其所有会话 */
  @Roles('OWNER', 'ADMIN')
  @Post(':userId/reset-password')
  resetPassword(
    @CurrentSession() session: AuthSession,
    @Param('userId') userId: string,
    @Body() input: ResetPasswordDto,
    @Req() request: HttpRequest,
  ) {
    return this.auth.resetPassword(
      session.workspace.id,
      session.user.id,
      userId,
      input.password,
      request.ip,
    );
  }
}
