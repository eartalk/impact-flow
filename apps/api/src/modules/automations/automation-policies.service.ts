import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type {
  AutomationCode,
  AutomationConfig,
  UpdateAutomationConfigInput,
} from '@impact-flow/contracts';
import {
  AUTOMATION_POLICY_REPOSITORY,
  type AutomationPolicyRepository,
  type StoredAutomationPolicy,
} from '../../core/ports/automation-policy.repository';

export const AUTO_INSPECTION: AutomationCode = 'AUTO_VERSION_INSPECTION';
export const AUTO_CHANGE_ANALYSIS: AutomationCode =
  'AUTO_CHANGE_ANALYSIS_AFTER_INSPECTION';

@Injectable()
export class AutomationPoliciesService {
  constructor(
    @Inject(AUTOMATION_POLICY_REPOSITORY)
    private readonly policies: AutomationPolicyRepository,
  ) {}

  async getConfig(workspaceId: string): Promise<AutomationConfig> {
    return this.publicConfig(await this.policies.findAll(workspaceId));
  }

  async updateConfig(
    workspaceId: string,
    updatedBy: string,
    input: UpdateAutomationConfigInput,
  ): Promise<AutomationConfig> {
    if (input.autoChangeAnalysisEnabled && !input.autoInspectionEnabled) {
      throw new BadRequestException(
        '开启自动变更分析前，需要先开启自动巡检',
      );
    }
    return this.publicConfig(
      await this.policies.saveAll(workspaceId, updatedBy, [
        {
          code: AUTO_INSPECTION,
          enabled: input.autoInspectionEnabled,
        },
        {
          code: AUTO_CHANGE_ANALYSIS,
          enabled: input.autoChangeAnalysisEnabled,
        },
      ]),
    );
  }

  private publicConfig(policies: StoredAutomationPolicy[]): AutomationConfig {
    const byCode = new Map(policies.map((policy) => [policy.code, policy]));
    const updatedTimes = policies.map((policy) => policy.updatedAt).sort();
    return {
      autoInspectionEnabled: byCode.get(AUTO_INSPECTION)?.enabled ?? true,
      autoChangeAnalysisEnabled:
        byCode.get(AUTO_CHANGE_ANALYSIS)?.enabled ?? false,
      updatedAt: updatedTimes.at(-1) ?? null,
    };
  }
}
