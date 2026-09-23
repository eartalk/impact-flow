import type { ChangedFile, ChangeKind, ChangeUnit, SymbolChange } from '@impact-flow/contracts';

/**
 * 将 AST/Symbol 层事实翻译成稳定的语义变更单元。
 * 这里只做可复现的分类；业务解释由后续回归规划器和 AI 完成。
 */
export class ChangeInterpreter {
  interpret(symbols: SymbolChange[], files: ChangedFile[]): ChangeUnit[] {
    if (symbols.length) {
      return symbols.map((symbol, index) => ({
        id: `symbol:${symbol.key}`,
        symbolKey: symbol.key,
        title: symbol.qualifiedName || symbol.name,
        filePath: symbol.filePath,
        startLine: symbol.startLine,
        changeType: symbol.changeType,
        changeKind: this.classify(symbol.filePath, symbol.reason, symbol.httpRoutes?.length),
        summary: symbol.reason,
        riskLevel: symbol.riskLevel,
        evidence: [
          `${symbol.filePath}:${symbol.startLine}`,
          ...(symbol.httpRoutes ?? []).map((route) => `${route.method} ${route.path}`),
        ],
      } satisfies ChangeUnit));
    }

    return files.map((file, index) => ({
      id: `file:${index}:${file.path}`,
      title: file.path.split('/').at(-1) ?? file.path,
      filePath: file.path,
      changeType: file.changeType === 'D' ? 'DELETED' : file.changeType === 'A' ? 'ADDED' : 'MODIFIED',
      changeKind: this.classify(file.path, '', 0),
      summary: `${file.changeType} 文件，新增 ${file.additions} 行，删除 ${file.deletions} 行`,
      riskLevel: this.fileRisk(file.path, file.additions + file.deletions),
      evidence: [file.path],
    } satisfies ChangeUnit));
  }

  private classify(path: string, reason: string, routeCount = 0): ChangeKind {
    const value = `${path} ${reason}`.toLowerCase();
    if (/(migration|schema|entity|repository|\.sql)/.test(value)) return 'DATA';
    if (/(config|\.ya?ml|\.toml|dockerfile|package\.json|lock)/.test(value)) return 'CONFIG';
    if (routeCount || /(controller|router|dto|contract|openapi|graphql)/.test(value)) return 'CONTRACT';
    if (/(valid|guard|permission|auth|check|limit)/.test(value)) return 'VALIDATION';
    if (/(rename|move|extract|refactor|format)/.test(value)) return 'REFACTOR';
    return 'BEHAVIOR';
  }

  private fileRisk(path: string, changedLines: number): ChangeUnit['riskLevel'] {
    if (/(auth|payment|billing|permission|migration|schema)/i.test(path)) return 'HIGH';
    if (changedLines >= 150) return 'HIGH';
    if (changedLines >= 30) return 'MEDIUM';
    return 'LOW';
  }
}
