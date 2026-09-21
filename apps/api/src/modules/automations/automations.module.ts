import { Module } from '@nestjs/common';
import { AnalysesModule } from '../analyses/analyses.module';
import { ProjectsModule } from '../projects/projects.module';
import { AutomationScheduler } from './automation.scheduler';
import { AutomationPoliciesService } from './automation-policies.service';
import { AutomationsController } from './automations.controller';

@Module({
  imports: [ProjectsModule, AnalysesModule],
  controllers: [AutomationsController],
  providers: [AutomationPoliciesService, AutomationScheduler],
  exports: [AutomationPoliciesService],
})
export class AutomationsModule {}
