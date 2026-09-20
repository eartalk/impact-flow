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
→ 反向追踪最多 3 层项目内静态调用链
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

数据库初始化脚本为 `database/impact_flow_schema.sql`。已有数据库依次执行 `database/002_add_table_column_comments.sql`、`database/003_add_project_inspection.sql`、`database/004_add_project_inspection_log.sql`、`database/005_add_analysis_impact.sql` 和 `database/006_add_analysis_symbols.sql`。

私有 Codeup 仓库需要保证运行 API 的系统账号拥有对应 SSH Key，且首次连接所需的主机指纹已经加入 `known_hosts`。

## 当前 API

```text
GET  /api/health
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
GET  /api/analyses/:id
POST /api/analyses
```

首次分析使用生产分支当前提交的第一父提交作为基线；之后使用项目上一次成功分析的目标 Commit 作为基线。只有 Git Diff 成功后才推进基线，失败任务不会影响下一次分析。

## 验证

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 下一阶段

1. 增加钉钉新推送与巡检失败通知。
2. 扩展 HTTP/RPC 路由级跨仓库调用链和动态调用识别。
3. 接入可配置的 AI 模型，对确定性风险规则的结果进行补充说明。
4. 将应用内后台队列升级为独立 Worker，支持并发限制与任务重试。
