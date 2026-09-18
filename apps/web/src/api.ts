import type {
  AnalysisTask,
  CreateProjectInput,
  InspectionLog,
  InspectionLogPage,
  InspectionLogQuery,
  Project,
  RepositoryConnectionTest,
  UpdateProjectInput,
  VersionDetection,
} from '@impact-flow/contracts';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
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
};
