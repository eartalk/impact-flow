import {
  BadGatewayException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  AiProviderConfig,
  CreateAiProviderConfigInput,
  UpdateAiProviderConfigInput,
} from '@impact-flow/contracts';
import {
  AI_CONFIG_REPOSITORY,
  type AiConfigRepository,
  type StoredAiProviderConfig,
} from '../../core/ports/ai-config.repository';
import {
  AI_ANALYZER_GATEWAY,
  type AiAnalyzerGateway,
} from '../../core/ports/ai-analyzer.gateway';
import { SecretCipher } from '../../infrastructure/security/secret-cipher';

@Injectable()
export class AiConfigsService {
  constructor(
    @Inject(AI_CONFIG_REPOSITORY)
    private readonly repository: AiConfigRepository,
    @Inject(AI_ANALYZER_GATEWAY)
    private readonly analyzer: AiAnalyzerGateway,
    private readonly cipher: SecretCipher,
  ) {}

  async list(workspaceId: string) {
    return (await this.repository.findAll(workspaceId)).map((item) => this.publicConfig(item));
  }

  async create(workspaceId: string, input: CreateAiProviderConfigInput) {
    const apiKey = input.apiKey.trim();
    const saved = await this.repository.create(workspaceId, {
      ...input,
      name: input.name.trim(),
      baseUrl: this.normalizeBaseUrl(input.baseUrl),
      model: input.model.trim(),
      apiKeyEncrypted: this.cipher.encrypt(apiKey),
      apiKeyHint: apiKey.slice(-4),
    });
    return this.publicConfig(saved);
  }

  async update(id: string, workspaceId: string, input: UpdateAiProviderConfigInput) {
    const existing = await this.repository.findById(id, workspaceId);
    if (!existing) throw new NotFoundException('AI 配置不存在');
    const apiKey = input.apiKey?.trim();
    const saved = await this.repository.update(id, workspaceId, {
      ...input,
      name: input.name?.trim(),
      baseUrl: input.baseUrl ? this.normalizeBaseUrl(input.baseUrl) : undefined,
      model: input.model?.trim(),
      apiKeyEncrypted: apiKey ? this.cipher.encrypt(apiKey) : undefined,
      apiKeyHint: apiKey ? apiKey.slice(-4) : undefined,
    });
    return this.publicConfig(saved!);
  }

  async remove(id: string, workspaceId: string) {
    if (!(await this.repository.remove(id, workspaceId))) throw new NotFoundException('AI 配置不存在');
    return { deleted: true };
  }

  async test(id: string, workspaceId: string) {
    const saved = await this.repository.findById(id, workspaceId);
    if (!saved) throw new NotFoundException('AI 配置不存在');
    try {
      return await this.analyzer.testConnection({
        baseUrl: saved.baseUrl,
        apiKey: this.cipher.decrypt(saved.apiKeyEncrypted),
        model: saved.model,
        apiFormat: saved.apiFormat,
        timeoutMs: saved.timeoutMs,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(`AI 接口连接失败：${message}`);
    }
  }

  private publicConfig(item: StoredAiProviderConfig): AiProviderConfig {
    return {
      id: item.id,
      name: item.name,
      baseUrl: item.baseUrl,
      model: item.model,
      apiFormat: item.apiFormat,
      enabled: item.enabled,
      isDefault: item.isDefault,
      apiKeyMasked: `••••${item.apiKeyHint}`,
      timeoutMs: item.timeoutMs,
      maxFiles: item.maxFiles,
      maxSymbols: item.maxSymbols,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private normalizeBaseUrl(value: string) {
    return value.trim().replace(/\/+$/, '');
  }
}
