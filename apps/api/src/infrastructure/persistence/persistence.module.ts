import { Global, Module } from '@nestjs/common';
import { PROJECT_REPOSITORY } from '../../core/ports/project.repository';
import { ANALYSIS_REPOSITORY } from '../../core/ports/analysis.repository';
import { DatabaseService } from './database.service';
import { MysqlProjectRepository } from './mysql-project.repository';
import { MysqlAnalysisRepository } from './mysql-analysis.repository';
import { AI_CONFIG_REPOSITORY } from '../../core/ports/ai-config.repository';
import { MysqlAiConfigRepository } from './mysql-ai-config.repository';
import { SecretCipher } from '../security/secret-cipher';
import { PENDING_NOTIFICATION_REPOSITORY } from '../../core/ports/pending-notification.repository';
import { MysqlPendingNotificationRepository } from './mysql-pending-notification.repository';
import { IDENTITY_REPOSITORY } from '../../core/ports/identity.repository';
import { MysqlIdentityRepository } from './mysql-identity.repository';
import { PasswordHasher } from '../security/password-hasher';
import { AUTOMATION_POLICY_REPOSITORY } from '../../core/ports/automation-policy.repository';
import { MysqlAutomationPolicyRepository } from './mysql-automation-policy.repository';

@Global()
@Module({
  providers: [
    DatabaseService,
    MysqlProjectRepository,
    MysqlAnalysisRepository,
    MysqlAiConfigRepository,
    MysqlPendingNotificationRepository,
    MysqlIdentityRepository,
    MysqlAutomationPolicyRepository,
    SecretCipher,
    PasswordHasher,
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
    {
      provide: PENDING_NOTIFICATION_REPOSITORY,
      useExisting: MysqlPendingNotificationRepository,
    },
    {
      provide: IDENTITY_REPOSITORY,
      useExisting: MysqlIdentityRepository,
    },
    {
      provide: AUTOMATION_POLICY_REPOSITORY,
      useExisting: MysqlAutomationPolicyRepository,
    },
  ],
  exports: [
    PROJECT_REPOSITORY,
    ANALYSIS_REPOSITORY,
    AI_CONFIG_REPOSITORY,
    PENDING_NOTIFICATION_REPOSITORY,
    IDENTITY_REPOSITORY,
    AUTOMATION_POLICY_REPOSITORY,
    DatabaseService,
    SecretCipher,
    PasswordHasher,
  ],
})
export class PersistenceModule {}
