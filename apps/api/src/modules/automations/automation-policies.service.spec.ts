import { AutomationPoliciesService } from './automation-policies.service';

describe('AutomationPoliciesService', () => {
  it('enables inspection and keeps automatic regression analysis disabled by default', async () => {
    const policies = { findAll: jest.fn().mockResolvedValue([]) };
    const service = new AutomationPoliciesService(policies as never);

    await expect(service.getConfig('workspace-1')).resolves.toEqual({
      autoInspectionEnabled: true,
      autoChangeAnalysisEnabled: false,
      updatedAt: null,
    });
  });

  it('saves the two supported policies together', async () => {
    const now = new Date().toISOString();
    const stored = [
      { code: 'AUTO_VERSION_INSPECTION', enabled: true, settings: null, configVersion: 1, updatedAt: now },
      { code: 'AUTO_CHANGE_ANALYSIS_AFTER_INSPECTION', enabled: true, settings: null, configVersion: 1, updatedAt: now },
    ];
    const policies = { saveAll: jest.fn().mockResolvedValue(stored) };
    const service = new AutomationPoliciesService(policies as never);

    await expect(service.updateConfig('workspace-1', 'user-1', {
      autoInspectionEnabled: true,
      autoChangeAnalysisEnabled: true,
    })).resolves.toEqual({
      autoInspectionEnabled: true,
      autoChangeAnalysisEnabled: true,
      updatedAt: now,
    });
    expect(policies.saveAll).toHaveBeenCalledWith('workspace-1', 'user-1', [
      { code: 'AUTO_VERSION_INSPECTION', enabled: true },
      { code: 'AUTO_CHANGE_ANALYSIS_AFTER_INSPECTION', enabled: true },
    ]);
  });

  it('rejects automatic regression analysis when inspection is disabled', async () => {
    const service = new AutomationPoliciesService({} as never);

    await expect(service.updateConfig('workspace-1', 'user-1', {
      autoInspectionEnabled: false,
      autoChangeAnalysisEnabled: true,
    })).rejects.toThrow('需要先开启自动巡检');
  });
});
