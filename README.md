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
VERSION_CHECK_ENABLED=true
VERSION_CHECK_INTERVAL_MS=300000
INSPECTION_LOG_RETENTION_DAYS=30
SYMBOL_ANALYSIS_MAX_FILES=1500
SYMBOL_ANALYSIS_MAX_RELATED_PROJECTS=5
SYMBOL_ANALYSIS_RELATED_MAX_FILES=500
AI_ANALYSIS_ENABLED=false
AI_API_BASE_URL=https://api.openai.com/v1
AI_API_FORMAT=OPENAI
AI_API_KEY=
AI_MODEL=
AI_ANALYSIS_TIMEOUT_MS=90000
AI_ANALYSIS_MAX_FILES=80
AI_ANALYSIS_MAX_SYMBOLS=50
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

数据库初始化脚本为 `database/impact_flow_schema.sql`。已有数据库在原迁移基础上继续执行 `database/013_complete_table_column_comments.sql` 和 `database/014_add_identity_workspace.sql`。

首次打开页面会进入系统初始化，创建首位工作空间所有者。系统不提供公开注册，后续账号由所有者或管理员在成员管理中创建。登录会话保存在 HttpOnly Cookie 中，项目、AI 配置和通知配置均按工作空间隔离。

私有 Codeup 仓库需要保证运行 API 的系统账号拥有对应 SSH Key，且首次连接所需的主机指纹已经加入 `known_hosts`。

## 当前 API

```text
GET  /api/health
GET  /api/auth/bootstrap-status
POST /api/auth/bootstrap
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
GET  /api/members
POST /api/members
PATCH /api/members/:userId/role
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
```

首次分析使用生产分支当前提交的第一父提交作为基线；之后使用项目上一次成功分析的目标 Commit 作为基线。只有 Git Diff 成功后才推进基线，失败任务不会影响下一次分析。

Symbol 分析支持 TypeScript、TSX 与 Vue SFC，能够识别 NestJS `@Controller` 配合 `@Get`、`@Post`、`@Put`、`@Patch`、`@Delete`、`@Head`、`@Options`、`@All` 声明的服务端路由，并将其与其他仓库中的 `fetch`、axios 及 `axios.create()` 实例调用关联。HTTP 路径中的模板表达式和 `:id` 参数会按动态路径段匹配；存在多个相同候选路由时会跳过关联，避免产生不确定的误报。

AI 分析默认关闭，并与变更分析分开执行。可在“AI 配置”页维护多条 OpenAI Chat Completions 或 Anthropic Messages 兼容接口，并选择一条默认启用配置。API Key 使用 `AI_CONFIG_ENCRYPTION_KEY`（未配置时回退数据库密码材料）派生密钥加密保存，页面只返回末四位。模型接收提交摘要、文件元数据、Symbol 调用链以及受控 Git Diff 证据：最多 24 个文本文件、单文件 5000 字符、总计 40000 字符；环境文件、证书、锁文件、构建产物和疑似密钥值会被过滤或脱敏。调用失败不会影响变更分析任务完成。

基础配置中的“待检测通知”支持启停和钉钉群机器人 Webhook。巡检发现待检测提交后发送通知，并通过项目与目标 Commit 去重；发送失败不会影响巡检结果，下次巡检会继续重试。Webhook 使用与 AI API Key 相同的加密材料保存，接口只返回掩码。

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
