# Git 变更影响分析与智能回归平台设计方案

## 1. 项目背景

当前项目存在以下典型问题：

- 项目服务数量较多
- 发版频率较高
- 每次发版无法完整覆盖所有关联功能
- 测试人员难以快速判断代码改动的真实影响范围
- 部分改动虽然只修改了一个方法，但可能通过调用链影响多个接口、页面和业务模块
- 人工判断回归范围高度依赖开发和测试经验，容易出现漏测
- 线上问题可能来源于“间接影响未被识别”

因此，需要建设一套基于 Git 变更记录和 AI 分析能力的智能回归分析平台。

平台核心目标：

> 根据两个生产版本之间的 Git 代码差异，识别代码改动范围，分析调用关系、接口影响和业务影响，并通过 AI 生成建议回归范围。

---

# 2. 核心问题

平台主要解决以下问题：

```text
这次发版改了什么？

↓  

这些代码被哪些地方调用？

↓  

影响哪些接口？

↓  

影响哪些业务模块？

↓  

影响哪些 PC / App / 小程序页面？

↓  

应该回归哪些功能？

↓  

哪些场景风险最高？
```

最终希望解决的核心问题是：

> 我改了 A，到底还需要测试哪些 B、C、D？

---

# 3. MVP 目标

第一阶段不追求完整自动化测试平台，而是验证最核心价值。

MVP 目标：

```text
生产版本 A

↓

生产版本 B

↓

Git Diff

↓

代码改动分析

↓

方法 / 类识别

↓

调用关系分析

↓

API 影响分析

↓

业务模块影响分析

↓

DeepSeek AI 分析

↓

生成回归建议
```

第一版重点回答：

1. 本次发版改了哪些文件
2. 改了哪些类和方法
3. 哪些 API 可能受到影响
4. 哪些业务模块可能受到影响
5. 哪些地方属于高风险
6. 建议测试人员回归哪些场景

---

# 4. MVP 暂不实现的能力

第一版暂不实现以下能力：

- 完整跨服务依赖图谱
- Git 历史变更耦合分析
- 自动执行 UI 自动化
- 自动执行 App 自动化
- 自动阻断发布
- 复杂 AI Agent
- Kafka
- 微服务化部署
- 向量数据库
- pgvector
- 完整测试用例自动推荐
- 全语言精准 AST 分析
- 自动构建大型企业级知识图谱

优先保证核心链路能够跑通。

---

# 5. 技术栈

## 5.1 前端

```text
Vue3
TypeScript
Element Plus
Vite
```

主要页面：

- 项目管理
- 仓库管理
- 发布版本管理
- 版本差异分析
- AI 影响分析
- 回归建议
- 分析历史

---

## 5.2 后端

```text
NestJS
TypeScript
```

主要模块：

```text
ProjectModule
RepositoryModule
ReleaseModule
GitModule
CodeAnalysisModule
ImpactModule
AiModule
RegressionModule
AnalysisModule
```

---

## 5.3 数据库

```text
MySQL 8.x
```

MVP 不引入 PostgreSQL。

---

## 5.4 Git

```text
simple-git
```

主要负责：

- clone
- fetch
- checkout
- log
- diff
- 获取 Commit
- 获取 Tag
- 获取 Branch

---

## 5.5 代码搜索

第一阶段建议：

```text
ripgrep
```

用途：

- 搜索方法调用
- 搜索类引用
- 搜索 Controller
- 搜索 Service
- 快速查找代码关系

---

## 5.6 代码解析

后续逐步引入：

```text
Tree-sitter
```

用于解析：

- Class
- Method
- Import
- Function Call
- Decorator
- Controller
- API Route

MVP 第一阶段可以采用：

```text
ripgrep + 简单代码解析
```

后续再增强为：

```text
Tree-sitter + 静态调用图
```

---

# 6. AI 模型

第一阶段使用：

```text
DeepSeek API
```

AI 不负责直接扫描整个 Git 仓库。

AI 的职责主要是：

1. 理解代码修改含义
2. 判断修改逻辑风险
3. 分析业务影响
4. 补充测试边界场景
5. 输出建议回归范围
6. 解释为什么需要回归

---

# 7. 系统总体架构

```text
┌─────────────────────────────────────┐
│              Vue3 Web               │
│                                     │
│ 项目管理 / 版本分析 / 回归分析       │
└──────────────────┬──────────────────┘
                   │
                   ▼
┌─────────────────────────────────────┐
│               NestJS                │
│                                     │
│ Project                             │
│ Release                             │
│ Analysis                            │
│ Regression                          │
└─────────┬───────────┬───────────────┘
          │           │
          ▼           ▼
┌──────────────┐   ┌──────────────────┐
│ Git Service  │   │ MySQL 8          │
│              │   │                  │
│ clone/fetch  │   │ project          │
│ diff         │   │ release          │
│ log          │   │ analysis_task    │
└──────┬───────┘   │ change_file      │
       │           │ change_symbol    │
       ▼           │ analysis_result  │
┌──────────────┐   └──────────────────┘
│ Code Analyzer│
│              │
│ ripgrep      │
│ Tree-sitter  │
└──────┬───────┘
       │
       ▼
┌─────────────────┐
│ Impact Engine   │
│                 │
│ 修改方法        │
│ 调用关系        │
│ API影响         │
│ 模块影响        │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ DeepSeek API    │
│                 │
│ 改动理解        │
│ 风险分析        │
│ 回归建议        │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Regression      │
│                 │
│ 回归模块        │
│ 回归场景        │
│ 风险等级        │
└─────────────────┘
```

---

# 8. 核心业务链路

系统核心业务链路如下：

```text
Git
↓
NestJS
↓
代码分析
↓
影响分析
↓
DeepSeek
↓
回归建议
↓
MySQL
↓
Vue 展示
```

更完整的链路：

```text
开发提交代码
      ↓
Merge 到 production
      ↓
记录 production commit
      ↓
创建 Release
      ↓
找到上次生产版本 commit
      ↓
Git Diff
      ↓
识别修改文件
      ↓
识别修改类 / 方法
      ↓
分析调用关系
      ↓
向上查找受影响 Controller
      ↓
定位 API
      ↓
API → 业务模块
      ↓
业务模块 → 页面
      ↓
生成 Impact Context
      ↓
DeepSeek 分析
      ↓
风险说明
      ↓
测试场景建议
      ↓
生成本次回归范围
      ↓
测试人员确认
```

---

# 9. 版本分析方式

不建议直接分析：

```bash
git log -10
```

因为最近提交并不等于一次生产发布的真实改动。

正确方式：

```text
上一次生产版本 Commit

↓

当前生产版本 Commit
```

例如：

```text
旧生产版本：

a8f9412

当前生产版本：

c831af7
```

执行：

```bash
git diff a8f9412..c831af7
```

获取真实版本差异。

也可以基于 Tag：

```bash
git diff v2.8.14..v2.8.15
```

---

# 10. Git 分析流程

## 10.1 获取修改文件

执行：

```bash
git diff --name-status a8f9412..c831af7
```

示例：

```text
M src/worksite/worksite.service.ts
M src/worksite/worksite.controller.ts
A src/worksite/status.service.ts
D src/worksite/old.service.ts
```

状态说明：

```text
M = Modify
A = Add
D = Delete
R = Rename
```

---

## 10.2 获取完整 Diff

```bash
git diff a8f9412..c831af7
```

系统保存：

- 文件
- 新增行
- 删除行
- 修改内容
- 修改位置

---

# 11. 代码分析

Git 分析完成后进入 CodeAnalyzer。

CodeAnalyzer 负责把：

```text
文件变化
```

进一步转换成：

```text
Class

Method

Function

Controller

API

调用关系
```

例如：

```text
修改文件：

src/worksite/worksite.service.ts
```

进一步识别：

```text
Class:

WorksiteService

Method:

calculateStatus
```

最终形成：

```text
WorksiteService.calculateStatus
```

---

# 12. 调用链分析

这是整个系统最核心的能力之一。

例如代码关系：

```text
WorksiteController.getDetail

↓

WorksiteService.getDetail

↓

WorksiteStatusService.calculateStatus
```

现在 Git 修改：

```text
WorksiteStatusService.calculateStatus
```

系统需要反向查询：

```text
谁调用了 calculateStatus？
```

得到：

```text
WorksiteService.getDetail
WorksiteService.getList
NodeService.completeNode
```

继续向上查：

```text
WorksiteController.getDetail
WorksiteController.getList
NodeController.complete
```

最后识别接口：

```text
GET /worksite/:id

GET /worksite/list

POST /node/complete
```

最终得到：

```text
修改方法：1

影响方法：6

影响接口：3

影响模块：

工地详情
工地列表
节点完工
```

---

# 13. Impact Propagation

代码影响需要向上传播。

例如：

```text
calculateStatus()
        ▲
        │
WorksiteService.getDetail()
        ▲
        │
WorksiteController.detail()
        ▲
        │
GET /worksite/:id
```

因此：

```text
calculateStatus
```

虽然只是一个方法修改，但可能影响：

```text
GET /worksite/:id
```

进一步影响：

```text
PC 工地详情

App 工地详情
```

这就是：

```text
Impact Propagation
```

即影响传播。

---

# 14. 防止影响范围无限扩散

如果修改的是公共方法：

```text
common.util
```

可能被大量代码调用。

如果无限传播，最终可能变成：

```text
整个系统都需要回归
```

这样分析就没有意义。

因此需要限制传播。

建议第一版：

```text
最大调用深度：

Depth = 3
```

例如：

```text
直接修改

confidence = 1.0

一级调用

confidence = 0.9

二级调用

confidence = 0.75

三级调用

confidence = 0.55
```

后续还可以结合：

- 修改类型
- 调用深度
- API 暴露情况
- 模块重要性
- 历史缺陷
- 是否公共方法

判断是否继续传播。

---

# 15. AI 在系统中的位置

错误方式：

```text
Git Diff
↓
AI
↓
回归结果
```

这种方式容易出现：

- 上下文不足
- AI 幻觉
- 调用关系遗漏
- 业务影响判断不准确

推荐方式：

```text
Git Diff
      │
      ▼
代码分析
      │
      ▼
静态调用关系
      │
      ▼
API关系
      │
      ▼
业务模块
      │
      ▼
Impact Context
      │
      ▼
DeepSeek
```

---

# 16. DeepSeek 输入结构

后端先组织结构化上下文。

示例：

```json
{
  "project": "worksite-service",
  "baseCommit": "a8f9412",
  "targetCommit": "c831af7",
  "changedFiles": [
    "src/worksite/worksite.service.ts"
  ],
  "changedSymbols": [
    {
      "class": "WorksiteService",
      "method": "calculateStatus"
    }
  ],
  "diff": "...",
  "callers": [
    "WorksiteService.getDetail",
    "WorksiteService.getList",
    "NodeService.completeNode"
  ],
  "apis": [
    "GET /worksite/:id",
    "GET /worksite/list",
    "POST /node/complete"
  ],
  "modules": [
    "工地详情",
    "工地列表",
    "节点完工"
  ]
}
```

---

# 17. DeepSeek 输出格式

要求 DeepSeek 返回结构化 JSON。

例如：

```json
{
  "summary": "修改工地状态边界判断逻辑",
  "riskLevel": "HIGH",
  "risks": [
    "结束时间等于当前时间时状态发生变化",
    "工地列表状态可能受到影响",
    "节点完成后的状态计算可能受到影响"
  ],
  "regressionScopes": [
    {
      "module": "工地列表",
      "priority": "P0",
      "reason": "列表接口直接依赖修改后的状态计算方法"
    },
    {
      "module": "工地详情",
      "priority": "P0",
      "reason": "详情接口直接调用修改方法"
    }
  ],
  "testScenarios": [
    "当前时间小于结束时间",
    "当前时间等于结束时间",
    "当前时间大于结束时间"
  ]
}
```

---

# 18. AI 模块设计

DeepSeek 不应该直接写死在 AnalysisService 中。

建议统一抽象：

```text
AnalysisService
      ↓
AiService
      ↓
AiProvider
      ↓
DeepSeekProvider
```

接口：

```ts
interface AiProvider {
  analyzeImpact(
    input: ImpactAnalysisInput
  ): Promise<ImpactAnalysisResult>
}
```

当前：

```text
DeepSeekProvider
```

后续可以扩展：

```text
OpenAIProvider

ClaudeProvider

QwenProvider

GeminiProvider
```

业务层无需修改。

---

# 19. DeepSeek API Key 管理

不要把 API Key 写死在代码中。

错误：

```ts
const apiKey = 'sk-xxxxxxxx';
```

推荐使用环境变量。

`.env`：

```env
DEEPSEEK_API_KEY=xxxxxxxxxxxx

DEEPSEEK_BASE_URL=xxxx

DEEPSEEK_MODEL=xxxx
```

NestJS：

```text
ConfigModule

↓

DeepSeekService
```

同时：

`.gitignore`：

```text
.env
.env.local
```

生产环境可以使用：

```text
Docker Environment

或

CI/CD Secret
```

---

# 20. NestJS 模块结构

建议目录：

```text
src/

modules/

  project/
    project.controller.ts
    project.service.ts
    project.module.ts

  repository/
    repository.controller.ts
    repository.service.ts
    repository.module.ts

  release/
    release.controller.ts
    release.service.ts
    release.module.ts

  git/
    git.service.ts
    git.module.ts

  code-analysis/
    code-analysis.service.ts
    parser.service.ts
    symbol.service.ts
    dependency.service.ts
    code-analysis.module.ts

  impact/
    impact.service.ts
    propagation.service.ts
    impact.module.ts

  ai/
    ai.service.ts
    deepseek.service.ts
    prompt.service.ts
    ai.module.ts

  regression/
    regression.service.ts
    regression.module.ts

  analysis/
    analysis.controller.ts
    analysis.service.ts
    analysis.module.ts
```

---

# 21. 核心服务调用关系

```text
AnalysisController

↓

AnalysisService

├── ReleaseService

├── GitService

├── CodeAnalysisService

├── ImpactService

├── AiService

└── RegressionService
```

---

# 22. 一次分析任务的调用链

用户点击：

```text
开始分析
```

前端调用：

```http
POST /api/analysis
```

调用过程：

```text
Vue

↓

AnalysisController

↓

AnalysisService

↓

创建 analysis_task

↓

ReleaseService

↓

获取 baseCommit

获取 targetCommit

↓

GitService

↓

git fetch

git diff

git diff --name-status

↓

ChangeParser

↓

修改文件

↓

CodeAnalyzer

↓

修改方法

Class

调用位置

Controller

API

↓

ImpactService

↓

整理影响上下文

↓

AiService

↓

DeepSeekService

↓

DeepSeek API

↓

结构化 JSON

↓

RegressionService

↓

清洗

去重

排序

↓

MySQL

↓

Vue
```

---

# 23. MVP MySQL 数据库设计

第一阶段建议只建立 7 张核心表。

```text
project

repository

release

analysis_task

change_file

change_symbol

analysis_result
```

---

# 24. project

项目表。

建议字段：

```text
id

name

code

description

created_at

updated_at
```

---

# 25. repository

Git 仓库表。

建议字段：

```text
id

project_id

name

repo_url

local_path

production_branch

created_at

updated_at
```

示例：

```text
name:

worksite-service

production_branch:

production
```

---

# 26. release

生产发布记录。

建议字段：

```text
id

project_id

repository_id

base_commit

target_commit

version

status

created_at
```

例如：

```text
base_commit:

a8f9412

target_commit:

c831af7

version:

v2.8.15
```

---

# 27. analysis_task

分析任务。

建议字段：

```text
id

project_id

release_id

status

started_at

finished_at

error_message

created_at
```

状态：

```text
PENDING

RUNNING

SUCCESS

FAILED
```

---

# 28. change_file

代码文件变更。

建议字段：

```text
id

analysis_task_id

file_path

change_type

additions

deletions

diff_content
```

change_type：

```text
M

A

D

R
```

---

# 29. change_symbol

方法 / 类级变化。

建议字段：

```text
id

analysis_task_id

change_file_id

symbol_type

class_name

method_name

change_type

start_line

end_line
```

symbol_type 示例：

```text
CLASS

METHOD

FUNCTION
```

---

# 30. analysis_result

AI 分析结果。

建议字段：

```text
id

analysis_task_id

summary

risk_level

affected_modules

affected_apis

regression_scopes

test_scenarios

ai_raw_result

created_at
```

其中：

```text
affected_modules

affected_apis

regression_scopes

test_scenarios

ai_raw_result
```

MVP 阶段建议直接使用 MySQL JSON 类型。

---

# 31. MVP API 设计

## 创建项目

```http
POST /api/projects
```

---

## 创建仓库

```http
POST /api/repositories
```

---

## 创建发布版本

```http
POST /api/releases
```

示例：

```json
{
  "projectId": 1,
  "repositoryId": 1,
  "baseCommit": "a8f9412",
  "targetCommit": "c831af7",
  "version": "v2.8.15"
}
```

---

## 创建分析任务

```http
POST /api/analysis
```

示例：

```json
{
  "releaseId": 10
}
```

---

## 查询分析结果

```http
GET /api/analysis/:id
```

---

# 32. 前端分析页面设计

页面结构建议：

```text
项目：

[ worksite-service ▼ ]

生产基线：

[ v2.8.14 ▼ ]

目标版本：

[ v2.8.15 ▼ ]

[ 开始分析 ]
```

分析完成后：

```text
本次修改：

17 个文件

后端：

12

前端：

5

影响 API：

8

高风险：

3

建议回归：

21 项
```

---

# 33. 分析结果展示

建议分成以下区域。

## 33.1 代码改动

```text
src/worksite/worksite.service.ts

src/worksite/worksite.controller.ts
```

---

## 33.2 核心改动

```text
修改工地状态计算逻辑

新增结束时间边界判断
```

---

## 33.3 影响接口

```text
GET /worksite/:id

GET /worksite/list

POST /node/complete
```

---

## 33.4 影响业务

```text
工地详情

工地列表

节点完工
```

---

## 33.5 风险

```text
HIGH
```

风险说明：

```text
修改了工地状态计算边界条件。

当前时间等于阶段结束时间时，
系统状态结果发生变化。
```

---

## 33.6 推荐回归

```text
P0

☐ 工地列表状态展示

☐ 工地详情状态展示

☐ 节点完工后工地状态更新

☐ 当前时间 = 结束时间


P1

☐ App 工地详情

☐ 工地阶段展示
```

---

# 34. MVP 阶段是否需要 Redis

第一阶段不建议引入 Redis。

当前链路：

```text
Vue

↓

NestJS

↓

Git

↓

Code Analysis

↓

DeepSeek

↓

MySQL
```

已经足够。

如果后续出现：

```text
单次分析耗时 30 秒以上

多个分析任务并行

大型仓库分析

DeepSeek 响应较慢
```

再增加：

```text
Redis

+

BullMQ
```

架构演进：

```text
POST /analysis

↓

创建任务

↓

BullMQ

↓

Worker

↓

Git Analysis

↓

Code Analysis

↓

DeepSeek

↓

MySQL
```

前端：

```text
GET /analysis/:id
```

轮询状态。

---

# 35. 第二阶段能力

MVP 验证成功后，可以增加：

```text
Method

↓

API

↓

Business Module

↓

Page

↓

TestCase
```

增加数据库：

```text
api

business_module

page

test_case

dependency

test_relation
```

最终形成真正的影响图谱。

---

# 36. 第三阶段能力

后续可以逐步增加：

## Git 历史耦合

分析：

```text
A.java
```

过去是否经常和：

```text
B.java
C.vue
```

一起变化。

用于发现静态调用图无法发现的隐式关联。

---

## 历史缺陷关联

例如：

```text
某模块过去 20 次上线发生 5 次 Bug
```

则提高风险等级。

---

## 测试覆盖率

判断：

```text
受影响功能
```

是否存在：

```text
接口自动化

UI 自动化

人工用例
```

---

## 自动执行测试

未来：

```text
Git Push

↓

代码影响分析

↓

推荐测试用例

↓

自动选择测试集

↓

pytest

↓

Selenium

↓

Allure

↓

AI Summary
```

---

# 37. 最终演进方向

最终平台可以从：

```text
Git + AI 分析工具
```

逐步发展为：

```text
智能回归决策平台
```

完整链路：

```text
代码提交

↓

版本发布

↓

Git Diff

↓

代码影响分析

↓

调用链分析

↓

API影响

↓

业务影响

↓

测试资产匹配

↓

AI风险分析

↓

自动生成回归计划

↓

自动执行测试

↓

分析测试结果

↓

记录线上缺陷

↓

历史数据反哺

↓

下一次分析
```

---

# 38. MVP 成功标准

建议重点关注三个指标。

## 回归建议有效率

```text
测试人员认为 AI 推荐结果有效：

≥ 70%
```

---

## 核心场景覆盖率

```text
真实需要回归的核心功能：

覆盖 ≥ 80%
```

---

## 回归分析效率

例如：

```text
以前：

人工分析 30 分钟

现在：

系统分析 + 人工确认

5 ~ 10 分钟
```

目标：

```text
人工分析时间下降 ≥ 50%
```

---

# 39. MVP 最终架构

```text
               Vue3
                 │
                 ▼
              NestJS
                 │
       ┌─────────┴─────────┐
       │                   │
       ▼                   ▼
      Git                MySQL
       │
       ▼
  Diff Analyzer
       │
       ▼
  Code Analyzer
       │
       ▼
  Impact Context
       │
       ▼
   DeepSeek API
       │
       ▼
 Regression Result
       │
       ▼
      MySQL
       │
       ▼
      Vue3
```

---

# 40. 第一版核心目标总结

第一版只需要真正打通以下链路：

```text
Commit A

↓

Commit B

↓

Git Diff

↓

修改文件

↓

修改 Method

↓

反查调用者

↓

Controller

↓

API

↓

业务模块

↓

DeepSeek

↓

风险分析

↓

建议回归范围
```

只要这条链路稳定跑通，就说明整个项目的核心架构成立。

后续所有：

```text
自动化测试

测试用例推荐

跨服务分析

风险评分

历史缺陷学习

Git变更耦合

CI/CD集成
```

都可以在这个基础上逐步增加。
