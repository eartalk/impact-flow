import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import type { AuthSession } from '@impact-flow/contracts';
import { AuthService } from './auth.service';
import { CurrentSession, Roles } from './auth.decorators';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

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
    return this.auth.createMember(
      session.workspace.id,
      session.user.id,
      input,
    );
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
}
