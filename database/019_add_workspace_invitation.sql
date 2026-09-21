-- 工作空间邀请
--
-- 邀请支持两类目标：
--   NEW       邀请系统里不存在的账号，接受时由对方自设用户名与密码
--   EXISTING  邀请已存在的账号，接受时只需对方登录确认
--
-- 邀请令牌只存 SHA-256 哈希，不存明文；明文只出现在生成时返回给发起人的链接里。
--
-- 执行方式：
--   mysql -h127.0.0.1 -uroot --default-character-set=utf8mb4 < database/019_add_workspace_invitation.sql

USE impact_flow;

CREATE TABLE IF NOT EXISTS workspace_invitation (
  id CHAR(36) NOT NULL COMMENT '邀请主键ID（UUID）',
  workspace_id CHAR(36) NOT NULL COMMENT '工作空间ID',
  invited_by CHAR(36) NOT NULL COMMENT '邀请发起人ID',
  target_type VARCHAR(20) NOT NULL COMMENT '目标类型：NEW/EXISTING',
  target_user_id CHAR(36) NULL COMMENT '目标账号ID（仅EXISTING）',
  role VARCHAR(20) NOT NULL COMMENT '接受后的角色：ADMIN/MEMBER/VIEWER',
  token_hash CHAR(64) NOT NULL COMMENT '邀请令牌SHA-256哈希',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING/ACCEPTED/REVOKED',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  expires_at DATETIME(3) NOT NULL COMMENT '过期时间',
  accepted_at DATETIME(3) NULL COMMENT '接受时间',
  accepted_by CHAR(36) NULL COMMENT '接受者账号ID',
  PRIMARY KEY (id),
  UNIQUE KEY uk_workspace_invitation_token (token_hash),
  KEY idx_workspace_invitation_workspace (workspace_id, status),
  CONSTRAINT fk_workspace_invitation_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_invitation_inviter
    FOREIGN KEY (invited_by) REFERENCES user_account (id) ON DELETE CASCADE,
  CONSTRAINT fk_workspace_invitation_target
    FOREIGN KEY (target_user_id) REFERENCES user_account (id) ON DELETE SET NULL,
  CONSTRAINT fk_workspace_invitation_accepted
    FOREIGN KEY (accepted_by) REFERENCES user_account (id) ON DELETE SET NULL
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='工作空间邀请表';
