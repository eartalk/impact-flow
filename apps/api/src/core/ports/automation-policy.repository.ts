import type { AutomationCode } from '@impact-flow/contracts';

export const AUTOMATION_POLICY_REPOSITORY = Symbol(
  'AUTOMATION_POLICY_REPOSITORY',
);

export interface StoredAutomationPolicy {
  code: AutomationCode;
  enabled: boolean;
  settings: Record<string, unknown> | null;
  configVersion: number;
  updatedAt: string;
}

export interface AutomationPolicyRepository {
  findAll(workspaceId: string): Promise<StoredAutomationPolicy[]>;
  saveAll(
    workspaceId: string,
    updatedBy: string,
    policies: Array<{ code: AutomationCode; enabled: boolean }>,
  ): Promise<StoredAutomationPolicy[]>;
}
