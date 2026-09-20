-- 第一阶段账号体系：用户、工作空间、成员、会话与审计
-- 将现有业务数据迁移到默认工作空间，兼容后续多租户扩展

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
  CONSTRAINT fk_workspace_member_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_member_user
    FOREIGN KEY (user_id) REFERENCES user_account (id) ON DELETE CASCADE
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
  CONSTRAINT fk_auth_session_user
    FOREIGN KEY (user_id) REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_auth_session_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE
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
  CONSTRAINT fk_audit_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_operator
    FOREIGN KEY (operator_id) REFERENCES user_account (id) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='系统操作审计日志表';

ALTER TABLE project
  ADD COLUMN workspace_id CHAR(36) NULL COMMENT '所属工作空间ID' AFTER id;
UPDATE project
SET workspace_id = '00000000-0000-0000-0000-000000000001'
WHERE workspace_id IS NULL;
ALTER TABLE project
  MODIFY COLUMN workspace_id CHAR(36) NOT NULL COMMENT '所属工作空间ID',
  DROP INDEX uk_project_code,
  ADD UNIQUE KEY uk_project_workspace_code (workspace_id, code),
  ADD KEY idx_project_workspace (workspace_id),
  ADD CONSTRAINT fk_project_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspace (id);

ALTER TABLE ai_provider_config
  ADD COLUMN workspace_id CHAR(36) NULL COMMENT '所属工作空间ID' AFTER id;
UPDATE ai_provider_config
SET workspace_id = '00000000-0000-0000-0000-000000000001'
WHERE workspace_id IS NULL;
ALTER TABLE ai_provider_config
  MODIFY COLUMN workspace_id CHAR(36) NOT NULL COMMENT '所属工作空间ID',
  ADD KEY idx_ai_provider_workspace (workspace_id),
  ADD CONSTRAINT fk_ai_provider_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE;

ALTER TABLE pending_notification_config
  ADD COLUMN workspace_id CHAR(36) NULL COMMENT '所属工作空间ID' AFTER id;
UPDATE pending_notification_config
SET workspace_id = '00000000-0000-0000-0000-000000000001'
WHERE workspace_id IS NULL;
ALTER TABLE pending_notification_config
  DROP PRIMARY KEY,
  DROP COLUMN id,
  MODIFY COLUMN workspace_id CHAR(36) NOT NULL COMMENT '所属工作空间ID',
  ADD PRIMARY KEY (workspace_id),
  ADD CONSTRAINT fk_pending_notification_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE;
