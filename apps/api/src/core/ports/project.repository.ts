import type {
  CreateProjectInput,
  InspectionLog,
  InspectionLogPage,
  InspectionLogQuery,
  InspectionTrigger,
  Project,
  UpdateProjectInput,
} from '@impact-flow/contracts';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');

export interface ProjectRepository {
  findAll(workspaceId?: string): Promise<Project[]>;
  findById(id: string, workspaceId?: string): Promise<Project | null>;
  findByCode(code: string, workspaceId?: string): Promise<Project | null>;
  create(workspaceId: string, input: CreateProjectInput): Promise<Project>;
  update(id: string, input: UpdateProjectInput): Promise<Project>;
  remove(id: string): Promise<void>;
  updateLastAnalyzedCommit(id: string, commit: string): Promise<void>;
  markInspectionRunning(id: string): Promise<void>;
  completeInspection(
    id: string,
    input: {
      detectedCommit: string;
      previousDetectedCommit: string;
      pendingCommits: import('@impact-flow/contracts').CommitSummary[];
    },
  ): Promise<Project>;
  failInspection(id: string, errorMessage: string): Promise<Project>;
  createInspectionLog(
    projectId: string,
    triggerType: InspectionTrigger,
  ): Promise<string>;
  completeInspectionLog(
    id: string,
    input: { detectedCommit: string; pendingCommitCount: number },
  ): Promise<void>;
  failInspectionLog(id: string, errorMessage: string): Promise<void>;
  findInspectionLogs(query: InspectionLogQuery, workspaceId?: string): Promise<InspectionLogPage>;
  cleanupInspectionLogs(olderThan: Date): Promise<number>;
}
