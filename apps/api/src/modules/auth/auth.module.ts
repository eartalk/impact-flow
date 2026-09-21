import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { MembersController } from './members.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';
import { ArchivedWorkspaceGuard } from './archived-workspace.guard';
import { SameOriginGuard } from './same-origin.guard';

@Module({
  controllers: [AuthController, MembersController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: SameOriginGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // 必须在 AuthGuard 之后：依赖它写入的 request.auth
    { provide: APP_GUARD, useClass: ArchivedWorkspaceGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
