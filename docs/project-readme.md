# Impact Flow

Git 生产版本变更影响分析平台的 MVP 框架。

当前打通的最小链路：

```text
后台每 5 分钟巡检 Codeup 生产分支
→ 发现远程提交变化并标记新推送
→ 用户点击开始检测
→ 分析任务立即入队并在后台执行
→ 生成 Commit、文件级 Diff 和变更影响评估
→ 通过 TypeScript AST 将变更行映射到类、方法、函数与类型
→ 反向追踪最多 3 层项目内、包依赖和跨仓库 HTTP 路由调用链
→ 保存风险等级、影响模块、Symbol、调用链、回归建议与文件明细
```

## 目录

```text
apps/api           NestJS API
apps/web           Vue 3 + Element Plus 控制台
packages/contracts 前后端共享契约
var/repositories   Git 仓库缓存（运行后生成，不提交）
```

后端采用轻量端口/适配器结构。项目仓储、分析仓储和 Git 能力均通过接口注入，数据统一持久化到 MySQL。

## 本地启动

要求 Node.js 20+、pnpm 10+、Git。

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3012/api
- 健康检查: http://localhost:3012/api/health

## 环境变量

复制 `.env.example` 为 `.env`，按需修改：

```env
API_PORT=3012
WEB_ORIGIN=http://localhost:5173
VITE_API_TARGET=http://localhost:3012
VITE_HOST=0.0.0.0
REPOSITORY_CACHE_DIR=E:/AI/impact-flow/var/repositories
AI_CONFIG_ENCRYPTION_KEY=replace-with-a-stable-private-secret
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_NAME=impact_flow
DATABASE_USER=root
DATABASE_PASSWORD_BASE64=base64-encoded-admin-password
```

`.env` 已加入 `.gitignore`。服务器部署时也可以改用密码文件：

```env
DATABASE_PASSWORD_FILE=/run/secrets/mysql-root-password
```

数据库初始化脚本为 `database/impact_flow_schema.sql`。已有数据库在原迁移基础上继续按序执行 `database/013_complete_table_column_comments.sql` 至 `database/022_add_ai_worker_reliability.sql`。迁移 015 会把历史成功投递记录回填为 `SUCCESS` 并补齐 `workspace_id`，执行前建议先备份；迁移 016 新增工作空间自动化策略表和分析任务的自动 AI 快照字段；迁移 017 会回填工作空间所有者与用户默认空间，并在工作空间成员表上建立单所有者约束，执行前同样建议先备份；迁移 018 只是把分析任务状态列的注释补上 `CANCELLED`（列类型本就是 varchar，无需改表）；迁移 019 是已经停用的邀请功能历史脚本，仅为兼容已执行过该迁移的环境而保留，新环境无需执行；迁移 020 增加 Worker 租约、重试次数和下次执行时间字段；迁移 021 增加可持久化的执行阶段、阶段进度、说明和开始时间字段；迁移 022 为 AI 分析增加独立租约、重试和逐次执行日志字段。

增量脚本需要按序号手工执行，且**必须显式指定连接字符集**，否则中文表名注释与列注释会被写成乱码（Windows 下 mysql 客户端默认不是 utf8mb4）：

```bash
mysql -h127.0.0.1 -uroot --default-character-set=utf8mb4 < database/015_merge_pending_notification_delivery.sql
mysql -h127.0.0.1 -uroot --default-character-set=utf8mb4 < database/016_add_workspace_automation_policy.sql
mysql -h127.0.0.1 -uroot --default-character-set=utf8mb4 < database/017_add_workspace_management.sql
mysql -h127.0.0.1 -uroot --default-character-set=utf8mb4 < database/018_add_analysis_cancelled_status.sql
mysql -h127.0.0.1 -uroot --default-character-set=utf8mb4 < database/020_add_analysis_worker_reliability.sql
mysql -h127.0.0.1 -uroot --default-character-set=utf8mb4 < database/021_add_analysis_task_progress.sql
mysql -h127.0.0.1 -uroot --default-character-set=utf8mb4 < database/022_add_ai_worker_reliability.sql
```

也可以使用读取项目 `.env` 且不会在命令行暴露密码的迁移命令：

```bash
pnpm --filter @impact-flow/api migrate 020_add_analysis_worker_reliability.sql
pnpm --filter @impact-flow/api migrate 021_add_analysis_task_progress.sql
pnpm --filter @impact-flow/api migrate 022_add_ai_worker_reliability.sql
```

迁移 017 执行前会校验每个工作空间恰好有一个 OWNER，若存在「无 OWNER」或「多 OWNER」的异常数据会直接中止并提示人工修复，不会写入半成品结构。

脚本执行后可用以下命令校验工作空间字段、任务状态注释以及 OWNER 数据一致性（命令不会输出数据库密码）：

```bash
pnpm --filter @impact-flow/api verify:workspace-schema
```

也可以用 `SHOW FULL COLUMNS FROM <table>` 或查询 `information_schema.COLUMNS` 的 `COLUMN_COMMENT` 手工复核注释是否正常。

首次打开页面会进入系统初始化，创建首位工作空间所有者。初始化完成后，登录页支持注册新账号；注册时必须同时创建首个工作空间，账号与工作空间在同一事务内写入，注册人自动成为 OWNER 并直接登录。所有者或管理员也可以在成员管理中创建当前工作空间成员。登录会话保存在 HttpOnly Cookie 中，项目、AI 配置和通知配置均按工作空间隔离。

公开部署时应在反向代理或网关层对 `POST /api/auth/register` 与 `POST /api/auth/login` 配置请求频率限制；当前应用层负责输入校验、密码哈希和同源校验，不内置验证码服务。

## 工作空间作用域约定

多工作空间的数据安全边界依赖一条硬约束：**当前 `workspaceId` 只能来自服务端会话（`auth_session.workspace_id`），永远不信任前端提交的空间 ID**。为此仓储端口按命名区分两类查询：

```text
业务查询（必须显式传 workspaceId，参数不可省略）
  findAll(workspaceId) / findById(id, workspaceId) / findByCode(code, workspaceId)
  findActiveByProject(projectId, workspaceId) / listLogs(query, workspaceId)
  findInspectionLogs(query, workspaceId)

系统级查询（无作用域，仅限调度器与后台任务执行器）
  findAllForScheduler()
  findByIdForWorkerTask(id)
  findPendingForWorker() / findPendingAiForWorker() / findRequestedAiForWorker()
```

`workspaceId` 设计为必填参数而非可选，目的是让「漏传作用域」在编译期就报错，而不是变成一次静默的跨租户读取。新增业务查询一律不加 `For*` 后缀；确需跨工作空间时，必须新增显式的 `For*` 方法并写明理由。

后台任务执行器（应用启动恢复、`process` / `processAi`）没有用户会话，任务记录即作用域的权威来源：先用 `findByIdForWorkerTask` 载入任务与项目，再以返回的 `project.workspaceId` 约束后续所有查询。跨仓库 Symbol 调用链的关联仓库只能取自同一工作空间。

## 多工作空间

一个账号可以同时属于多个工作空间。登录时按以下优先级确定进入哪一个：上次使用的工作空间 → 本人担任 OWNER 的空间 → 加入时间最早的空间。若账号不属于任何有效空间，登录会被拒绝。

任意已登录账号均可创建工作空间。工作空间内的项目、成员、AI 服务和自动化策略均按工作空间隔离。

每个工作空间必须且只能有一个 OWNER。该约束由数据库层保证：`workspace_member.owner_workspace_id` 是只在 `role = 'OWNER'` 时才等于 `workspace_id` 的生成列，配合唯一键借助「NULL 不参与唯一性比较」实现。`workspace.owner_user_id` 是同一事实的冗余权威字段。应用不提供所有权转让功能，OWNER 不能被降级、移除或停用。

### 切换工作空间不轮换会话

`POST /api/workspaces/:id/switch` 只就地把 `auth_session.workspace_id` 更新为目标空间，**不撤销也不重新签发会话**，因此响应中不需要重设 Cookie。

这样选择的代价与约束：

- 浏览器的 Cookie 由同源下所有标签页共享，所以在一个标签页切换后，**其他标签页会在下一次请求时静默跟随**到新工作空间。前端必须用 workspace generation 标记丢弃旧空间的在途响应，否则旧数据可能覆盖新空间状态。
- 切换不构成权限边界变化（用户本来就同时属于两个空间），因此不做 token 轮换；会话固定攻击的防护仍然只落在登录环节。
- 目标空间必须为 `ACTIVE` 且当前用户是其成员，否则返回 404（非成员与不存在统一处理，避免暴露空间是否存在）。

### 成员治理

- **新增成员统一使用 `POST /api/members`**：由所有者或管理员创建新账号，并直接加入当前工作空间。系统不提供已有账号直接加入或邀请链接流程。
- **移除成员会同时撤销该成员在此工作空间下的全部有效会话**（`MEMBER_REMOVED` 审计记录里带 `revokedSessions` 数量）。若不撤销，对方手上的登录态仍能继续读取该空间数据。
- 所有者不能被降级、移除或停用；应用内不提供所有权变更入口。
- 审计摘记只写资源 ID、角色与用户名，**不写密码**（有测试专门断言审计内容不含密码明文）。

### 归档与恢复

`POST /api/workspaces/current/archive` 把工作空间置为 `ARCHIVED`，并在**同一事务**内把该空间下尚未运行的 `READY` 分析任务置为 `CANCELLED`；`POST /api/workspaces/:id/restore` 恢复，不补跑历史巡检、自动化配置原样保留。两者都仅 `OWNER` 可执行。

归档后的约束：

- **统一只读**：由全局守卫 `ArchivedWorkspaceGuard` 拦截所有非 GET 请求，例外只有「撤销归档」「切换空间」「退出登录」「新建工作空间」四条。写死白名单而不是逐接口判断，是为了避免某个接口漏加而继续向归档空间写入。
- **会话不失效**：`findSession` 允许会话指向归档空间，所以归档后所有者仍能进入只读管理页并恢复，**归档不再是只能改库才能撤销的单向门**。
- **登录兜底**：`resolveLoginWorkspace` 优先 ACTIVE 空间，但账号没有任何 ACTIVE 空间时会回退到其归档空间，避免「唯一空间被归档后无法登录」的死锁。
- **自动链路冻结**：已 `RUNNING` 的分析允许跑完，但归档后不再触发自动 AI 分析；定时调度器只遍历 ACTIVE 空间的项目，因此归档空间不会被继续巡检。

私有 Codeup 仓库需要保证运行 API 的系统账号拥有对应 SSH Key，且首次连接所需的主机指纹已经加入 `known_hosts`。

## 当前 API

```text
GET  /api/health
GET  /api/auth/bootstrap-status
POST /api/auth/bootstrap
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/register
GET  /api/members
POST /api/members
PATCH /api/members/:userId/role
DELETE /api/members/:userId
POST /api/members/:userId/disable
POST /api/members/:userId/restore
POST /api/members/:userId/reset-password
GET  /api/audit-logs
GET  /api/workspaces
POST /api/workspaces
GET  /api/workspaces/creation-policy
GET  /api/workspaces/current
PATCH /api/workspaces/current
POST /api/workspaces/current/archive
POST /api/workspaces/:id/restore
POST /api/workspaces/:id/switch
GET  /api/projects
POST /api/projects
PATCH /api/projects/:id
DELETE /api/projects/:id
POST /api/projects/:id/detect-version
POST /api/projects/:id/test-connection
POST /api/projects/:id/inspect-version
POST /api/projects/inspect-all
GET  /api/projects/inspection-logs
GET  /api/analyses
GET  /api/analyses/logs
GET  /api/analyses/:id
POST /api/analyses
POST /api/analyses/:id/rerun
POST /api/analyses/:id/ai-analysis
GET  /api/ai-configs
POST /api/ai-configs
PATCH /api/ai-configs/:id
DELETE /api/ai-configs/:id
POST /api/ai-configs/:id/test
GET  /api/pending-notification-config
PATCH /api/pending-notification-config
POST /api/pending-notification-config/test
GET  /api/pending-notification-config/logs
GET  /api/automation-config
PATCH /api/automation-config
```

首次分析使用生产分支当前提交的第一父提交作为基线；之后使用项目上一次成功分析的目标 Commit 作为基线。只有 Git Diff 成功后才推进基线，失败任务不会影响下一次分析。

Symbol 分析支持 TypeScript、TSX 与 Vue SFC，能够识别 NestJS `@Controller` 配合 `@Get`、`@Post`、`@Put`、`@Patch`、`@Delete`、`@Head`、`@Options`、`@All` 声明的服务端路由，并将其与其他仓库中的 `fetch`、axios 及 `axios.create()` 实例调用关联。HTTP 路径中的模板表达式和 `:id` 参数会按动态路径段匹配；存在多个相同候选路由时会跳过关联，避免产生不确定的误报。

AI 分析默认关闭，并与变更分析分开执行。可在“AI 配置”页维护多条 OpenAI Chat Completions 或 Anthropic Messages 兼容接口，并选择一条默认启用配置。API Key 使用 `AI_CONFIG_ENCRYPTION_KEY`（未配置时回退数据库密码材料）派生密钥加密保存，页面只返回末四位。模型接收提交摘要、文件元数据、Symbol 调用链以及受控 Git Diff 证据：最多 24 个文本文件、单文件 5000 字符、总计 40000 字符；环境文件、证书、锁文件、构建产物和疑似密钥值会被过滤或脱敏。调用失败不会影响变更分析任务完成。

基础配置中的“待检测通知”支持启停和钉钉群机器人 Webhook。巡检按生产分支第一父链统计待检测合并，发现新的待检测合并后发送通知，并通过项目与目标 Commit 去重；发送失败不会影响巡检结果，下次巡检会继续重试。Webhook 使用与 AI API Key 相同的加密材料保存，接口只返回掩码。

## 分析任务 Worker

变更分析由数据库持久化队列驱动。Worker 使用 `FOR UPDATE SKIP LOCKED` 原子抢占到期任务，因此多个 API 实例可以并行运行且不会重复领取同一任务。任务租约超过执行超时时间后可被重新抢占；单次失败按指数退避重新进入 `READY`，默认执行 3 次后转为最终 `FAILED`。完成写入会校验 `worker_id`，已经超时的迟到结果不能覆盖新一轮任务状态或推进项目分析基线。

每次通知投递都会写入 `pending_notification_delivery`（成功与失败都记录），包含渠道、第几次尝试、失败错误码与原因。该表同时承担去重职责：`delivered_commit` 是只在投递成功时才写入 `<target_commit>` 的生成列，配合唯一键 `(project_id, delivered_commit)` 借助 MySQL「NULL 不参与唯一性比较」的特性，实现同一服务同一提交最多成功通知一次，而失败的尝试可以持续追加。失败原因取自钉钉返回的 `errcode`/`errmsg`，网络异常与非法地址分别归类为 `NETWORK`、`INVALID_WEBHOOK`。

前端左侧的“日志管理”按页签统一展示变更分析、AI 分析与消息推送三类日志，支持按服务与结果筛选、分页与刷新。对应接口为 `GET /api/analyses/logs`（`type=CHANGE_ANALYSIS|AI_ANALYSIS`，`projectId`、`status` 均可选）和 `GET /api/pending-notification-config/logs`（`projectId`、`status` 均可选）。两个接口都强制按工作空间隔离，不传项目时返回该工作空间下的全部日志。

基础配置中的自动化流程提供三个工作空间级策略：自动巡检默认开启，巡检后的自动变更分析和变更分析后的自动 AI 分析默认关闭。三个步骤按顺序依赖；自动 AI 分析还要求当前工作空间存在一条默认且已启用的 AI 配置。自动 AI 意图会快照到分析任务，应用重启后可继续恢复待启动任务；手动巡检和手动分析不受这些开关影响。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 下一阶段

1. 增加巡检失败通知与通知投递日志。
2. 扩展 RPC、消息队列级跨仓库调用链和动态调用识别。
3. 增加 AI 分析提示词模板、项目级开关和调用成本统计。
4. 将应用内后台队列升级为独立 Worker，支持并发限制与任务重试。
