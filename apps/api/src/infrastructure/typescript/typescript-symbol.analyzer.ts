import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dirname, join, posix, resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import simpleGit, { type SimpleGit } from 'simple-git';
import ts from 'typescript';
import type {
  CodeSymbolKind,
  CodeSymbolReference,
  HttpRouteReference,
  RiskLevel,
  SymbolChange,
  SymbolImpact,
} from '@impact-flow/contracts';
import { BusinessImpactResolver } from '../../core/services/business-impact.resolver';
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
  call: ts.CallExpression;
};

type HttpRoute = HttpRouteReference & {
  symbolKey: string;
  projectId: string;
};

type ParsedFile = {
  projectId: string;
  projectName: string;
  path: string;
  fileKey: string;
  symbols: CodeSymbolReference[];
  calls: PendingCall[];
  imports: Map<string, { source: string; imported: string }>;
  dependencyTypes: Map<string, string>;
  implementations: Map<string, string[]>;
  serverRoutes: HttpRoute[];
  clientRequests: HttpRoute[];
};

type SourceUnit = {
  projectId: string;
  projectName: string;
  path: string;
  source: string;
};

type RepositoryModel = {
  symbols: Map<string, CodeSymbolReference>;
  files: Map<string, ParsedFile>;
  reverseCalls: Map<string, Set<string>>;
  projectAliases: Map<string, string>;
};

@Injectable()
export class TypeScriptSymbolAnalyzer implements SymbolAnalyzerGateway {
  private readonly business = new BusinessImpactResolver();

  constructor(private readonly config: ConfigService) {}

  async analyzeRange(input: {
    projectId: string;
    projectName: string;
    baseCommit: string;
    targetCommit: string;
    relatedRepositories?: Array<{
      projectId: string;
      projectName: string;
      targetCommit: string;
    }>;
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
      '*.vue',
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
    const maxFiles = 1500;
    const targetSources = await this.readSources(
      git,
      input.targetCommit,
      orderedTargetPaths.slice(0, maxFiles),
      input.projectId,
      input.projectName,
    );
    const projectAliases = new Map<string, string>();
    await this.registerProjectAlias(git, input.targetCommit, input.projectId, projectAliases);

    let relatedProjectCount = 0;
    let relatedProjectFailureCount = 0;
    const maxRelatedProjects = 5;
    const relatedMaxFiles = 500;
    for (const related of (input.relatedRepositories ?? []).slice(0, maxRelatedProjects)) {
      const repositoryPath = this.repositoryPath(related.projectId);
      if (!(await this.exists(repositoryPath))) continue;
      const relatedGit = simpleGit(repositoryPath);
      try {
        const relatedPaths = await this.listSourceFiles(relatedGit, related.targetCommit);
        const relatedSources = await this.readSources(
          relatedGit,
          related.targetCommit,
          relatedPaths.slice(0, relatedMaxFiles),
          related.projectId,
          related.projectName,
        );
        targetSources.push(...relatedSources);
        await this.registerProjectAlias(
          relatedGit,
          related.targetCommit,
          related.projectId,
          projectAliases,
        );
        relatedProjectCount += 1;
      } catch {
        // Related repositories are best-effort and must not fail the primary analysis.
        relatedProjectFailureCount += 1;
      }
    }
    const targetModel = this.buildModel(targetSources, projectAliases);

    const basePaths = [...new Set(
      diffs.map((item) => item.oldPath).filter((path): path is string => Boolean(path)),
    )];
    const baseSources = await this.readSources(
      git,
      input.baseCommit,
      basePaths,
      input.projectId,
      input.projectName,
    );
    const baseModel = this.buildModel(baseSources, projectAliases);
    const symbolChanges = this.findChanges(diffs, baseModel, targetModel, input.projectId);
    const symbolImpacts = this.findImpacts(symbolChanges, targetModel, 6);
    const analyzedFileCount = targetModel.files.size;
    const crossRepositoryImpacts = symbolImpacts.filter(
      (item) => item.impactedSymbol.projectId !== input.projectId,
    ).length;
    const httpRouteImpacts = symbolImpacts.filter(
      (item) => item.reason.startsWith('通过 HTTP '),
    ).length;
    const limitationNotes = [
      targetPaths.length > maxFiles
        ? `主仓库仅扫描前 ${maxFiles}/${targetPaths.length} 个源码文件`
        : null,
      (input.relatedRepositories?.length ?? 0) > maxRelatedProjects
        ? `相关仓库仅扫描前 ${maxRelatedProjects}/${input.relatedRepositories?.length} 个`
        : null,
      relatedProjectFailureCount
        ? `${relatedProjectFailureCount} 个相关仓库读取失败`
        : null,
    ].filter(Boolean);
    const limitationSummary = limitationNotes.length
      ? `；分析范围受限：${limitationNotes.join('、')}`
      : '';

    return {
      symbolSummary: symbolChanges.length
        ? `识别到 ${symbolChanges.length} 个变更 Symbol，追踪到 ${symbolImpacts.length} 个上游调用影响${crossRepositoryImpacts ? `，其中 ${crossRepositoryImpacts} 个跨仓库影响` : ''}${httpRouteImpacts ? `、${httpRouteImpacts} 个 HTTP 路由影响` : ''}（已扫描 ${analyzedFileCount} 个 TypeScript/Vue 文件、${relatedProjectCount} 个相关仓库）${limitationSummary}`
        : `TypeScript/Vue 文件存在变更，但未映射到可识别的代码 Symbol（已扫描 ${analyzedFileCount} 个文件）${limitationSummary}`,
      symbolChanges,
      symbolImpacts,
    };
  }

  private emptyResult(): SymbolAnalysisResult {
    return {
      symbolSummary: '本次变更不包含 TypeScript/Vue Symbol',
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
        /\.(ts|tsx|vue)$/.test(path) &&
        !path.endsWith('.d.ts') &&
        !/(^|\/)(node_modules|dist|build|coverage|vendor|generated)(\/|$)/.test(path),
      );
  }

  private async readSources(
    git: SimpleGit,
    commit: string,
    paths: string[],
    projectId: string,
    projectName: string,
  ): Promise<SourceUnit[]> {
    const result: SourceUnit[] = [];
    const batchSize = 12;
    for (let index = 0; index < paths.length; index += batchSize) {
      const batch = paths.slice(index, index + batchSize);
      const contents = await Promise.all(
        batch.map(async (path) => {
          try {
            const content = await git.show([`${commit}:${path}`]);
            return content.length <= 1_000_000
              ? ({ projectId, projectName, path, source: content } satisfies SourceUnit)
              : null;
          } catch {
            return null;
          }
        }),
      );
      for (const item of contents) if (item) result.push(item);
    }
    return result;
  }

  private buildModel(
    sources: SourceUnit[],
    projectAliases: Map<string, string>,
  ): RepositoryModel {
    const files = new Map<string, ParsedFile>();
    const symbols = new Map<string, CodeSymbolReference>();
    for (const source of sources) {
      const parsed = this.parseSource(source);
      files.set(parsed.fileKey, parsed);
      for (const symbol of parsed.symbols) symbols.set(symbol.key, symbol);
    }

    const reverseCalls = new Map<string, Set<string>>();
    for (const file of files.values()) {
      for (const call of file.calls) {
        const target = this.resolveCall(
          call,
          file,
          files,
          symbols,
          projectAliases,
        );
        if (!target || target === call.callerKey) continue;
        const callers = reverseCalls.get(target) ?? new Set<string>();
        callers.add(call.callerKey);
        reverseCalls.set(target, callers);
      }
    }
    this.linkInterfaceImplementations(
      files,
      symbols,
      reverseCalls,
      projectAliases,
    );
    this.linkHttpRoutes(files, symbols, reverseCalls);
    return { symbols, files, reverseCalls, projectAliases };
  }

  private parseSource(unit: SourceUnit): ParsedFile {
    const { projectId, projectName, path } = unit;
    const source = path.endsWith('.vue')
      ? this.extractVueScript(unit.source)
      : unit.source;
    const sourceFile = ts.createSourceFile(
      path,
      source,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith('.tsx') || path.endsWith('.vue')
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS,
    );
    const symbols: CodeSymbolReference[] = [];
    const calls: PendingCall[] = [];
    const imports = new Map<string, { source: string; imported: string }>();
    const dependencyTypes = new Map<string, string>();
    const implementations = new Map<string, string[]>();
    const serverRoutes: HttpRoute[] = [];
    const clientRequests: HttpRoute[] = [];
    const axiosBindings = new Set<string>(['axios']);
    const symbolFor = (
      node: ts.Node,
      qualifiedName: string,
      kind: CodeSymbolKind,
    ) => this.toSymbol(
      projectId,
      projectName,
      path,
      sourceFile,
      node,
      qualifiedName,
      kind,
    );

    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
        const sourcePath = statement.moduleSpecifier.text;
        const clause = statement.importClause;
        if (clause?.name) {
          imports.set(clause.name.text, { source: sourcePath, imported: 'default' });
          if (sourcePath === 'axios') axiosBindings.add(clause.name.text);
        }
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const item of bindings.elements) {
            imports.set(item.name.text, {
              source: sourcePath,
              imported: item.propertyName?.text ?? item.name.text,
            });
            if (sourcePath === 'axios') axiosBindings.add(item.name.text);
          }
        }
      }
    }
    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          this.isAxiosCreateCall(declaration.initializer, axiosBindings)
        ) {
          axiosBindings.add(declaration.name.text);
        }
      }
    }

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
        const controllerPath = this.controllerPath(statement, imports);
        symbols.push(symbolFor(statement, className, 'CLASS'));
        const implementedTypes = statement.heritageClauses
          ?.filter((clause) => clause.token === ts.SyntaxKind.ImplementsKeyword)
          .flatMap((clause) => clause.types.map((type) => type.expression.getText())) ?? [];
        if (implementedTypes.length) implementations.set(className, implementedTypes);
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
            const symbol = symbolFor(
              member,
              `${className}.${name}`,
              'METHOD',
            );
            symbols.push(symbol);
            if (controllerPath !== null) {
              for (const route of this.methodRoutes(member, controllerPath, imports)) {
                serverRoutes.push({
                  ...route,
                  symbolKey: symbol.key,
                  projectId,
                });
              }
            }
            this.collectCalls(
              member,
              symbol.key,
              className,
              calls,
              clientRequests,
              projectId,
              axiosBindings,
            );
          } else if (ts.isPropertyDeclaration(member) && member.name) {
            const name = this.nodeName(member.name);
            if (!name) continue;
            symbols.push(symbolFor(
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
        symbols.push(symbolFor(statement, interfaceName, 'INTERFACE'));
        for (const member of statement.members) {
          if ((ts.isMethodSignature(member) || ts.isPropertySignature(member)) && member.name) {
            const name = this.nodeName(member.name);
            if (!name) continue;
            symbols.push(symbolFor(
              member,
              `${interfaceName}.${name}`,
              ts.isMethodSignature(member) ? 'METHOD' : 'PROPERTY',
            ));
          }
        }
        continue;
      }

      if (ts.isTypeAliasDeclaration(statement)) {
        symbols.push(symbolFor(statement, statement.name.text, 'TYPE'));
        continue;
      }

      if (ts.isFunctionDeclaration(statement) && statement.name) {
        const symbol = symbolFor(statement, statement.name.text, 'FUNCTION');
        symbols.push(symbol);
        this.collectCalls(
          statement,
          symbol.key,
          null,
          calls,
          clientRequests,
          projectId,
          axiosBindings,
        );
        continue;
      }

      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (
            ts.isIdentifier(declaration.name) &&
            declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))
          ) {
            const symbol = symbolFor(
              declaration,
              declaration.name.text,
              'FUNCTION',
            );
            symbols.push(symbol);
            this.collectCalls(
              declaration.initializer,
              symbol.key,
              null,
              calls,
              clientRequests,
              projectId,
              axiosBindings,
            );
          }
        }
      }
    }
    return {
      projectId,
      projectName,
      path,
      fileKey: this.fileKey(projectId, path),
      symbols,
      calls,
      imports,
      dependencyTypes,
      implementations,
      serverRoutes,
      clientRequests,
    };
  }

  private collectCalls(
    node: ts.Node,
    callerKey: string,
    className: string | null,
    calls: PendingCall[],
    clientRequests: HttpRoute[],
    projectId: string,
    axiosBindings: Set<string>,
  ) {
    const visit = (child: ts.Node) => {
      if (ts.isCallExpression(child)) {
        calls.push({ callerKey, className, call: child });
        const request = this.httpClientRequest(child, axiosBindings);
        if (request) {
          clientRequests.push({
            ...request,
            symbolKey: callerKey,
            projectId,
          });
        }
      }
      ts.forEachChild(child, visit);
    };
    ts.forEachChild(node, visit);
  }

  private controllerPath(
    node: ts.ClassDeclaration,
    imports: Map<string, { source: string; imported: string }>,
  ) {
    const decorator = this.decorators(node).find(
      (item) => this.decoratorName(item, imports) === 'Controller',
    );
    if (!decorator) return null;
    const expression = decorator.expression;
    if (!ts.isCallExpression(expression) || !expression.arguments.length) return '';
    return this.staticString(expression.arguments[0]) ?? '';
  }

  private methodRoutes(
    node: ts.MethodDeclaration,
    controllerPath: string,
    imports: Map<string, { source: string; imported: string }>,
  ): HttpRouteReference[] {
    const methods: Record<string, string> = {
      Get: 'GET',
      Post: 'POST',
      Put: 'PUT',
      Patch: 'PATCH',
      Delete: 'DELETE',
      Head: 'HEAD',
      Options: 'OPTIONS',
      All: 'ALL',
    };
    const routes: HttpRouteReference[] = [];
    for (const decorator of this.decorators(node)) {
      const name = this.decoratorName(decorator, imports);
      const method = name ? methods[name] : undefined;
      if (!method) continue;
      const expression = decorator.expression;
      const methodPath = ts.isCallExpression(expression) && expression.arguments.length
        ? this.staticString(expression.arguments[0])
        : '';
      if (methodPath === null) continue;
      routes.push({
        method,
        path: this.joinHttpPath(controllerPath, methodPath),
        role: 'SERVER',
      });
    }
    return routes;
  }

  private httpClientRequest(
    call: ts.CallExpression,
    axiosBindings: Set<string>,
  ): HttpRouteReference | null {
    const expression = call.expression;
    if (ts.isIdentifier(expression) && expression.text === 'fetch') {
      const path = this.staticString(call.arguments[0]);
      if (!path) return null;
      return {
        method: this.objectStringProperty(call.arguments[1], 'method')?.toUpperCase() ?? 'GET',
        path: this.normalizeHttpPath(path),
        role: 'CLIENT',
      };
    }

    if (ts.isIdentifier(expression) && axiosBindings.has(expression.text)) {
      const directPath = this.staticString(call.arguments[0]);
      if (directPath) {
        return {
          method: this.objectStringProperty(call.arguments[1], 'method')?.toUpperCase() ?? 'GET',
          path: this.normalizeHttpPath(directPath),
          role: 'CLIENT',
        };
      }
      const options = call.arguments[0];
      const path = this.objectStringProperty(options, 'url');
      if (!path) return null;
      return {
        method: this.objectStringProperty(options, 'method')?.toUpperCase() ?? 'GET',
        path: this.normalizeHttpPath(path),
        role: 'CLIENT',
      };
    }

    if (!ts.isPropertyAccessExpression(expression)) return null;
    if (!ts.isIdentifier(expression.expression)) return null;
    if (!axiosBindings.has(expression.expression.text)) return null;
    const methodName = expression.name.text.toLowerCase();
    const supportedMethods = new Set([
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'head',
      'options',
    ]);
    if (supportedMethods.has(methodName)) {
      const path = this.staticString(call.arguments[0]);
      return path
        ? { method: methodName.toUpperCase(), path: this.normalizeHttpPath(path), role: 'CLIENT' }
        : null;
    }
    if (methodName !== 'request') return null;
    const options = call.arguments[0];
    const path = this.objectStringProperty(options, 'url');
    if (!path) return null;
    return {
      method: this.objectStringProperty(options, 'method')?.toUpperCase() ?? 'GET',
      path: this.normalizeHttpPath(path),
      role: 'CLIENT',
    };
  }

  private isAxiosCreateCall(node: ts.Expression, axiosBindings: Set<string>) {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
      return false;
    }
    return ts.isIdentifier(node.expression.expression) &&
      axiosBindings.has(node.expression.expression.text) &&
      node.expression.name.text === 'create';
  }

  private objectStringProperty(node: ts.Expression | undefined, propertyName: string) {
    if (!node || !ts.isObjectLiteralExpression(node)) return null;
    const property = node.properties.find((item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) && this.nodeName(item.name) === propertyName,
    );
    return property ? this.staticString(property.initializer) : null;
  }

  private decorators(node: ts.Node) {
    return ts.canHaveDecorators(node) ? [...(ts.getDecorators(node) ?? [])] : [];
  }

  private decoratorName(
    decorator: ts.Decorator,
    imports: Map<string, { source: string; imported: string }>,
  ) {
    const expression = ts.isCallExpression(decorator.expression)
      ? decorator.expression.expression
      : decorator.expression;
    const localName = ts.isIdentifier(expression)
      ? expression.text
      : ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : null;
    if (!localName) return null;
    const binding = imports.get(localName);
    return binding?.source === '@nestjs/common' ? binding.imported : localName;
  }

  private staticString(node: ts.Expression | undefined): string | null {
    if (!node) return null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (ts.isTemplateExpression(node)) {
      return node.head.text + node.templateSpans.map((span) => `:param${span.literal.text}`).join('');
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = this.staticString(node.left);
      const right = this.staticString(node.right);
      if (left !== null && right !== null) return `${left}${right}`;
      if (left !== null) return `${left}:param`;
      if (right !== null) return `:param${right}`;
    }
    return null;
  }

  private resolveCall(
    call: PendingCall,
    file: ParsedFile,
    files: Map<string, ParsedFile>,
    symbols: Map<string, CodeSymbolReference>,
    projectAliases: Map<string, string>,
  ): string | null {
    const expression = call.call.expression;
    if (ts.isIdentifier(expression)) {
      const localKey = this.symbolKey(file.projectId, file.path, expression.text);
      if (symbols.has(localKey)) return localKey;
      return this.resolveImported(
        file,
        expression.text,
        null,
        files,
        symbols,
        projectAliases,
      );
    }
    if (!ts.isPropertyAccessExpression(expression)) return null;
    const methodName = expression.name.text;
    if (expression.expression.kind === ts.SyntaxKind.ThisKeyword && call.className) {
      const key = this.symbolKey(
        file.projectId,
        file.path,
        `${call.className}.${methodName}`,
      );
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
          const targetPath = this.resolveImportPath(file, importedType.source, files);
          const importedName = importedType.imported === 'default' ? type : importedType.imported;
          const exactKey = targetPath
            ? this.symbolKey(file.projectId, targetPath, `${importedName}.${methodName}`)
            : null;
          if (exactKey && symbols.has(exactKey)) return exactKey;
        }
        const externalProjectId = importedType && !importedType.source.startsWith('.')
          ? this.projectForImport(importedType.source, projectAliases)
          : null;
        const candidates = [...symbols.values()].filter(
          (symbol) =>
            symbol.kind === 'METHOD' &&
            symbol.qualifiedName === `${type}.${methodName}` &&
            (!externalProjectId || symbol.projectId === externalProjectId),
        );
        const match = candidates.find((symbol) => symbol.projectId === file.projectId)
          ?? (candidates.length === 1 ? candidates[0] : undefined);
        if (match) return match.key;
      }
    }
    return this.resolveImported(
      file,
      owner,
      methodName,
      files,
      symbols,
      projectAliases,
    );
  }

  private resolveImported(
    file: ParsedFile,
    localName: string,
    memberName: string | null,
    files: Map<string, ParsedFile>,
    symbols: Map<string, CodeSymbolReference>,
    projectAliases: Map<string, string>,
  ) {
    const binding = file.imports.get(localName);
    if (!binding) return null;
    const importedName = binding.imported === 'default' ? localName : binding.imported;
    const qualifiedName = memberName ? `${importedName}.${memberName}` : importedName;
    if (binding.source.startsWith('.')) {
      const targetPath = this.resolveImportPath(file, binding.source, files);
      if (!targetPath) return null;
      const key = this.symbolKey(file.projectId, targetPath, qualifiedName);
      return symbols.has(key) ? key : null;
    }

    const targetProjectId = this.projectForImport(binding.source, projectAliases);
    if (!targetProjectId) return null;
    const matches = [...symbols.values()].filter(
      (symbol) =>
        symbol.projectId === targetProjectId &&
        (symbol.qualifiedName === qualifiedName || symbol.name === qualifiedName),
    );
    return matches.length === 1 ? matches[0].key : null;
  }

  private resolveImportPath(
    sourceFile: ParsedFile,
    specifier: string,
    files: Map<string, ParsedFile>,
  ) {
    const base = this.normalizePath(
      posix.join(dirname(sourceFile.path).replace(/\\/g, '/'), specifier),
    );
    const candidates = [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.vue`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
      `${base}/index.vue`,
    ];
    return candidates.find((candidate) =>
      files.has(this.fileKey(sourceFile.projectId, candidate)),
    ) ?? null;
  }

  private linkInterfaceImplementations(
    files: Map<string, ParsedFile>,
    symbols: Map<string, CodeSymbolReference>,
    reverseCalls: Map<string, Set<string>>,
    projectAliases: Map<string, string>,
  ) {
    for (const file of files.values()) {
      for (const [className, interfaceNames] of file.implementations) {
        const implementationMethods = file.symbols.filter(
          (symbol) =>
            symbol.kind === 'METHOD' &&
            symbol.qualifiedName.startsWith(`${className}.`),
        );
        for (const interfaceName of interfaceNames) {
          const interfaceSymbol = this.resolveTypeSymbol(
            file,
            interfaceName,
            'INTERFACE',
            files,
            symbols,
            projectAliases,
          );
          if (!interfaceSymbol) continue;
          for (const implementationMethod of implementationMethods) {
            const methodName = implementationMethod.name;
            const interfaceMethod = [...symbols.values()].find(
              (symbol) =>
                symbol.projectId === interfaceSymbol.projectId &&
                symbol.filePath === interfaceSymbol.filePath &&
                symbol.kind === 'METHOD' &&
                symbol.qualifiedName === `${interfaceSymbol.qualifiedName}.${methodName}`,
            );
            if (!interfaceMethod) continue;
            this.addReverseEdge(
              reverseCalls,
              interfaceMethod.key,
              implementationMethod.key,
            );
            this.addReverseEdge(
              reverseCalls,
              implementationMethod.key,
              interfaceMethod.key,
            );
          }
        }
      }
    }
  }

  private linkHttpRoutes(
    files: Map<string, ParsedFile>,
    symbols: Map<string, CodeSymbolReference>,
    reverseCalls: Map<string, Set<string>>,
  ) {
    const serverRoutes = [...files.values()].flatMap((file) => file.serverRoutes);
    const clientRequests = [...files.values()].flatMap((file) => file.clientRequests);
    for (const route of [...serverRoutes, ...clientRequests]) {
      const symbol = symbols.get(route.symbolKey);
      if (!symbol) continue;
      const reference: HttpRouteReference = {
        method: route.method,
        path: route.path,
        role: route.role,
      };
      symbol.httpRoutes ??= [];
      if (!symbol.httpRoutes.some((item) =>
        item.method === reference.method &&
        item.path === reference.path &&
        item.role === reference.role,
      )) {
        symbol.httpRoutes.push(reference);
      }
    }

    for (const request of clientRequests) {
      const matches = serverRoutes.filter((route) =>
        route.projectId !== request.projectId &&
        this.httpRoutesMatch(route, request),
      );
      if (matches.length !== 1) continue;
      this.addReverseEdge(reverseCalls, matches[0].symbolKey, request.symbolKey);
    }
  }

  private httpRoutesMatch(
    server: Pick<HttpRouteReference, 'method' | 'path'>,
    client: Pick<HttpRouteReference, 'method' | 'path'>,
  ) {
    if (server.method !== 'ALL' && server.method !== client.method) return false;
    const serverSegments = this.httpPathSegments(server.path);
    const clientSegments = this.httpPathSegments(client.path);
    if (serverSegments.length !== clientSegments.length) return false;
    return serverSegments.every((segment, index) =>
      segment.startsWith(':') ||
      clientSegments[index]?.startsWith(':') ||
      segment === clientSegments[index],
    );
  }

  private httpPathSegments(path: string) {
    return this.normalizeHttpPath(path).split('/').filter(Boolean);
  }

  private joinHttpPath(basePath: string, methodPath: string) {
    return this.normalizeHttpPath(`${basePath}/${methodPath}`);
  }

  private normalizeHttpPath(rawPath: string) {
    let path = rawPath.trim()
      .replace(/^[a-z][a-z\d+.-]*:\/\/[^/]+/i, '')
      .replace(/^\/\/[^/]+/, '')
      .replace(/[?#].*$/, '')
      .replace(/\{[^}]+\}/g, ':param')
      .replace(/\/+/g, '/');
    if (path.startsWith(':param/')) path = path.slice(':param'.length);
    if (!path.startsWith('/')) path = `/${path}`;
    if (path.length > 1) path = path.replace(/\/$/, '');
    return path || '/';
  }

  private resolveTypeSymbol(
    file: ParsedFile,
    rawTypeName: string,
    kind: CodeSymbolKind,
    files: Map<string, ParsedFile>,
    symbols: Map<string, CodeSymbolReference>,
    projectAliases: Map<string, string>,
  ) {
    const typeName = rawTypeName.replace(/<.*$/, '').split('.').at(-1) ?? rawTypeName;
    const binding = file.imports.get(typeName);
    if (binding?.source.startsWith('.')) {
      const targetPath = this.resolveImportPath(file, binding.source, files);
      const importedName = binding.imported === 'default' ? typeName : binding.imported;
      const key = targetPath
        ? this.symbolKey(file.projectId, targetPath, importedName)
        : null;
      const symbol = key ? symbols.get(key) : null;
      if (symbol?.kind === kind) return symbol;
    }
    if (binding && !binding.source.startsWith('.')) {
      const targetProjectId = this.projectForImport(binding.source, projectAliases);
      const importedName = binding.imported === 'default' ? typeName : binding.imported;
      const match = [...symbols.values()].find(
        (symbol) =>
          symbol.projectId === targetProjectId &&
          symbol.kind === kind &&
          symbol.qualifiedName === importedName,
      );
      if (match) return match;
    }
    const candidates = [...symbols.values()].filter(
      (symbol) => symbol.kind === kind && symbol.qualifiedName === typeName,
    );
    return candidates.find((symbol) => symbol.projectId === file.projectId)
      ?? (candidates.length === 1 ? candidates[0] : undefined);
  }

  private addReverseEdge(
    reverseCalls: Map<string, Set<string>>,
    targetKey: string,
    callerKey: string,
  ) {
    const callers = reverseCalls.get(targetKey) ?? new Set<string>();
    callers.add(callerKey);
    reverseCalls.set(targetKey, callers);
  }

  private async registerProjectAlias(
    git: SimpleGit,
    commit: string,
    projectId: string,
    aliases: Map<string, string>,
  ) {
    aliases.set(projectId, projectId);
    try {
      const rawPackage = await git.show([`${commit}:package.json`]);
      const packageName = (JSON.parse(rawPackage) as { name?: string }).name;
      if (packageName) aliases.set(packageName, projectId);
    } catch {
      // A repository does not need a package.json to participate in local analysis.
    }
  }

  private projectForImport(
    source: string,
    aliases: Map<string, string>,
  ) {
    const entries = [...aliases.entries()].sort((a, b) => b[0].length - a[0].length);
    return entries.find(([alias]) => source === alias || source.startsWith(`${alias}/`))?.[1]
      ?? null;
  }

  private extractVueScript(source: string) {
    const masked = source.replace(/[^\r\n]/g, ' ').split('');
    const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    for (const match of source.matchAll(scriptPattern)) {
      if (/\bsrc\s*=/.test(match[1])) continue;
      const full = match[0];
      const content = match[2];
      const contentOffset = full.indexOf('>') + 1;
      const start = (match.index ?? 0) + contentOffset;
      for (let index = 0; index < content.length; index += 1) {
        masked[start + index] = content[index];
      }
    }
    return masked.join('');
  }

  private findChanges(
    diffs: FileDiff[],
    base: RepositoryModel,
    target: RepositoryModel,
    projectId: string,
  ): SymbolChange[] {
    const changes = new Map<string, SymbolChange>();
    for (const diff of diffs) {
      if (diff.newPath) {
        const targetSymbols = target.files.get(
          this.fileKey(projectId, diff.newPath),
        )?.symbols ?? [];
        const oldKeys = new Set(
          base.files
            .get(this.fileKey(projectId, diff.oldPath ?? diff.newPath))
            ?.symbols.map((item) => item.key),
        );
        for (const symbol of targetSymbols) {
          if (!this.intersects(symbol, diff.newRanges) && oldKeys.has(symbol.key)) continue;
          const changeType = oldKeys.has(symbol.key) ? 'MODIFIED' : 'ADDED';
          changes.set(symbol.key, this.toChange(symbol, changeType));
        }
      }
      if (diff.oldPath) {
        const baseSymbols = base.files.get(
          this.fileKey(projectId, diff.oldPath),
        )?.symbols ?? [];
        for (const symbol of baseSymbols) {
          const targetKey = diff.newPath
            ? this.symbolKey(projectId, diff.newPath, symbol.qualifiedName)
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
          const currentSymbol = model.symbols.get(current.key);
          const httpRoute = currentSymbol
            ? this.matchingHttpRelation(currentSymbol, caller)
            : null;
          impacts.set(`${change.key}:${callerKey}`, {
            changedSymbolKey: change.key,
            impactedSymbol: caller,
            depth,
            callChain,
            reason: httpRoute
              ? `通过 HTTP ${httpRoute.method} ${httpRoute.path} 产生跨仓库影响`
              : caller.projectId !== change.projectId
              ? `通过 ${depth} 层调用依赖产生跨仓库影响`
              : `通过 ${depth} 层调用或接口实现关系受影响`,
          });
          // 业务边界已经能够回答“从哪里回归”，无需继续向框架和外层包装扩散。
          const hasCrossRepositoryCaller = [...(model.reverseCalls.get(callerKey) ?? [])]
            .some((nextKey) => {
              const next = model.symbols.get(nextKey);
              return next?.projectId && next.projectId !== caller.projectId;
            });
          if (!this.business.isBoundary(caller) || hasCrossRepositoryCaller) {
            queue.push({ key: callerKey, chain: callChain, depth });
          }
        }
      }
    }
    return [...impacts.values()].sort((a, b) => a.depth - b.depth).slice(0, 500);
  }

  private matchingHttpRelation(
    target: CodeSymbolReference,
    caller: CodeSymbolReference,
  ) {
    const serverRoutes = target.httpRoutes?.filter((route) => route.role === 'SERVER') ?? [];
    const clientRoutes = caller.httpRoutes?.filter((route) => route.role === 'CLIENT') ?? [];
    return serverRoutes.find((server) =>
      clientRoutes.some((client) => this.httpRoutesMatch(server, client)),
    ) ?? null;
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
    projectId: string,
    projectName: string,
    path: string,
    sourceFile: ts.SourceFile,
    node: ts.Node,
    qualifiedName: string,
    kind: CodeSymbolKind,
  ): CodeSymbolReference {
    const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
    return {
      key: this.symbolKey(projectId, path, qualifiedName),
      name: qualifiedName.split('.').at(-1) ?? qualifiedName,
      qualifiedName,
      kind,
      filePath: path,
      startLine,
      endLine,
      projectId,
      projectName,
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

  private fileKey(projectId: string, path: string) {
    return `${projectId}::${path}`;
  }

  private symbolKey(
    projectId: string,
    path: string,
    qualifiedName: string,
  ) {
    return `${this.fileKey(projectId, path)}#${qualifiedName}`;
  }

  private async exists(path: string) {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  }
}
