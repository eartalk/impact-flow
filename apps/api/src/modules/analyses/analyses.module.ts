import { Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { SYMBOL_ANALYZER_GATEWAY } from '../../core/ports/symbol-analyzer.gateway';
import { TypeScriptSymbolAnalyzer } from '../../infrastructure/typescript/typescript-symbol.analyzer';
import { AiConfigsModule } from '../ai-configs/ai-configs.module';
import { AnalysisWorker } from './analysis.worker';
import { AiAnalysisWorker } from './ai-analysis.worker';

@Module({
  imports: [ProjectsModule, AiConfigsModule],
  controllers: [AnalysesController],
  providers: [
    AnalysesService,
    AnalysisWorker,
    AiAnalysisWorker,
    TypeScriptSymbolAnalyzer,
    { provide: SYMBOL_ANALYZER_GATEWAY, useExisting: TypeScriptSymbolAnalyzer },
  ],
  exports: [AnalysesService],
})
export class AnalysesModule {}
