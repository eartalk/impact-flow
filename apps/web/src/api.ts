import type {
  AnalysisTask,
  AnalysisLogPage,
  AnalysisLogQuery,
  AiProviderConfig,
  AiProviderConnectionTest,
  CreateAiProviderConfigInput,
  CreateProjectInput,
  InspectionLog,
  InspectionLogPage,
  InspectionLogQuery,
  PendingNotificationConfig,
  PendingNotificationConnectionTest,
  Project,
  RepositoryConnectionTest,
  UpdateProjectInput,
  UpdateAiProviderConfigInput,
  UpdatePendingNotificationConfigInput,
  VersionDetection,
  AuthSession,
  BootstrapInput,
  BootstrapStatus,
  CreateWorkspaceMemberInput,
  LoginInput,
  WorkspaceMember,
} from '@impact-flow/contracts';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
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

  return response.json() as Promise<T>;
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
  logout: () =>
    request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),
  getCurrentSession: () => request<AuthSession>('/api/auth/me'),
  listMembers: () => request<WorkspaceMember[]>('/api/members'),
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
};
