import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { ProjectsModule } from './modules/projects/projects.module';
import { AnalysesModule } from './modules/analyses/analyses.module';
import { PersistenceModule } from './infrastructure/persistence/persistence.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
    }),
    PersistenceModule,
    ProjectsModule,
    AnalysesModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
