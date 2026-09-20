import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dirname, join, posix, resolve } from 'node:path';
import simpleGit, { type SimpleGit } from 'simple-git';
import ts from 'typescript';
import type {
  CodeSymbolKind,
  CodeSymbolReference,
  RiskLevel,
  SymbolChange,
  SymbolImpact,
} from '@impact-flow/contracts';
import type {
  SymbolAnalysisResult,
  SymbolAnalyzerGateway,
} from '../../core/ports/symbol-analyzer.gateway';

type LineRange = { start: number; end: number };
type FileDiff = {
  oldPath: string | null;
  newPath: string | null;
  oldRanges: LineRange[];
  newRanges: LineRange[];
};

type PendingCall = {
  callerKey: string;
  className: string | null;
  expression: ts.Expression;
};

type ParsedFile = {
  path: string;
  symbols: CodeSymbolReference[];
  calls: PendingCall[];
  imports: Map<string, { source: string; imported: string }>;
  dependencyTypes: Map<string, string>;
};

type RepositoryModel = {
  symbols: Map<string, CodeSymbolReference>;
  files: Map<string, ParsedFile>;
  reverseCalls: Map<string, Set<string>>;
};

@Injectable()
export class TypeScriptSymbolAnalyzer implements SymbolAnalyzerGateway {
  constructor(private readonly config: ConfigService) {}

  async analyzeRange(input: {
    projectId: string;
    baseCommit: string;
    targetCommit: string;
  }): Promise<SymbolAnalysisResult> {
    const git = simpleGit(this.repositoryPath(input.projectId));
    const patch = await git.raw([
      'diff',
      '--unified=0',
      '--no-color',
      input.baseCommit,
      input.targetCommit,
      '--',
      '*.ts',
      '*.tsx',
    ]);
    const diffs = this.parseDiff(patch);
    if (!diffs.length) return this.emptyResult();

    const changedTargetPaths = new Set(
      diffs.map((item) => item.newPath).filter((path): path is string => Boolean(path)),
    );
    const targetPaths = await this.listSourceFiles(git, input.targetCommit);
    const orderedTargetPaths = [
      ...targetPaths.filter((path) => changedTargetPaths.has(path)),
      ...targetPaths.filter((path) => !changedTargetPaths.has(path)),
    ];
    const maxFiles = Number(this.config.get('SYMBOL_ANALYSIS_MAX_FILES') ?? 1500);
    const targetSources = await this.readSources(
      git,
      input.targetCommit,
      orderedTargetPaths.slice(0, maxFiles),
    );
    const targetModel = this.buildModel(targetSources);

    const basePaths = [...new Set(
      diffs.map((item) => item.oldPath).filter((path): path is string => Boolean(path)),
    )];
    const baseSources = await this.readSources(git, input.baseCommit, basePaths);
    const baseModel = this.buildModel(baseSources);
    const symbolChanges = this.findChanges(diffs, baseModel, targetModel);
    const symbolImpacts = this.findImpacts(symbolChanges, targetModel, 3);
    const analyzedFileCount = targetModel.files.size;

    return {
      symbolSummary: symbolChanges.length
        ? `识别到 ${symbolChanges.length} 个变更 Symbol，追踪到 ${symbolImpacts.length} 个上游调用影响（已扫描 ${analyzedFileCount} 个 TypeScript 文件）`
        : `TypeScript 文件存在变更，但未映射到可识别的代码 Symbol（已扫描 ${analyzedFileCount} 个文件）`,
      symbolChanges,
      symbolImpacts,
    };
  }

  private emptyResult(): SymbolAnalysisResult {
    return {
      symbolSummary: '本次变更不包含 TypeScript Symbol',
      symbolChanges: [],
      symbolImpacts: [],
    };
  }

  private repositoryPath(projectId: string) {
    const configuredCache = this.config.get<string>('REPOSITORY_CACHE_DIR');
    const cacheRoot = configuredCache
      ? resolve(configuredCache)
      : resolve(__dirname, '../../../../../var/repositories');
    return join(cacheRoot, projectId);
  }

  private async listSourceFiles(git: SimpleGit, commit: string) {
    const output = await git.raw(['ls-tree', '-r', '--name-only', commit]);
    return output
      .split(/\r?\n/)
      .map((path) => this.normalizePath(path))
      .filter((path) =>
        /\.(ts|tsx)$/.test(path) &&
        !path.endsWith('.d.ts') &&
        !/(^|\/)(node_modules|dist|build|coverage|vendor|generated)(\/|$)/.test(path),
      );
  }

  private async readSources(
    git: SimpleGit,
    commit: string,
    paths: string[],
  ): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const batchSize = 12;
    for (let index = 0; index < paths.length; index += batchSize) {
      const batch = paths.slice(index, index + batchSize);
      const contents = await Promise.all(
        batch.map(async (path) => {
          try {
            const content = await git.show([`${commit}:${path}`]);
            return content.length <= 1_000_000 ? ([path, content] as const) : null;
          } catch {
            return null;
          }
        }),
      );
      for (const item of contents) if (item) result.set(item[0], item[1]);
    }
    return result;
  }

  private buildModel(sources: Map<string, string>): RepositoryModel {
    const files = new Map<string, ParsedFile>();
    const symbols = new Map<string, CodeSymbolReference>();
    for (const [path, source] of sources) {
      const parsed = this.parseSource(path, source);
      files.set(path, parsed);
      for (const symbol of parsed.symbols) symbols.set(symbol.key, symbol);
    }

    const reverseCalls = new Map<string, Set<string>>();
    for (const file of files.values()) {
      for (const call of file.calls) {
        const target = this.resolveCall(call, file, files, symbols);
        if (!target || target === call.callerKey) continue;
        const callers = reverseCalls.get(target) ?? new Set<string>();
        callers.add(call.callerKey);
        reverseCalls.set(target, callers);
      }
    }
    return { symbols, files, reverseCalls };
  }

  private parseSource(path: string, source: string): ParsedFile {
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const symbols: CodeSymbolReference[] = [];
    const calls: PendingCall[] = [];
    const imports = new Map<string, { source: string; imported: string }>();
    const dependencyTypes = new Map<string, string>();

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const sourcePath = statement.moduleSpecifier.text;
        const clause = statement.importClause;
        if (clause?.name) imports.set(clause.name.text, { source: sourcePath, imported: 'default' });
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const item of bindings.elements) {
            imports.set(item.name.text, {
              source: sourcePath,
              imported: item.propertyName?.text ?? item.name.text,
            });
          }
        }
        continue;
      }

      if (ts.isClassDeclaration(statement) && statement.name) {
        const className = statement.name.text;
        symbols.push(this.toSymbol(path, sourceFile, statement, className, 'CLASS'));
        for (const member of statement.members) {
          if (ts.isConstructorDeclaration(member)) {
            for (const parameter of member.parameters) {
              if (ts.isIdentifier(parameter.name) && parameter.type) {
                dependencyTypes.set(
                  `${className}:${parameter.name.text}`,
                  this.typeName(parameter.type),
                );
              }
            }
            continue;
          }
          if (ts.isMethodDeclaration(member) && member.name) {
            const name = this.nodeName(member.name);
            if (!name) continue;
            const symbol = this.toSymbol(
              path,
              sourceFile,
              member,
              `${className}.${name}`,
              'METHOD',
            );
            symbols.push(symbol);
            this.collectCalls(member, symbol.key, className, calls);
          } else if (ts.isPropertyDeclaration(member) && member.name) {
            const name = this.nodeName(member.name);
            if (!name) continue;
            symbols.push(this.toSymbol(
              path,
              sourceFile,
              member,
              `${className}.${name}`,
              'PROPERTY',
            ));
            if (member.type) dependencyTypes.set(`${className}:${name}`, this.typeName(member.type));
          }
        }
        continue;
      }

      if (ts.isInterfaceDeclaration(statement)) {
        const interfaceName = statement.name.text;
        symbols.push(this.toSymbol(path, sourceFile, statement, interfaceName, 'INTERFACE'));
        for (const member of statement.members) {
          if ((ts.isMethodSignature(member) || ts.isPropertySignature(member)) && member.name) {
            const name = this.nodeName(member.name);
            if (!name) continue;
            symbols.push(this.toSymbol(
              path,
              sourceFile,
              member,
              `${interfaceName}.${name}`,
              ts.isMethodSignature(member) ? 'METHOD' : 'PROPERTY',
            ));
          }
        }
        continue;
      }

      if (ts.isTypeAliasDeclaration(statement)) {
        symbols.push(this.toSymbol(path, sourceFile, statement, statement.name.text, 'TYPE'));
        continue;
      }

      if (ts.isFunctionDeclaration(statement) && statement.name) {
        const symbol = this.toSymbol(path, sourceFile, statement, statement.name.text, 'FUNCTION');
        symbols.push(symbol);
        this.collectCalls(statement, symbol.key, null, calls);
        continue;
      }

      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
          ) {
            const symbol = this.toSymbol(
              path,
              sourceFile,
              declaration,
              declaration.name.text,
              'FUNCTION',
            );
            symbols.push(symbol);
            this.collectCalls(declaration.initializer, symbol.key, null, calls);
          }
        }
      }
    }
    return { path, symbols, calls, imports, dependencyTypes };
  }

  private collectCalls(
    node: ts.Node,
    callerKey: string,
    className: string | null,
    calls: PendingCall[],
  ) {
    const visit = (child: ts.Node) => {
      if (ts.isCallExpression(child)) {
        calls.push({ callerKey, className, expression: child.expression });
      }
      ts.forEachChild(child, visit);
    };
    ts.forEachChild(node, visit);
  }

  private resolveCall(
    call: PendingCall,
    file: ParsedFile,
    files: Map<string, ParsedFile>,
    symbols: Map<string, CodeSymbolReference>,
  ): string | null {
    const expression = call.expression;
    if (ts.isIdentifier(expression)) {
      const localKey = `${file.path}#${expression.text}`;
      if (symbols.has(localKey)) return localKey;
      return this.resolveImported(file, expression.text, null, files, symbols);
    }
    if (!ts.isPropertyAccessExpression(expression)) return null;
    const methodName = expression.name.text;
    if (expression.expression.kind === ts.SyntaxKind.ThisKeyword && call.className) {
      const key = `${file.path}#${call.className}.${methodName}`;
      return symbols.has(key) ? key : null;
    }
    let owner: string | null = null;
    if (ts.isIdentifier(expression.expression)) {
      owner = expression.expression.text;
    } else if (
      ts.isPropertyAccessExpression(expression.expression) &&
      expression.expression.expression.kind === ts.SyntaxKind.ThisKeyword
    ) {
      owner = expression.expression.name.text;
    }
    if (!owner) return null;
    if (call.className) {
      const type = file.dependencyTypes.get(`${call.className}:${owner}`);
      if (type) {
        const importedType = file.imports.get(type);
        if (importedType?.source.startsWith('.')) {
          const targetPath = this.resolveImportPath(file.path, importedType.source, files);
          const importedName = importedType.imported === 'default' ? type : importedType.imported;
          const exactKey = targetPath ? `${targetPath}#${importedName}.${methodName}` : null;
          if (exactKey && symbols.has(exactKey)) return exactKey;
        }
        const match = [...symbols.values()].find(
          (symbol) => symbol.kind === 'METHOD' && symbol.qualifiedName === `${type}.${methodName}`,
        );
        if (match) return match.key;
      }
    }
    return this.resolveImported(file, owner, methodName, files, symbols);
  }

  private resolveImported(
    file: ParsedFile,
    localName: string,
    memberName: string | null,
    files: Map<string, ParsedFile>,
    symbols: Map<string, CodeSymbolReference>,
  ) {
    const binding = file.imports.get(localName);
    if (!binding || !binding.source.startsWith('.')) return null;
    const targetPath = this.resolveImportPath(file.path, binding.source, files);
    if (!targetPath) return null;
    const importedName = binding.imported === 'default' ? localName : binding.imported;
    const qualifiedName = memberName ? `${importedName}.${memberName}` : importedName;
    const key = `${targetPath}#${qualifiedName}`;
    return symbols.has(key) ? key : null;
  }

  private resolveImportPath(
    sourceFile: string,
    specifier: string,
    files: Map<string, ParsedFile>,
  ) {
    const base = this.normalizePath(posix.join(dirname(sourceFile).replace(/\\/g, '/'), specifier));
    const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
    return candidates.find((candidate) => files.has(candidate)) ?? null;
  }

  private findChanges(
    diffs: FileDiff[],
    base: RepositoryModel,
    target: RepositoryModel,
  ): SymbolChange[] {
    const changes = new Map<string, SymbolChange>();
    for (const diff of diffs) {
      if (diff.newPath) {
        const targetSymbols = target.files.get(diff.newPath)?.symbols ?? [];
        const oldKeys = new Set(base.files.get(diff.oldPath ?? diff.newPath)?.symbols.map((item) => item.key));
        for (const symbol of targetSymbols) {
          if (!this.intersects(symbol, diff.newRanges) && oldKeys.has(symbol.key)) continue;
          const changeType = oldKeys.has(symbol.key) ? 'MODIFIED' : 'ADDED';
          changes.set(symbol.key, this.toChange(symbol, changeType));
        }
      }
      if (diff.oldPath) {
        const baseSymbols = base.files.get(diff.oldPath)?.symbols ?? [];
        for (const symbol of baseSymbols) {
          const targetKey = diff.newPath
            ? `${diff.newPath}#${symbol.qualifiedName}`
            : symbol.key;
          if (target.symbols.has(targetKey)) continue;
          if (diff.oldRanges.length && !this.intersects(symbol, diff.oldRanges)) continue;
          changes.set(symbol.key, this.toChange(symbol, 'DELETED'));
        }
      }
    }
    return [...changes.values()].sort((a, b) =>
      a.filePath.localeCompare(b.filePath) || a.startLine - b.startLine,
    ).slice(0, 100);
  }

  private findImpacts(
    changes: SymbolChange[],
    model: RepositoryModel,
    maxDepth: number,
  ): SymbolImpact[] {
    const impacts = new Map<string, SymbolImpact>();
    for (const change of changes) {
      if (change.changeType === 'DELETED') continue;
      const start = model.symbols.get(change.key);
      if (!start) continue;
      const queue: Array<{ key: string; chain: CodeSymbolReference[]; depth: number }> = [
        { key: change.key, chain: [start], depth: 0 },
      ];
      const visited = new Set([change.key]);
      while (queue.length) {
        const current = queue.shift()!;
        if (current.depth >= maxDepth) continue;
        for (const callerKey of model.reverseCalls.get(current.key) ?? []) {
          if (visited.has(callerKey)) continue;
          visited.add(callerKey);
          const caller = model.symbols.get(callerKey);
          if (!caller) continue;
          const callChain = [caller, ...current.chain];
          const depth = current.depth + 1;
          impacts.set(`${change.key}:${callerKey}`, {
            changedSymbolKey: change.key,
            impactedSymbol: caller,
            depth,
            callChain,
            reason: `通过 ${depth} 层调用依赖受影响`,
          });
          queue.push({ key: callerKey, chain: callChain, depth });
        }
      }
    }
    return [...impacts.values()].sort((a, b) => a.depth - b.depth).slice(0, 200);
  }

  private parseDiff(output: string): FileDiff[] {
    const diffs: FileDiff[] = [];
    let current: FileDiff | null = null;
    for (const line of output.split(/\r?\n/)) {
      if (line.startsWith('diff --git ')) {
        current = { oldPath: null, newPath: null, oldRanges: [], newRanges: [] };
        diffs.push(current);
      } else if (current && line.startsWith('--- ')) {
        current.oldPath = this.diffPath(line.slice(4));
      } else if (current && line.startsWith('+++ ')) {
        current.newPath = this.diffPath(line.slice(4));
      } else if (current && line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (!match) continue;
        const oldCount = match[2] === undefined ? 1 : Number(match[2]);
        const newCount = match[4] === undefined ? 1 : Number(match[4]);
        if (oldCount) current.oldRanges.push({ start: Number(match[1]), end: Number(match[1]) + oldCount - 1 });
        if (newCount) current.newRanges.push({ start: Number(match[3]), end: Number(match[3]) + newCount - 1 });
      }
    }
    return diffs.filter((item) => item.oldPath || item.newPath);
  }

  private diffPath(raw: string) {
    const path = raw.trim();
    if (path === '/dev/null') return null;
    return this.normalizePath(path.replace(/^[ab]\//, ''));
  }

  private toSymbol(
    path: string,
    sourceFile: ts.SourceFile,
    node: ts.Node,
    qualifiedName: string,
    kind: CodeSymbolKind,
  ): CodeSymbolReference {
    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    return {
      key: `${path}#${qualifiedName}`,
      name: qualifiedName.split('.').at(-1) ?? qualifiedName,
      qualifiedName,
      kind,
      filePath: path,
      startLine,
      endLine,
    };
  }

  private toChange(
    symbol: CodeSymbolReference,
    changeType: SymbolChange['changeType'],
  ): SymbolChange {
    const riskLevel = this.symbolRisk(symbol, changeType);
    const labels = { ADDED: '新增', MODIFIED: '修改', DELETED: '删除' } as const;
    return {
      ...symbol,
      changeType,
      riskLevel,
      reason: `${labels[changeType]}${this.kindLabel(symbol.kind)} ${symbol.qualifiedName}`,
    };
  }

  private symbolRisk(symbol: CodeSymbolReference, changeType: SymbolChange['changeType']): RiskLevel {
    if (changeType === 'DELETED') return 'HIGH';
    if (symbol.kind === 'INTERFACE' || symbol.kind === 'TYPE') return 'HIGH';
    if (symbol.kind === 'METHOD' && /(Controller|Repository|Gateway)\./.test(symbol.qualifiedName)) {
      return 'HIGH';
    }
    return symbol.kind === 'METHOD' || symbol.kind === 'FUNCTION' ? 'MEDIUM' : 'LOW';
  }

  private kindLabel(kind: CodeSymbolKind) {
    return ({
      CLASS: '类',
      METHOD: '方法',
      FUNCTION: '函数',
      INTERFACE: '接口',
      TYPE: '类型',
      PROPERTY: '属性',
    } as const)[kind];
  }

  private intersects(symbol: CodeSymbolReference, ranges: LineRange[]) {
    return ranges.some((range) => symbol.startLine <= range.end && symbol.endLine >= range.start);
  }

  private nodeName(node: ts.PropertyName) {
    if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
    return null;
  }

  private typeName(type: ts.TypeNode) {
    if (ts.isTypeReferenceNode(type)) {
      return ts.isIdentifier(type.typeName) ? type.typeName.text : type.typeName.getText();
    }
    return type.getText().replace(/<.*$/, '');
  }

  private normalizePath(path: string) {
    return path.replace(/\\/g, '/').replace(/^\.\//, '');
  }
}
