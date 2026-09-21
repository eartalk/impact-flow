import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { ProjectsModule } from './modules/projects/projects.module';
import { AnalysesModule } from './modules/analyses/analyses.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { AiConfigsModule } from './modules/ai-configs/ai-configs.module';
import { AuthModule } from './modules/auth/auth.module';
import { AutomationsModule } from './modules/automations/automations.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PersistenceModule,
    AuthModule,
    AiConfigsModule,
    ProjectsModule,
    AnalysesModule,
    AutomationsModule,
    WorkspacesModule,
    AuditModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
