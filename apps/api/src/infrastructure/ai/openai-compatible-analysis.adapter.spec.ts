import type { AiAnalysisInput } from '../../core/ports/ai-analyzer.gateway';
import { OpenAiCompatibleAnalysisAdapter } from './openai-compatible-analysis.adapter';
import type { AiConfigRepository } from '../../core/ports/ai-config.repository';
import type { SecretCipher } from '../security/secret-cipher';

describe('OpenAiCompatibleAnalysisAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns a disabled result without calling the model', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const adapter = createAdapter(null);

    await expect(adapter.analyze(input())).resolves.toEqual(
      expect.objectContaining({ status: 'DISABLED', summary: null }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('parses and normalizes a structured model response', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: '接口变更可能影响用户详情页。',
              riskLevel: 'HIGH',
              keyFindings: ['存在跨仓库 HTTP 调用链'],
              regressionSuggestions: [{
                title: '用户详情接口回归',
                scope: '验证正常、无权限和用户不存在场景。',
                priority: 'P0',
                targetType: 'API',
                impactRelation: 'UPSTREAM',
                coverageStatus: 'CONFIRMED',
                businessDomain: '用户管理',
                businessScenario: '用户详情查询',
                boundaryType: 'HTTP',
                technicalConfidence: 'HIGH',
                businessConfidence: 'HIGH',
                entryPoints: ['GET /users/:id'],
                scenarios: ['正常查询', '无权限访问'],
                steps: ['请求用户详情接口'],
                expectedResults: ['返回字段与权限校验符合约定'],
                evidence: ['src/users.controller.ts: UserController.detail'],
                confidence: 'HIGH',
              }],
            }),
          },
        }],
        usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
      }),
    } as unknown as Response);
    const adapter = createAdapter({ baseUrl: 'https://model.example/v1/' });

    await expect(adapter.analyze(input())).resolves.toEqual(
      expect.objectContaining({
        status: 'SUCCESS',
        summary: '接口变更可能影响用户详情页。',
        riskLevel: 'HIGH',
        model: 'test-model',
        tokenUsage: { prompt: 120, completion: 40, total: 160 },
        regressionSuggestions: [expect.objectContaining({
          entryPoints: ['GET /users/:id'],
          evidence: ['src/users.controller.ts: UserController.detail'],
          confidence: 'HIGH',
          targetType: 'API',
          impactRelation: 'UPSTREAM',
          coverageStatus: 'CONFIRMED',
          businessDomain: '用户管理',
          businessScenario: '用户详情查询',
          boundaryType: 'HTTP',
          technicalConfidence: 'HIGH',
          businessConfidence: 'HIGH',
        })],
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://model.example/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );
    const request = JSON.parse(
      String((fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined)?.body),
    ) as {
      max_tokens: number;
      temperature: number;
      thinking: { type: string };
      messages: Array<{ role: string; content: string }>;
    };
    expect(request.max_tokens).toBe(4096);
    expect(request.temperature).toBe(0);
    expect(request.thinking).toEqual({ type: 'disabled' });
    expect(request.messages[0]?.content).toContain('第一个字符必须是 {');
    expect(request.messages[0]?.content).toContain('keyFindings 最多 6 项');
    expect(request.messages[0]?.content).toContain('不是测试用例');
    expect(request.messages[0]?.content).toContain('不能静默遗漏');
  });

  it('rejects invalid model JSON so the application can degrade gracefully', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'not-json' } }] }),
    } as unknown as Response);
    const adapter = createAdapter();

    await expect(adapter.analyze(input())).rejects.toThrow('不是有效 JSON');
  });

  it('extracts JSON when the model wraps it with reasoning and prose', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{
          type: 'text',
          text: '<think>先分析变更。</think>以下是结果：\n```json\n{"summary":"接口风险可控","riskLevel":"LOW","keyFindings":[],"regressionSuggestions":[]}\n```',
        }],
        stop_reason: 'end_turn',
      }),
    } as unknown as Response);
    const adapter = createAdapter({
      baseUrl: 'https://model.example/anthropic',
      apiFormat: 'ANTHROPIC',
    });

    await expect(adapter.analyze(input())).resolves.toEqual(
      expect.objectContaining({ status: 'SUCCESS', summary: '接口风险可控' }),
    );
  });

  it('reports a truncated JSON response clearly', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: '{"summary":"未完成"' }],
        stop_reason: 'max_tokens',
      }),
    } as unknown as Response);
    const adapter = createAdapter({
      baseUrl: 'https://model.example/anthropic',
      apiFormat: 'ANTHROPIC',
    });

    await expect(adapter.analyze(input())).rejects.toThrow('达到输出上限');
  });

  it('reports when reasoning exhausts the output budget before final text', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'thinking', thinking: '分析中' }],
        stop_reason: 'max_tokens',
      }),
    } as unknown as Response);
    const adapter = createAdapter({
      baseUrl: 'https://model.example/anthropic',
      apiFormat: 'ANTHROPIC',
    });

    await expect(adapter.analyze(input())).rejects.toThrow('思考过程耗尽输出额度');
  });

  it('tests an Anthropic Messages compatible configuration', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text: 'OK' }],
        usage: { input_tokens: 8, output_tokens: 2 },
      }),
    } as unknown as Response);
    const adapter = createAdapter(null);

    await expect(adapter.testConnection({
      baseUrl: 'https://model.example/anthropic',
      apiKey: 'test-key',
      model: 'test-model',
      apiFormat: 'ANTHROPIC',
      timeoutMs: 30000,
    })).resolves.toEqual(expect.objectContaining({ success: true, model: 'test-model' }));
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://model.example/anthropic/v1/messages',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
  });
});

function createAdapter(
  savedOverrides: {
    baseUrl?: string;
    apiFormat?: 'OPENAI' | 'ANTHROPIC';
    enabled?: boolean;
  } | null = {},
) {
  const repository = {
    findDefault: jest.fn().mockResolvedValue(savedOverrides !== null ? {
      id: 'config-1',
      name: 'test',
      baseUrl: savedOverrides.baseUrl ?? 'https://model.example/v1',
      apiKeyEncrypted: 'encrypted',
      apiKeyHint: '***key',
      model: 'test-model',
      apiFormat: savedOverrides.apiFormat ?? 'OPENAI',
      enabled: savedOverrides.enabled ?? true,
      isDefault: true,
      timeoutMs: 30000,
      maxFiles: 80,
      maxSymbols: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } : null),
  } as unknown as AiConfigRepository;
  const cipher = { decrypt: jest.fn().mockReturnValue('test-key') } as unknown as SecretCipher;
  return new OpenAiCompatibleAnalysisAdapter(
    repository,
    cipher,
  );
}

function input(): AiAnalysisInput {
  return {
    workspaceId: 'workspace-1',
    projectName: 'Users API',
    baseCommit: 'base',
    targetCommit: 'target',
    commits: [{
      sha: '1234567890',
      shortSha: '1234567',
      author: 'Tester',
      subject: 'change user endpoint',
      committedAt: '2026-09-20T00:00:00.000Z',
    }],
    files: [{
      path: 'src/users.controller.ts',
      oldPath: null,
      changeType: 'M',
      additions: 4,
      deletions: 2,
    }],
    additions: 4,
    deletions: 2,
    changeEvidence: [{
      filePath: 'src/users.controller.ts',
      oldPath: null,
      changeType: 'M',
      patch: '@@ -10,3 +10,4 @@\n- return oldValue;\n+ return newValue;',
      truncated: false,
    }],
    ruleAnalysis: {
      riskLevel: 'HIGH',
      riskSummary: '包含接口变更。',
      impactedModules: [{
        name: '用户模块',
        reason: '1 个文件变更',
        fileCount: 1,
        riskLevel: 'HIGH',
      }],
      regressionSuggestions: [],
    },
    symbolAnalysis: {
      symbolSummary: '识别到 1 个变更 Symbol',
      symbolChanges: [],
      symbolImpacts: [],
    },
  };
}
