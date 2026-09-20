import type {
  CreateAiProviderConfigInput,
  UpdateAiProviderConfigInput,
} from '@impact-flow/contracts';

export const AI_CONFIG_REPOSITORY = Symbol('AI_CONFIG_REPOSITORY');

export interface StoredAiProviderConfig {
  id: string;
  workspaceId: string;
  name: string;
  baseUrl: string;
  model: string;
  apiFormat: 'OPENAI' | 'ANTHROPIC';
  enabled: boolean;
  isDefault: boolean;
  apiKeyEncrypted: string;
  apiKeyHint: string;
  timeoutMs: number;
  maxFiles: number;
  maxSymbols: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiConfigRepository {
  findAll(workspaceId: string): Promise<StoredAiProviderConfig[]>;
  findById(id: string, workspaceId: string): Promise<StoredAiProviderConfig | null>;
  findDefault(workspaceId: string): Promise<StoredAiProviderConfig | null>;
  create(
    workspaceId: string,
    input: Omit<CreateAiProviderConfigInput, 'apiKey'> & {
      apiKeyEncrypted: string;
      apiKeyHint: string;
    },
  ): Promise<StoredAiProviderConfig>;
  update(
    id: string,
    workspaceId: string,
    input: Omit<UpdateAiProviderConfigInput, 'apiKey'> & {
      apiKeyEncrypted?: string;
      apiKeyHint?: string;
    },
  ): Promise<StoredAiProviderConfig | null>;
  remove(id: string, workspaceId: string): Promise<boolean>;
}
