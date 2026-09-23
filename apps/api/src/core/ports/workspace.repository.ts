import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceOverview,
} from '@impact-flow/contracts';

export const WORKSPACE_REPOSITORY = Symbol('WORKSPACE_REPOSITORY');

export interface CreateWorkspaceWithOwnerInput
  extends Omit<CreateWorkspaceInput, 'description'> {
  /** 创建者同时成为该工作空间的 OWNER */
  ownerUserId: string;
  description: string | null;
}

export interface WorkspaceRepository {
  /**
   * 列出某用户可访问的工作空间。只返回该用户存在成员关系的空间，
   * 因此天然按用户隔离，不存在跨用户读取。
   */
  listForUser(userId: string): Promise<WorkspaceOverview[]>;

  /** 工作空间是否为 ACTIVE。后台任务执行器用于判断是否继续触发后续链路。 */
  isActive(workspaceId: string): Promise<boolean>;

  /**
   * 查询某用户对某个工作空间的可见详情。
   * 非成员或空间不存在都返回 null，调用方据此统一回 404，避免暴露空间是否存在。
   */
  findForUser(
    workspaceId: string,
    userId: string,
  ): Promise<WorkspaceOverview | null>;

  /** 工作空间编码全局唯一，创建前需检查占用情况 */
  findByCode(code: string): Promise<{ id: string; name: string } | null>;

  /**
   * 登录时决定进入哪个工作空间，按优先级依次尝试：
   *   1. 用户最后使用过、且仍为有效成员、状态为 ACTIVE 的空间
   *   2. 用户担任 OWNER 且状态为 ACTIVE 的空间
   *   3. 加入时间最早的 ACTIVE 空间
   * 全部不满足时返回 null（例如账号已不属于任何空间），由调用方决定提示方式。
   */
  resolveLoginWorkspace(
    userId: string,
  ): Promise<{ id: string; name: string } | null>;

  /**
   * 事务化创建。同一事务内完成：
   *   1. 写入 workspace（owner_user_id / created_by 均指向创建者）
   *   2. 写入 workspace_member 并把创建者设为 OWNER
   *   3. 初始化该工作空间的待检测通知配置
   *   4. 更新创建者的 last_workspace_id
   * 任一步失败整体回滚，不允许产生无 OWNER 或配置不完整的工作空间。
   *
   * 说明：不预置 workspace_automation_policy 行。自动化策略与通知配置都是惰性默认，
   * 现有默认工作空间同样没有策略行，保持两者状态一致，避免为新空间凭空造出策略。
   */
  createWithOwner(
    input: CreateWorkspaceWithOwnerInput,
  ): Promise<WorkspaceOverview>;

  /** 更新基本信息，并记录最后修改人；读取最新状态由调用方重新查询 */
  update(
    workspaceId: string,
    input: UpdateWorkspaceInput,
    updatedBy: string,
  ): Promise<void>;

  /**
   * 归档工作空间。必须在同一事务内完成：
   *   1. status 由 ACTIVE 变为 ARCHIVED，记录 archived_at
   *   2. 该工作空间下尚未运行的 READY 分析任务置为 CANCELLED
   *
   * 第 2 步必须与状态变更同事务：否则中途失败会留下「已归档但任务仍是 READY」的
   * 不一致状态，而调度器一旦恢复该空间就会把这些任务重新跑起来。
   *
   * 已经 RUNNING 的任务不在此处理：允许它跑完并持久化结果，
   * 但归档后不会再创建新的巡检和分析任务。
   *
   * 仅在状态确实由 ACTIVE 变为 ARCHIVED 时返回 true。
   */
  archive(workspaceId: string, byUserId: string): Promise<boolean>;

  /** 恢复归档工作空间。不补跑历史巡检，自动化配置原样保留。 */
  restore(workspaceId: string, byUserId: string): Promise<boolean>;
}
