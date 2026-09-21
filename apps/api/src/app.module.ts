import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { ProjectsModule } from './modules/projects/projects.module';
import { AnalysesModule } from './modules/analyses/analyses.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';
import { AiConfigsModule } from './modules/ai-configs/ai-configs.module';
import { AuthModule } from './modules/auth/auth.module';
import { AutomationsModule } from './modules/automations/automations.module';

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
  ],
  controllers: [HealthController],
})
export class AppModule {}
