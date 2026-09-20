import { Module } from '@nestjs/common';
import { GIT_GATEWAY } from '../../core/ports/git.gateway';
import { SimpleGitGateway } from '../../infrastructure/git/simple-git.gateway';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { VersionInspectionScheduler } from './version-inspection.scheduler';
import { PendingNotificationsModule } from '../pending-notifications/pending-notifications.module';

@Module({
  imports: [PendingNotificationsModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    VersionInspectionScheduler,
    SimpleGitGateway,
    { provide: GIT_GATEWAY, useExisting: SimpleGitGateway },
  ],
  exports: [ProjectsService, GIT_GATEWAY],
})
export class ProjectsModule {}
