import type {
  AnalysisTask,
  AuditLogPage,
  AuditLogQuery,
  AutomationConfig,
  AnalysisLogPage,
  AnalysisLogQuery,
  AiProviderConfig,
  AiProviderConnectionTest,
  CreateAiProviderConfigInput,
  CreateProjectInput,
  CreateWorkspaceInput,
  InspectionLog,
  InspectionLogPage,
  InspectionLogQuery,
  NotificationDeliveryLogPage,
  NotificationDeliveryLogQuery,
  PendingNotificationConfig,
  PendingNotificationConnectionTest,
  Project,
  RepositoryConnectionTest,
  UpdateProjectInput,
  UpdateAiProviderConfigInput,
  UpdateAutomationConfigInput,
  UpdatePendingNotificationConfigInput,
  UpdateWorkspaceInput,
  VersionDetection,
  AuthSession,
  BootstrapInput,
  BootstrapStatus,
  CreateWorkspaceMemberInput,
  LoginInput,
  RegisterInput,
  WorkspaceCreationPolicy,
  WorkspaceMember,
  WorkspaceOverview,
} from '@impact-flow/contracts';

/**
 * 响应回来时如果已经切换过工作空间，就丢弃这次结果。
 *
 * 原因：切换工作空间是就地更新会话（不轮换 token），浏览器内所有标签页共享同一个
 * Cookie，因此旧空间的在途请求仍会正常返回。若不丢弃，旧空间的数据会覆盖新空间的
 * 页面状态，表现为「切换后数据还是旧的」。这类错误属于预期内的丢弃，不应提示用户。
 */
export class WorkspaceSwitchedError extends Error {
  constructor() {
    super('工作空间已切换，本次响应已丢弃');
    this.name = 'WorkspaceSwitchedError';
  }
}

let workspaceGeneration = 0;

/** 切换工作空间前后调用，使所有在途请求的响应失效 */
export function bumpWorkspaceGeneration() {
  workspaceGeneration += 1;
}

async function request<T>(
  url: string,
  init?: RequestInit,
  options: { guard?: boolean } = {},
): Promise<T> {
  const guarded = options.guard !== false;
  const generation = workspaceGeneration;
  const response = await fetch(url, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = Array.isArray(payload?.message)
      ? payload.message.join('；')
      : payload?.message;
    throw new Error(message || `请求失败（${response.status}）`);
  }

  const payload = (await response.json()) as T;
  // 切换工作空间期间返回的旧空间数据必须丢弃；切换请求本身不受影响
  if (guarded && generation !== workspaceGeneration) {
    throw new WorkspaceSwitchedError();
  }
  return payload;
}

export const api = {
  getBootstrapStatus: () =>
    request<BootstrapStatus>('/api/auth/bootstrap-status'),
  bootstrap: (input: BootstrapInput) =>
    request<AuthSession>('/api/auth/bootstrap', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  login: (input: LoginInput) =>
    request<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  register: (input: RegisterInput) =>
    request<AuthSession>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () =>
    request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  getCurrentSession: () => request<AuthSession>('/api/auth/me'),
  listWorkspaces: () => request<WorkspaceOverview[]>('/api/workspaces'),
  getWorkspaceCreationPolicy: () =>
    request<WorkspaceCreationPolicy>('/api/workspaces/creation-policy'),
  getCurrentWorkspace: () =>
    request<WorkspaceOverview>('/api/workspaces/current'),
  updateCurrentWorkspace: (input: UpdateWorkspaceInput) =>
    request<WorkspaceOverview>('/api/workspaces/current', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  archiveCurrentWorkspace: () =>
    request<{ archived: boolean }>('/api/workspaces/current/archive', {
      method: 'POST',
    }),
  restoreWorkspace: (id: string) =>
    request<{ restored: boolean }>(`/api/workspaces/${id}/restore`, {
      method: 'POST',
    }),
  /**
   * 切换工作空间。此请求不能被 generation 守卫拦截，
   * 否则切换自身的结果会被当成过期响应丢弃。
   */
  switchWorkspace: (id: string) =>
    request<AuthSession>(`/api/workspaces/${id}/switch`, { method: 'POST' }, {
      guard: false,
    }),
  createWorkspace: (input: CreateWorkspaceInput) =>
    request<{ workspace: WorkspaceOverview; session: AuthSession }>(
      '/api/workspaces',
      { method: 'POST', body: JSON.stringify(input) },
      { guard: false },
    ),
  listMembers: () => request<WorkspaceMember[]>('/api/members'),
  removeMember: (userId: string) =>
    request<{ removed: boolean; revokedSessions: number }>(
      `/api/members/${userId}`,
      { method: 'DELETE' },
    ),
  disableMember: (userId: string) =>
    request<{ disabled: boolean; revokedSessions: number }>(
      `/api/members/${userId}/disable`,
      { method: 'POST' },
    ),
  restoreMember: (userId: string) =>
    request<{ restored: boolean }>(`/api/members/${userId}/restore`, {
      method: 'POST',
    }),
  resetMemberPassword: (userId: string, password: string) =>
    request<{ reset: boolean; revokedSessions: number }>(
      `/api/members/${userId}/reset-password`,
      { method: 'POST', body: JSON.stringify({ password }) },
    ),
  listAuditLogs: (query: AuditLogQuery = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    const suffix = params.size ? `?${params.toString()}` : '';
    return request<AuditLogPage>(`/api/audit-logs${suffix}`);
  },
  createMember: (input: CreateWorkspaceMemberInput) =>
    request<WorkspaceMember>('/api/members', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (input: CreateProjectInput) =>
    request<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateProject: (id: string, input: UpdateProjectInput) =>
    request<Project>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteProject: (id: string) =>
    request<{ deleted: boolean }>(`/api/projects/${id}`, {
      method: 'DELETE',
    }),
  detectVersion: (projectId: string) =>
    request<VersionDetection>(`/api/projects/${projectId}/detect-version`, {
      method: 'POST',
    }),
  inspectProject: (projectId: string) =>
    request<Project>(`/api/projects/${projectId}/inspect-version`, {
      method: 'POST',
    }),
  testProjectConnection: (projectId: string) =>
    request<RepositoryConnectionTest>(`/api/projects/${projectId}/test-connection`, {
      method: 'POST',
    }),
  inspectAllProjects: () =>
    request<Project[]>('/api/projects/inspect-all', {
      method: 'POST',
    }),
  listInspectionLogs: (query: InspectionLogQuery = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    const suffix = params.size ? `?${params.toString()}` : '';
    return request<InspectionLogPage>(`/api/projects/inspection-logs${suffix}`);
  },
  listAnalyses: () => request<AnalysisTask[]>('/api/analyses'),
  getAnalysis: (id: string) => request<AnalysisTask>(`/api/analyses/${id}`),
  createAnalysis: (projectId: string) =>
    request<AnalysisTask>('/api/analyses', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    }),
  rerunAnalysis: (id: string) =>
    request<AnalysisTask>(`/api/analyses/${id}/rerun`, {
      method: 'POST',
    }),
  runAiAnalysis: (id: string) =>
    request<AnalysisTask>(`/api/analyses/${id}/ai-analysis`, {
      method: 'POST',
    }),
  listAnalysisLogs: (query: AnalysisLogQuery) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    return request<AnalysisLogPage>(`/api/analyses/logs?${params.toString()}`);
  },
  listAiConfigs: () => request<AiProviderConfig[]>('/api/ai-configs'),
  getAutomationConfig: () =>
    request<AutomationConfig>('/api/automation-config'),
  updateAutomationConfig: (input: UpdateAutomationConfigInput) =>
    request<AutomationConfig>('/api/automation-config', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  createAiConfig: (input: CreateAiProviderConfigInput) =>
    request<AiProviderConfig>('/api/ai-configs', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateAiConfig: (id: string, input: UpdateAiProviderConfigInput) =>
    request<AiProviderConfig>(`/api/ai-configs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteAiConfig: (id: string) =>
    request<{ deleted: boolean }>(`/api/ai-configs/${id}`, { method: 'DELETE' }),
  testAiConfig: (id: string) =>
    request<AiProviderConnectionTest>(`/api/ai-configs/${id}/test`, { method: 'POST' }),
  getPendingNotificationConfig: () =>
    request<PendingNotificationConfig>('/api/pending-notification-config'),
  updatePendingNotificationConfig: (
    input: UpdatePendingNotificationConfigInput,
  ) =>
    request<PendingNotificationConfig>('/api/pending-notification-config', {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  testPendingNotification: () =>
    request<PendingNotificationConnectionTest>(
      '/api/pending-notification-config/test',
      { method: 'POST' },
    ),
  listNotificationDeliveryLogs: (query: NotificationDeliveryLogQuery = {}) => {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    const suffix = params.size ? `?${params.toString()}` : '';
    return request<NotificationDeliveryLogPage>(
      `/api/pending-notification-config/logs${suffix}`,
    );
  },
};
