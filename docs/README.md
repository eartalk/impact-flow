# Impact Flow 文档中心

本目录统一存放 Impact Flow 的项目说明、架构设计、实施计划和部署文档。

## 文档索引

| 文档 | 说明 |
| --- | --- |
| [项目说明](./project-readme.md) | 项目结构、本地启动、环境变量、数据库迁移和常用命令 |
| [服务知识大纲设计](./service-knowledge-atlas-design.md) | 服务接入后的全量认知、知识图谱、AI大纲、增量更新和变更分析复用方案 |
| [变更分析到自动化执行详细设计](./change-analysis-ai-automation-design.md) | 变更分析、AI补充、一级模块圈定、现有自动化调用的完整设计 |
| [Git变更影响分析MVP设计](./git_change_impact_ai_regression_mvp_design.md) | 项目早期目标、范围和MVP方案 |
| [工作空间与平台能力完善方案](./workspace_management_improvement_plan.md) | 多工作空间、权限、安全和平台能力规划 |
| [生产部署说明](./DEPLOYMENT.md) | 生产环境部署流程和常用参数 |

## 文档维护约定

- 项目Markdown文档统一放在`docs/`目录。
- 设计文档必须区分当前已实现能力和规划能力。
- 架构、数据结构或外部接口发生变化时同步更新对应文档。
- Mermaid图中的模块编码、状态名称和数据字段应与共享契约保持一致。
