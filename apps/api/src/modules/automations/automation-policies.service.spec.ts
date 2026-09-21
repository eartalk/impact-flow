import { AutomationPoliciesService } from './automation-policies.service';

describe('AutomationPoliciesService', () => {
  it('returns both automations disabled when no policies have been saved', async () => {
    const policies = { findAll: jest.fn().mockResolvedValue([]) };
    const service = new AutomationPoliciesService(
      policies as never,
      {} as never,
    );

    await expect(service.getConfig('workspace-1')).resolves.toEqual({
      autoInspectionEnabled: true,
      autoChangeAnalysisEnabled: false,
      autoAiAnalysisEnabled: false,
      updatedAt: null,
    });
  });

  it('rejects automatic AI when automatic change analysis is disabled', async () => {
    const service = new AutomationPoliciesService({} as never, {} as never);

    await expect(
      service.updateConfig('workspace-1', 'user-1', {
        autoInspectionEnabled: true,
        autoChangeAnalysisEnabled: false,
        autoAiAnalysisEnabled: true,
      }),
    ).rejects.toThrow('需要先开启自动变更分析');
  });

  it('requires an enabled default AI configuration', async () => {
    const aiConfigs = { findDefault: jest.fn().mockResolvedValue(null) };
    const service = new AutomationPoliciesService(
      {} as never,
      aiConfigs as never,
    );

    await expect(
      service.updateConfig('workspace-1', 'user-1', {
        autoInspectionEnabled: true,
        autoChangeAnalysisEnabled: true,
        autoAiAnalysisEnabled: true,
      }),
    ).rejects.toThrow('需要先配置并启用默认 AI 服务');
  });

  it('saves the two supported policies together', async () => {
    const now = new Date().toISOString();
    const policies = {
      saveAll: jest.fn().mockResolvedValue([
        {
          code: 'AUTO_VERSION_INSPECTION',
          enabled: true,
          settings: null,
          configVersion: 1,
          updatedAt: now,
        },
        {
          code: 'AUTO_CHANGE_ANALYSIS_AFTER_INSPECTION',
          enabled: true,
          settings: null,
          configVersion: 1,
          updatedAt: now,
        },
        {
          code: 'AUTO_AI_ANALYSIS_AFTER_CHANGE_ANALYSIS',
          enabled: false,
          settings: null,
          configVersion: 1,
          updatedAt: now,
        },
      ]),
    };
    const service = new AutomationPoliciesService(
      policies as never,
      {} as never,
    );

    await expect(
      service.updateConfig('workspace-1', 'user-1', {
        autoInspectionEnabled: true,
        autoChangeAnalysisEnabled: true,
        autoAiAnalysisEnabled: false,
      }),
    ).resolves.toEqual({
      autoInspectionEnabled: true,
      autoChangeAnalysisEnabled: true,
      autoAiAnalysisEnabled: false,
      updatedAt: now,
    });
    expect(policies.saveAll).toHaveBeenCalledWith(
      'workspace-1',
      'user-1',
      expect.arrayContaining([
        expect.objectContaining({
          code: 'AUTO_VERSION_INSPECTION',
          enabled: true,
        }),
        expect.objectContaining({
          code: 'AUTO_CHANGE_ANALYSIS_AFTER_INSPECTION',
          enabled: true,
        }),
        expect.objectContaining({
          code: 'AUTO_AI_ANALYSIS_AFTER_CHANGE_ANALYSIS',
          enabled: false,
        }),
      ]),
    );
  });

  it('rejects automatic change analysis when inspection is disabled', async () => {
    const service = new AutomationPoliciesService({} as never, {} as never);

    await expect(
      service.updateConfig('workspace-1', 'user-1', {
        autoInspectionEnabled: false,
        autoChangeAnalysisEnabled: true,
        autoAiAnalysisEnabled: false,
      }),
    ).rejects.toThrow('需要先开启自动巡检');
  });
});
