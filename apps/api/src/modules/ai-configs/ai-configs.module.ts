import { Module } from '@nestjs/common';
import { AI_ANALYZER_GATEWAY } from '../../core/ports/ai-analyzer.gateway';
import { OpenAiCompatibleAnalysisAdapter } from '../../infrastructure/ai/openai-compatible-analysis.adapter';
import { AiConfigsController } from './ai-configs.controller';
import { AiConfigsService } from './ai-configs.service';

@Module({
  controllers: [AiConfigsController],
  providers: [
    AiConfigsService,
    OpenAiCompatibleAnalysisAdapter,
    { provide: AI_ANALYZER_GATEWAY, useExisting: OpenAiCompatibleAnalysisAdapter },
  ],
  exports: [AI_ANALYZER_GATEWAY],
})
export class AiConfigsModule {}
