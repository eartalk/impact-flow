import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import simpleGit from 'simple-git';
import { TypeScriptSymbolAnalyzer } from './typescript-symbol.analyzer';

describe('TypeScriptSymbolAnalyzer', () => {
  let cacheRoot: string;

  beforeEach(async () => {
    cacheRoot = await mkdtemp(join(tmpdir(), 'impact-flow-symbols-'));
  });

  afterEach(async () => {
    await rm(cacheRoot, { recursive: true, force: true });
  });

  it('maps changed lines to a method and traces an injected caller', async () => {
    const projectId = 'demo-project';
    const repositoryPath = join(cacheRoot, projectId);
    await mkdir(repositoryPath, { recursive: true });
    const git = simpleGit(repositoryPath);
    await git.init();
    await git.addConfig('user.name', 'Impact Flow Test');
    await git.addConfig('user.email', 'test@impact-flow.local');

    await writeFile(
      join(repositoryPath, 'service.ts'),
      'export class DemoService {\n  run() {\n    return 1;\n  }\n}\n',
    );
    await writeFile(
      join(repositoryPath, 'controller.ts'),
      "import { DemoService } from './service';\n" +
        'export class DemoController {\n' +
        '  constructor(private readonly service: DemoService) {}\n' +
        '  execute() { return this.service.run(); }\n' +
        '}\n',
    );
    await git.add('.');
    await git.commit('base');
    const baseCommit = (await git.revparse(['HEAD'])).trim();

    await writeFile(
      join(repositoryPath, 'service.ts'),
      'export class DemoService {\n  run() {\n    return 2;\n  }\n}\n',
    );
    await git.add('.');
    await git.commit('change service result');
    const targetCommit = (await git.revparse(['HEAD'])).trim();

    const analyzer = new TypeScriptSymbolAnalyzer(
      new ConfigService({ REPOSITORY_CACHE_DIR: cacheRoot }),
    );
    const result = await analyzer.analyzeRange({
      projectId,
      baseCommit,
      targetCommit,
    });

    expect(result.symbolChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          qualifiedName: 'DemoService.run',
          changeType: 'MODIFIED',
        }),
      ]),
    );
    expect(result.symbolImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          impactedSymbol: expect.objectContaining({
            qualifiedName: 'DemoController.execute',
          }),
          depth: 1,
        }),
      ]),
    );
  });
});
