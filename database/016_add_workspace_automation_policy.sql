USE impact_flow;

CREATE TABLE IF NOT EXISTS workspace_automation_policy (
  workspace_id CHAR(36) NOT NULL COMMENT '所属工作空间ID',
  automation_code VARCHAR(100) NOT NULL COMMENT '自动化策略编码',
  enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用：0否/1是',
  settings JSON NULL COMMENT '自动化策略非敏感参数（JSON）',
  config_version INT NOT NULL DEFAULT 1 COMMENT '配置结构版本',
  updated_by CHAR(36) NULL COMMENT '最后修改用户ID',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (workspace_id, automation_code),
  CONSTRAINT fk_automation_policy_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE,
  CONSTRAINT fk_automation_policy_updater
    FOREIGN KEY (updated_by) REFERENCES user_account (id) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='工作空间自动化策略表';

ALTER TABLE analysis_task
  ADD COLUMN ai_analysis_requested TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '变更分析成功后是否自动执行AI分析'
    AFTER ai_analysis;
