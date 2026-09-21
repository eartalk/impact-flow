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
import {
  AI_CONFIG_REPOSITORY,
  type AiConfigRepository,
} from '../../core/ports/ai-config.repository';

export const AUTO_INSPECTION: AutomationCode = 'AUTO_VERSION_INSPECTION';
export const AUTO_CHANGE_ANALYSIS: AutomationCode =
  'AUTO_CHANGE_ANALYSIS_AFTER_INSPECTION';
export const AUTO_AI_ANALYSIS: AutomationCode =
  'AUTO_AI_ANALYSIS_AFTER_CHANGE_ANALYSIS';

@Injectable()
export class AutomationPoliciesService {
  constructor(
    @Inject(AUTOMATION_POLICY_REPOSITORY)
    private readonly policies: AutomationPolicyRepository,
    @Inject(AI_CONFIG_REPOSITORY)
    private readonly aiConfigs: AiConfigRepository,
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
    if (input.autoAiAnalysisEnabled && !input.autoChangeAnalysisEnabled) {
      throw new BadRequestException(
        '开启自动 AI 分析前，需要先开启自动变更分析',
      );
    }
    if (input.autoAiAnalysisEnabled) {
      const aiConfig = await this.aiConfigs.findDefault(workspaceId);
      if (!aiConfig?.enabled) {
        throw new BadRequestException(
          '开启自动 AI 分析前，需要先配置并启用默认 AI 服务',
        );
      }
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
        {
          code: AUTO_AI_ANALYSIS,
          enabled: input.autoAiAnalysisEnabled,
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
      autoAiAnalysisEnabled: byCode.get(AUTO_AI_ANALYSIS)?.enabled ?? false,
      updatedAt: updatedTimes.at(-1) ?? null,
    };
  }
}
