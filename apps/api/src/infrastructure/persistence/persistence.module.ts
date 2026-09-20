import { Global, Module } from '@nestjs/common';
import { PROJECT_REPOSITORY } from '../../core/ports/project.repository';
import { ANALYSIS_REPOSITORY } from '../../core/ports/analysis.repository';
import { DatabaseService } from './database.service';
import { MysqlProjectRepository } from './mysql-project.repository';
import { MysqlAnalysisRepository } from './mysql-analysis.repository';
import { AI_CONFIG_REPOSITORY } from '../../core/ports/ai-config.repository';
import { MysqlAiConfigRepository } from './mysql-ai-config.repository';
import { SecretCipher } from '../security/secret-cipher';

@Global()
@Module({
  providers: [
    DatabaseService,
    MysqlProjectRepository,
    MysqlAnalysisRepository,
    MysqlAiConfigRepository,
    SecretCipher,
    {
      provide: PROJECT_REPOSITORY,
      useExisting: MysqlProjectRepository,
    },
    {
      provide: ANALYSIS_REPOSITORY,
      useExisting: MysqlAnalysisRepository,
    },
    {
      provide: AI_CONFIG_REPOSITORY,
      useExisting: MysqlAiConfigRepository,
    },
  ],
  exports: [
    PROJECT_REPOSITORY,
    ANALYSIS_REPOSITORY,
    AI_CONFIG_REPOSITORY,
    DatabaseService,
    SecretCipher,
  ],
})
export class PersistenceModule {}
