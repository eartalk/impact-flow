import type {
  CreateAiProviderConfigInput,
  UpdateAiProviderConfigInput,
} from '@impact-flow/contracts';

export const AI_CONFIG_REPOSITORY = Symbol('AI_CONFIG_REPOSITORY');

export interface StoredAiProviderConfig {
  id: string;
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
  findAll(): Promise<StoredAiProviderConfig[]>;
  findById(id: string): Promise<StoredAiProviderConfig | null>;
  findDefault(): Promise<StoredAiProviderConfig | null>;
  create(
    input: Omit<CreateAiProviderConfigInput, 'apiKey'> & {
      apiKeyEncrypted: string;
      apiKeyHint: string;
    },
  ): Promise<StoredAiProviderConfig>;
  update(
    id: string,
    input: Omit<UpdateAiProviderConfigInput, 'apiKey'> & {
      apiKeyEncrypted?: string;
      apiKeyHint?: string;
    },
  ): Promise<StoredAiProviderConfig | null>;
  remove(id: string): Promise<boolean>;
}
