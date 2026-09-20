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
      projectName: 'Demo Project',
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

  it('maps Vue script setup changes and traces TypeScript callers', async () => {
    const projectId = 'vue-project';
    const repositoryPath = join(cacheRoot, projectId);
    await mkdir(repositoryPath, { recursive: true });
    const git = simpleGit(repositoryPath);
    await git.init();
    await git.addConfig('user.name', 'Impact Flow Test');
    await git.addConfig('user.email', 'test@impact-flow.local');
    await writeFile(
      join(repositoryPath, 'Panel.vue'),
      '<template><button>Run</button></template>\n<script setup lang="ts">\nexport function loadPanel() {\n  return 1;\n}\n</script>\n',
    );
    await writeFile(
      join(repositoryPath, 'consumer.ts'),
      "import { loadPanel } from './Panel.vue';\nexport function renderPanel() { return loadPanel(); }\n",
    );
    await git.add('.');
    await git.commit('base vue component');
    const baseCommit = (await git.revparse(['HEAD'])).trim();
    await writeFile(
      join(repositoryPath, 'Panel.vue'),
      '<template><button>Run</button></template>\n<script setup lang="ts">\nexport function loadPanel() {\n  return 2;\n}\n</script>\n',
    );
    await git.add('.');
    await git.commit('change vue component');
    const targetCommit = (await git.revparse(['HEAD'])).trim();

    const analyzer = new TypeScriptSymbolAnalyzer(
      new ConfigService({ REPOSITORY_CACHE_DIR: cacheRoot }),
    );
    const result = await analyzer.analyzeRange({
      projectId,
      projectName: 'Vue Project',
      baseCommit,
      targetCommit,
    });

    expect(result.symbolChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ qualifiedName: 'loadPanel', filePath: 'Panel.vue' }),
      ]),
    );
    expect(result.symbolImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          impactedSymbol: expect.objectContaining({ qualifiedName: 'renderPanel' }),
        }),
      ]),
    );
  });

  it('propagates implementation changes through interface callers', async () => {
    const projectId = 'interface-project';
    const repositoryPath = join(cacheRoot, projectId);
    await mkdir(repositoryPath, { recursive: true });
    const git = simpleGit(repositoryPath);
    await git.init();
    await git.addConfig('user.name', 'Impact Flow Test');
    await git.addConfig('user.email', 'test@impact-flow.local');
    await writeFile(
      join(repositoryPath, 'runner.ts'),
      'export interface Runner { run(): number; }\n',
    );
    await writeFile(
      join(repositoryPath, 'runner.impl.ts'),
      "import { Runner } from './runner';\nexport class RunnerImpl implements Runner {\n  run() { return 1; }\n}\n",
    );
    await writeFile(
      join(repositoryPath, 'consumer.ts'),
      "import { Runner } from './runner';\nexport class Consumer {\n  constructor(private readonly runner: Runner) {}\n  execute() { return this.runner.run(); }\n}\n",
    );
    await git.add('.');
    await git.commit('base interface');
    const baseCommit = (await git.revparse(['HEAD'])).trim();
    await writeFile(
      join(repositoryPath, 'runner.impl.ts'),
      "import { Runner } from './runner';\nexport class RunnerImpl implements Runner {\n  run() { return 2; }\n}\n",
    );
    await git.add('.');
    await git.commit('change implementation');
    const targetCommit = (await git.revparse(['HEAD'])).trim();

    const analyzer = new TypeScriptSymbolAnalyzer(
      new ConfigService({ REPOSITORY_CACHE_DIR: cacheRoot }),
    );
    const result = await analyzer.analyzeRange({
      projectId,
      projectName: 'Interface Project',
      baseCommit,
      targetCommit,
    });

    expect(result.symbolImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          impactedSymbol: expect.objectContaining({ qualifiedName: 'Consumer.execute' }),
          depth: 2,
        }),
      ]),
    );
  });

  it('traces callers from a related repository through package imports', async () => {
    const sharedId = 'shared-project';
    const sharedPath = join(cacheRoot, sharedId);
    await mkdir(sharedPath, { recursive: true });
    const sharedGit = simpleGit(sharedPath);
    await sharedGit.init();
    await sharedGit.addConfig('user.name', 'Impact Flow Test');
    await sharedGit.addConfig('user.email', 'test@impact-flow.local');
    await writeFile(join(sharedPath, 'package.json'), '{"name":"@demo/shared"}\n');
    await writeFile(
      join(sharedPath, 'service.ts'),
      'export class SharedService {\n  run() { return 1; }\n}\n',
    );
    await sharedGit.add('.');
    await sharedGit.commit('base shared');
    const baseCommit = (await sharedGit.revparse(['HEAD'])).trim();
    await writeFile(
      join(sharedPath, 'service.ts'),
      'export class SharedService {\n  run() { return 2; }\n}\n',
    );
    await sharedGit.add('.');
    await sharedGit.commit('change shared service');
    const targetCommit = (await sharedGit.revparse(['HEAD'])).trim();

    const consumerId = 'consumer-project';
    const consumerPath = join(cacheRoot, consumerId);
    await mkdir(consumerPath, { recursive: true });
    const consumerGit = simpleGit(consumerPath);
    await consumerGit.init();
    await consumerGit.addConfig('user.name', 'Impact Flow Test');
    await consumerGit.addConfig('user.email', 'test@impact-flow.local');
    await writeFile(join(consumerPath, 'package.json'), '{"name":"@demo/consumer"}\n');
    await writeFile(
      join(consumerPath, 'consumer.ts'),
      "import { SharedService } from '@demo/shared';\n" +
        'export class ConsumerController {\n' +
        '  constructor(private readonly service: SharedService) {}\n' +
        '  execute() { return this.service.run(); }\n' +
        '}\n',
    );
    await consumerGit.add('.');
    await consumerGit.commit('add shared caller');
    const consumerCommit = (await consumerGit.revparse(['HEAD'])).trim();

    const analyzer = new TypeScriptSymbolAnalyzer(
      new ConfigService({ REPOSITORY_CACHE_DIR: cacheRoot }),
    );
    const result = await analyzer.analyzeRange({
      projectId: sharedId,
      projectName: 'Shared Project',
      baseCommit,
      targetCommit,
      relatedRepositories: [{
        projectId: consumerId,
        projectName: 'Consumer Project',
        targetCommit: consumerCommit,
      }],
    });

    expect(result.symbolImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          impactedSymbol: expect.objectContaining({
            qualifiedName: 'ConsumerController.execute',
            projectId: consumerId,
            projectName: 'Consumer Project',
          }),
        }),
      ]),
    );
    expect(result.symbolSummary).toContain('跨仓库影响');
  });

  it('traces fetch and axios callers through NestJS HTTP routes across repositories', async () => {
    const apiId = 'users-api';
    const apiPath = join(cacheRoot, apiId);
    await mkdir(apiPath, { recursive: true });
    const apiGit = simpleGit(apiPath);
    await apiGit.init();
    await apiGit.addConfig('user.name', 'Impact Flow Test');
    await apiGit.addConfig('user.email', 'test@impact-flow.local');
    await writeFile(
      join(apiPath, 'users.controller.ts'),
      "import { Controller, Get, Post } from '@nestjs/common';\n" +
        'class UserService {\n  run() { return 1; }\n}\n' +
        "@Controller('users')\n" +
        'export class UsersController {\n' +
        '  constructor(private readonly service: UserService) {}\n' +
        "  @Get(':id')\n  getOne() { return this.service.run(); }\n" +
        '  @Post()\n  create() { return this.service.run(); }\n' +
        '}\n',
    );
    await apiGit.add('.');
    await apiGit.commit('base users api');
    const baseCommit = (await apiGit.revparse(['HEAD'])).trim();
    await writeFile(
      join(apiPath, 'users.controller.ts'),
      "import { Controller, Get, Post } from '@nestjs/common';\n" +
        'class UserService {\n  run() { return 2; }\n}\n' +
        "@Controller('users')\n" +
        'export class UsersController {\n' +
        '  constructor(private readonly service: UserService) {}\n' +
        "  @Get(':id')\n  getOne() { return this.service.run(); }\n" +
        '  @Post()\n  create() { return this.service.run(); }\n' +
        '}\n',
    );
    await apiGit.add('.');
    await apiGit.commit('change user service');
    const targetCommit = (await apiGit.revparse(['HEAD'])).trim();

    const webId = 'users-web';
    const webPath = join(cacheRoot, webId);
    await mkdir(webPath, { recursive: true });
    const webGit = simpleGit(webPath);
    await webGit.init();
    await webGit.addConfig('user.name', 'Impact Flow Test');
    await webGit.addConfig('user.email', 'test@impact-flow.local');
    await writeFile(
      join(webPath, 'users.api.ts'),
      "import axios from 'axios';\n" +
        "const http = axios.create({ baseURL: '/api' });\n" +
        'export function loadUser(id: string) {\n' +
        '  return fetch(`/users/${id}`);\n' +
        '}\n' +
        'export function createUser(input: unknown) {\n' +
        "  return http.post('/users', input);\n" +
        '}\n',
    );
    await webGit.add('.');
    await webGit.commit('add user http client');
    const webCommit = (await webGit.revparse(['HEAD'])).trim();

    const analyzer = new TypeScriptSymbolAnalyzer(
      new ConfigService({ REPOSITORY_CACHE_DIR: cacheRoot }),
    );
    const result = await analyzer.analyzeRange({
      projectId: apiId,
      projectName: 'Users API',
      baseCommit,
      targetCommit,
      relatedRepositories: [{
        projectId: webId,
        projectName: 'Users Web',
        targetCommit: webCommit,
      }],
    });

    expect(result.symbolImpacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          impactedSymbol: expect.objectContaining({
            qualifiedName: 'loadUser',
            projectId: webId,
            httpRoutes: expect.arrayContaining([
              { method: 'GET', path: '/users/:param', role: 'CLIENT' },
            ]),
          }),
          depth: 2,
        }),
        expect.objectContaining({
          impactedSymbol: expect.objectContaining({
            qualifiedName: 'createUser',
            projectId: webId,
            httpRoutes: expect.arrayContaining([
              { method: 'POST', path: '/users', role: 'CLIENT' },
            ]),
          }),
          depth: 2,
        }),
      ]),
    );
  });
});
