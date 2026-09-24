import type {
  ChangeEvidence,
  ChangedFile,
  ChangeUnit,
  RegressionSuggestion,
  SymbolChange,
  SymbolImpact,
} from '@impact-flow/contracts';
import type { AiAnalysisInput } from '../ports/ai-analyzer.gateway';

export interface AiAnalysisBatch {
  index: number;
  files: ChangedFile[];
  changeEvidence: ChangeEvidence[];
  changeUnits: ChangeUnit[];
  ruleSuggestions: RegressionSuggestion[];
  symbolChanges: SymbolChange[];
  symbolImpacts: SymbolImpact[];
}

/** 为每项变更建立明确批次归属，配置上限表示单批容量而不是总量截断。 */
export class AiAnalysisBatchPlanner {
  plan(input: AiAnalysisInput, maxFiles: number, maxSymbols: number): AiAnalysisBatch[] {
    const fileLimit = Math.max(1, maxFiles);
    const symbolLimit = Math.max(1, maxSymbols);
    const files = [...input.files].sort((left, right) => this.filePriority(right) - this.filePriority(left));
    const fileChunks = this.chunkFiles(files, fileLimit, input.changeEvidence);
    const batches: AiAnalysisBatch[] = [];

    for (const fileChunk of fileChunks) {
      const paths = new Set(fileChunk.flatMap((file) => [file.path, file.oldPath])
        .filter((path): path is string => Boolean(path)).map((path) => this.normalize(path)));
      const changes = input.symbolAnalysis.symbolChanges.filter((symbol) => paths.has(this.normalize(symbol.filePath)));
      const changeKeys = new Set(changes.map((symbol) => symbol.key));
      const impacts = input.symbolAnalysis.symbolImpacts.filter((impact) =>
        changeKeys.has(impact.changedSymbolKey) ||
        impact.callChain.some((symbol) => paths.has(this.normalize(symbol.filePath))),
      );
      const changeChunks = this.chunk(changes, symbolLimit);
      const impactChunks = this.chunk(impacts, symbolLimit);
      const partCount = Math.max(1, changeChunks.length, impactChunks.length);

      for (let part = 0; part < partCount; part += 1) {
        const symbolChanges = changeChunks[part] ?? [];
        const symbolImpacts = impactChunks[part] ?? [];
        const symbolKeys = new Set(symbolChanges.map((symbol) => symbol.key));
        batches.push({
          index: batches.length + 1,
          files: fileChunk,
          changeEvidence: input.changeEvidence.filter((item) =>
            paths.has(this.normalize(item.filePath)) ||
            Boolean(item.oldPath && paths.has(this.normalize(item.oldPath))),
          ),
          changeUnits: (input.changeUnits ?? []).filter((unit) => paths.has(this.normalize(unit.filePath))),
          ruleSuggestions: input.ruleAnalysis.regressionSuggestions.filter((suggestion) =>
            (suggestion.sourceSymbolKeys ?? []).some((key) => symbolKeys.has(key)) ||
            (suggestion.evidence ?? []).some((evidence) =>
              [...paths].some((path) => evidence.toLowerCase().replace(/\\/g, '/').includes(path)),
            ),
          ),
          symbolChanges,
          symbolImpacts,
        });
      }
    }

    return batches;
  }

  private filePriority(file: ChangedFile) {
    const path = file.path.toLowerCase();
    let score = Math.min(file.additions + file.deletions, 200);
    if (file.changeType === 'D') score += 300;
    if (/(database|migrations?|schema|\.sql$)/.test(path)) score += 500;
    if (/(controller|router|routes?|dto|contract|openapi|graphql)/.test(path)) score += 400;
    if (/(auth|permission|payment|billing|approval)/.test(path)) score += 350;
    return score;
  }

  private chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
    return chunks;
  }

  private chunkFiles(files: ChangedFile[], maxFiles: number, evidence: ChangeEvidence[]) {
    const patchSize = new Map(evidence.flatMap((item) => [
      [this.normalize(item.filePath), item.patch.length] as const,
      ...(item.oldPath ? [[this.normalize(item.oldPath), item.patch.length] as const] : []),
    ]));
    const maxPatchCharacters = 40_000;
    const chunks: ChangedFile[][] = [];
    let current: ChangedFile[] = [];
    let characters = 0;
    for (const file of files) {
      const size = patchSize.get(this.normalize(file.path)) ?? 0;
      if (current.length && (current.length >= maxFiles || characters + size > maxPatchCharacters)) {
        chunks.push(current);
        current = [];
        characters = 0;
      }
      current.push(file);
      characters += size;
    }
    if (current.length) chunks.push(current);
    return chunks;
  }

  private normalize(path: string) {
    return path.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  }
}
