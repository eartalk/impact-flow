import { Global, Module } from '@nestjs/common';
import { PROJECT_REPOSITORY } from '../../core/ports/project.repository';
import { ANALYSIS_REPOSITORY } from '../../core/ports/analysis.repository';
import { DatabaseService } from './database.service';
import { MysqlProjectRepository } from './mysql-project.repository';
import { MysqlAnalysisRepository } from './mysql-analysis.repository';

@Global()
@Module({
  providers: [
    DatabaseService,
    MysqlProjectRepository,
    MysqlAnalysisRepository,
    {
      provide: PROJECT_REPOSITORY,
      useExisting: MysqlProjectRepository,
    },
    {
      provide: ANALYSIS_REPOSITORY,
      useExisting: MysqlAnalysisRepository,
    },
  ],
  exports: [PROJECT_REPOSITORY, ANALYSIS_REPOSITORY, DatabaseService],
})
export class PersistenceModule {}
