-- Impact Flow database schema
-- Compatible with MySQL 8.0+

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE DATABASE IF NOT EXISTS impact_flow
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE impact_flow;

CREATE TABLE IF NOT EXISTS workspace (
  id CHAR(36) NOT NULL COMMENT '工作空间主键ID（UUID）',
  name VARCHAR(100) NOT NULL COMMENT '工作空间名称',
  code VARCHAR(100) NOT NULL COMMENT '工作空间唯一编码',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE/DISABLED',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_workspace_code (code)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='工作空间表';

INSERT INTO workspace (id, name, code)
VALUES ('00000000-0000-0000-0000-000000000001', '默认工作空间', 'default')
ON DUPLICATE KEY UPDATE id = VALUES(id);

CREATE TABLE IF NOT EXISTS user_account (
  id CHAR(36) NOT NULL COMMENT '用户主键ID（UUID）',
  username VARCHAR(100) NOT NULL COMMENT '登录用户名',
  password_hash VARCHAR(500) NOT NULL COMMENT '密码哈希',
  display_name VARCHAR(100) NOT NULL COMMENT '用户显示名称',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE/DISABLED',
  last_login_at DATETIME(3) NULL COMMENT '最近登录时间',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_account_username (username)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='用户账号表';

CREATE TABLE IF NOT EXISTS workspace_member (
  workspace_id CHAR(36) NOT NULL COMMENT '工作空间ID',
  user_id CHAR(36) NOT NULL COMMENT '用户ID',
  role VARCHAR(20) NOT NULL COMMENT '角色：OWNER/ADMIN/MEMBER/VIEWER',
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '加入时间',
  PRIMARY KEY (workspace_id, user_id),
  KEY idx_workspace_member_user (user_id),
  CONSTRAINT fk_workspace_member_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_member_user FOREIGN KEY (user_id) REFERENCES user_account (id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='工作空间成员表';

CREATE TABLE IF NOT EXISTS auth_session (
  id CHAR(36) NOT NULL COMMENT '会话主键ID（UUID）',
  user_id CHAR(36) NOT NULL COMMENT '用户ID',
  workspace_id CHAR(36) NOT NULL COMMENT '当前工作空间ID',
  token_hash CHAR(64) NOT NULL COMMENT '会话令牌SHA-256哈希',
  expires_at DATETIME(3) NOT NULL COMMENT '会话过期时间',
  revoked_at DATETIME(3) NULL COMMENT '会话撤销时间',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_auth_session_token (token_hash),
  KEY idx_auth_session_user (user_id, expires_at),
  CONSTRAINT fk_auth_session_user FOREIGN KEY (user_id) REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_auth_session_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='用户登录会话表';

CREATE TABLE IF NOT EXISTS audit_log (
  id CHAR(36) NOT NULL COMMENT '审计日志主键ID（UUID）',
  workspace_id CHAR(36) NULL COMMENT '关联工作空间ID',
  operator_id CHAR(36) NULL COMMENT '操作用户ID',
  action VARCHAR(100) NOT NULL COMMENT '操作类型',
  resource_type VARCHAR(50) NULL COMMENT '资源类型',
  resource_id VARCHAR(100) NULL COMMENT '资源ID',
  detail JSON NULL COMMENT '操作详情（JSON）',
  ip_address VARCHAR(64) NULL COMMENT '客户端IP地址',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_audit_workspace_time (workspace_id, created_at),
  KEY idx_audit_operator_time (operator_id, created_at),
  CONSTRAINT fk_audit_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_operator FOREIGN KEY (operator_id) REFERENCES user_account (id) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='系统操作审计日志表';

CREATE TABLE IF NOT EXISTS project (
  id CHAR(36) NOT NULL COMMENT '服务主键ID（UUID）',
  workspace_id CHAR(36) NOT NULL COMMENT '所属工作空间ID',
  name VARCHAR(100) NOT NULL COMMENT '服务名称',
  code VARCHAR(100) NOT NULL COMMENT '服务唯一编码',
  repository_url VARCHAR(1000) NOT NULL COMMENT 'Git仓库地址',
  production_branch VARCHAR(200) NOT NULL DEFAULT 'production' COMMENT '待巡检的目标分支',
  last_analyzed_commit VARCHAR(64) NULL COMMENT '最近一次完成变更分析的提交SHA',
  detected_commit VARCHAR(64) NULL COMMENT '最近一次巡检发现的提交SHA',
  previous_detected_commit VARCHAR(64) NULL COMMENT '上一次巡检发现的提交SHA',
  pending_commit_count INT NOT NULL DEFAULT 0 COMMENT '当前待检测提交数量',
  pending_commits JSON NULL COMMENT '当前待检测提交摘要列表（JSON）',
  last_checked_at DATETIME(3) NULL COMMENT '最近一次巡检时间',
  check_status VARCHAR(20) NOT NULL DEFAULT 'IDLE' COMMENT '巡检状态：IDLE/CHECKING/SUCCESS/FAILED',
  check_error VARCHAR(2000) NULL COMMENT '最近一次巡检失败信息',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_project_workspace_code (workspace_id, code),
  KEY idx_project_workspace (workspace_id),
  CONSTRAINT fk_project_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='服务配置表';

CREATE TABLE IF NOT EXISTS project_inspection_log (
  id CHAR(36) NOT NULL COMMENT '巡检日志主键ID（UUID）',
  project_id CHAR(36) NOT NULL COMMENT '关联服务ID',
  trigger_type VARCHAR(20) NOT NULL COMMENT '触发方式：MANUAL/SCHEDULED',
  status VARCHAR(20) NOT NULL COMMENT '巡检状态：RUNNING/SUCCESS/FAILED',
  detected_commit VARCHAR(64) NULL COMMENT '本次巡检发现的提交SHA',
  pending_commit_count INT NOT NULL DEFAULT 0 COMMENT '本次巡检发现的待检测提交数量',
  error_message VARCHAR(2000) NULL COMMENT '巡检失败信息',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '巡检开始时间',
  finished_at DATETIME(3) NULL COMMENT '巡检完成时间',
  PRIMARY KEY (id),
  KEY idx_inspection_log_time (started_at),
  KEY idx_inspection_log_project_time (project_id, started_at),
  CONSTRAINT fk_inspection_log_project
    FOREIGN KEY (project_id) REFERENCES project (id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='服务巡检日志表';

CREATE TABLE IF NOT EXISTS `release` (
  id CHAR(36) NOT NULL COMMENT '发布记录主键ID（UUID）',
  project_id CHAR(36) NOT NULL COMMENT '关联服务ID',
  base_commit VARCHAR(64) NOT NULL COMMENT '变更分析起始提交SHA',
  target_commit VARCHAR(64) NOT NULL COMMENT '变更分析目标提交SHA',
  version VARCHAR(100) NULL COMMENT '业务发布版本号',
  status VARCHAR(30) NOT NULL COMMENT '发布检测状态',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_release_project_time (project_id, created_at),
  CONSTRAINT fk_release_project
    FOREIGN KEY (project_id) REFERENCES project (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='发布版本记录表';

CREATE TABLE IF NOT EXISTS analysis_task (
  id CHAR(36) NOT NULL COMMENT '分析任务主键ID（UUID）',
  project_id CHAR(36) NOT NULL COMMENT '关联服务ID',
  release_id CHAR(36) NOT NULL COMMENT '关联发布记录ID',
  base_commit VARCHAR(64) NOT NULL COMMENT '分析起始提交SHA',
  target_commit VARCHAR(64) NOT NULL COMMENT '分析目标提交SHA',
  status VARCHAR(30) NOT NULL COMMENT '任务状态：READY/RUNNING/SUCCESS/FAILED/NO_CHANGES',
  commit_count INT NOT NULL DEFAULT 0 COMMENT '间隔提交数量',
  changed_file_count INT NOT NULL DEFAULT 0 COMMENT '变更文件数量',
  additions INT NOT NULL DEFAULT 0 COMMENT '新增代码行数',
  deletions INT NOT NULL DEFAULT 0 COMMENT '删除代码行数',
  commit_summary JSON NULL COMMENT '提交摘要列表（JSON）',
  error_message VARCHAR(2000) NULL COMMENT '分析失败信息',
  risk_level VARCHAR(20) NULL COMMENT '规则分析风险等级',
  risk_summary VARCHAR(1000) NULL COMMENT '规则分析风险摘要',
  impacted_modules JSON NULL COMMENT '规则分析影响模块列表（JSON）',
  regression_suggestions JSON NULL COMMENT '规则分析回归建议列表（JSON）',
  symbol_summary VARCHAR(1000) NULL COMMENT 'TypeScript Symbol分析摘要',
  symbol_changes JSON NULL COMMENT 'TypeScript Symbol变更列表（JSON）',
  symbol_impacts JSON NULL COMMENT 'TypeScript Symbol调用影响列表（JSON）',
  change_evidence JSON NULL COMMENT '变更证据与调用链信息（JSON）',
  ai_analysis JSON NULL COMMENT 'AI分析结果（JSON）',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '任务创建时间',
  finished_at DATETIME(3) NULL COMMENT '任务完成时间',
  PRIMARY KEY (id),
  KEY idx_analysis_project_time (project_id, created_at),
  KEY idx_analysis_status (status),
  CONSTRAINT fk_analysis_project
    FOREIGN KEY (project_id) REFERENCES project (id),
  CONSTRAINT fk_analysis_release
    FOREIGN KEY (release_id) REFERENCES `release` (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='变更影响分析任务表';

CREATE TABLE IF NOT EXISTS ai_provider_config (
  id CHAR(36) NOT NULL COMMENT 'AI配置主键ID（UUID）',
  workspace_id CHAR(36) NOT NULL COMMENT '所属工作空间ID',
  name VARCHAR(100) NOT NULL COMMENT 'AI配置名称',
  base_url VARCHAR(500) NOT NULL COMMENT 'AI接口基础地址',
  api_key_encrypted TEXT NOT NULL COMMENT '加密后的API Key',
  api_key_hint VARCHAR(20) NOT NULL COMMENT 'API Key脱敏展示尾段',
  model VARCHAR(150) NOT NULL COMMENT '模型名称',
  api_format VARCHAR(20) NOT NULL DEFAULT 'OPENAI' COMMENT '接口协议格式：OPENAI/ANTHROPIC',
  enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用：0否/1是',
  is_default TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为默认配置：0否/1是',
  timeout_ms INT NOT NULL DEFAULT 30000 COMMENT 'AI请求超时时间（毫秒）',
  max_files INT NOT NULL DEFAULT 80 COMMENT '单次AI分析最大文件数量',
  max_symbols INT NOT NULL DEFAULT 50 COMMENT '单次AI分析最大Symbol数量',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_ai_provider_default (is_default, enabled),
  KEY idx_ai_provider_workspace (workspace_id),
  CONSTRAINT fk_ai_provider_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='AI服务商配置表';

CREATE TABLE IF NOT EXISTS ai_analysis_log (
  id CHAR(36) NOT NULL COMMENT 'AI分析日志主键ID（UUID）',
  analysis_task_id CHAR(36) NOT NULL COMMENT '关联分析任务ID',
  project_id CHAR(36) NOT NULL COMMENT '关联服务ID',
  status VARCHAR(30) NOT NULL COMMENT 'AI分析状态：RUNNING/SUCCESS/FAILED/SKIPPED',
  model VARCHAR(150) NULL COMMENT '本次调用的模型名称',
  error_message VARCHAR(2000) NULL COMMENT 'AI分析失败信息',
  token_usage JSON NULL COMMENT '模型Token用量（JSON）',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT 'AI分析开始时间',
  finished_at DATETIME(3) NULL COMMENT 'AI分析完成时间',
  PRIMARY KEY (id),
  KEY idx_ai_analysis_log_project_time (project_id, started_at),
  KEY idx_ai_analysis_log_task_time (analysis_task_id, started_at),
  CONSTRAINT fk_ai_analysis_log_task
    FOREIGN KEY (analysis_task_id) REFERENCES analysis_task (id),
  CONSTRAINT fk_ai_analysis_log_project
    FOREIGN KEY (project_id) REFERENCES project (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='AI分析执行日志表';

CREATE TABLE IF NOT EXISTS pending_notification_config (
  workspace_id CHAR(36) NOT NULL COMMENT '所属工作空间ID',
  enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用待检测通知：0否/1是',
  webhook_encrypted TEXT NULL COMMENT '加密后的钉钉机器人Webhook',
  webhook_hint VARCHAR(32) NULL COMMENT 'Webhook脱敏展示尾段',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (workspace_id),
  CONSTRAINT fk_pending_notification_workspace FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='待检测通知全局配置表';

INSERT INTO pending_notification_config (workspace_id, enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 0)
ON DUPLICATE KEY UPDATE workspace_id = VALUES(workspace_id);

CREATE TABLE IF NOT EXISTS pending_notification_delivery (
  id CHAR(36) NOT NULL COMMENT '通知投递记录主键ID（UUID）',
  project_id CHAR(36) NOT NULL COMMENT '关联服务ID',
  target_commit VARCHAR(64) NOT NULL COMMENT '已通知的目标提交SHA',
  delivered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '通知成功投递时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_pending_notification_delivery (project_id, target_commit),
  KEY idx_pending_notification_delivery_time (delivered_at),
  CONSTRAINT fk_pending_notification_delivery_project
    FOREIGN KEY (project_id) REFERENCES project (id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='待检测通知成功投递记录表';

CREATE TABLE IF NOT EXISTS change_file (
  id CHAR(36) NOT NULL COMMENT '变更文件主键ID（UUID）',
  analysis_task_id CHAR(36) NOT NULL COMMENT '关联分析任务ID',
  file_path VARCHAR(1000) NOT NULL COMMENT '变更后的文件路径',
  old_path VARCHAR(1000) NULL COMMENT '重命名前的文件路径',
  change_type VARCHAR(10) NOT NULL COMMENT '变更类型：A新增/M修改/D删除/R重命名/C复制/T类型变化/U未合并',
  additions INT NOT NULL DEFAULT 0 COMMENT '文件新增行数',
  deletions INT NOT NULL DEFAULT 0 COMMENT '文件删除行数',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_change_file_analysis (analysis_task_id),
  CONSTRAINT fk_change_file_analysis
    FOREIGN KEY (analysis_task_id) REFERENCES analysis_task (id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='分析任务变更文件明细表';
