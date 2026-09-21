-- 合并「待检测通知成功投递记录」与「投递尝试日志」为单表
-- 设计要点：
--   1. 每次投递尝试写入一行，失败尝试可无限追加（保留重试与失败原因）
--   2. delivered_commit 为 STORED 生成列：投递成功时等于 target_commit，失败时为 NULL
--   3. 唯一键 (project_id, delivered_commit) 利用 MySQL「NULL 不参与唯一性比较」的特性，
--      只约束成功投递 → 同一服务同一提交最多成功通知一次，失败尝试不受影响
--   4. 去重判定从「存在任意记录」改为「存在成功记录（status = 'SUCCESS'）」
--
-- 注意：MySQL 的外键约束名在单个库内唯一，旧表未删除时无法创建同名外键，
--      因此先用无外键的过渡表暂存历史数据，删除旧表后再按最终结构重建。

USE impact_flow;

-- 1) 暂存历史成功投递记录（旧表的外键在删除前会一直占用约束名）
DROP TABLE IF EXISTS pending_notification_delivery_stage;

CREATE TABLE pending_notification_delivery_stage (
  id CHAR(36) NOT NULL COMMENT '投递记录主键ID（UUID）',
  workspace_id CHAR(36) NOT NULL COMMENT '所属工作空间ID',
  project_id CHAR(36) NOT NULL COMMENT '关联服务ID',
  target_commit VARCHAR(64) NOT NULL COMMENT '通知对应的目标提交SHA',
  delivered_at DATETIME(3) NOT NULL COMMENT '原成功投递时间',
  PRIMARY KEY (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='迁移过渡表（迁移完成后删除）';

INSERT INTO pending_notification_delivery_stage
  (id, workspace_id, project_id, target_commit, delivered_at)
SELECT d.id, p.workspace_id, d.project_id, d.target_commit, d.delivered_at
FROM pending_notification_delivery d
JOIN project p ON p.id = d.project_id;

-- 2) 释放旧表与旧外键，按合并后的结构重建
DROP TABLE pending_notification_delivery;

CREATE TABLE pending_notification_delivery (
  id CHAR(36) NOT NULL COMMENT '投递记录主键ID（UUID）',
  workspace_id CHAR(36) NOT NULL COMMENT '所属工作空间ID',
  project_id CHAR(36) NOT NULL COMMENT '关联服务ID',
  target_commit VARCHAR(64) NOT NULL COMMENT '通知对应的目标提交SHA',
  channel VARCHAR(20) NOT NULL DEFAULT 'DINGTALK' COMMENT '通知渠道：DINGTALK',
  attempt INT NOT NULL DEFAULT 1 COMMENT '该提交的第几次投递尝试',
  status VARCHAR(20) NOT NULL COMMENT '投递结果：SUCCESS/FAILED',
  error_code VARCHAR(64) NULL COMMENT '失败错误码（钉钉errcode、HTTP状态或网关错误标识）',
  error_message VARCHAR(1000) NULL COMMENT '失败原因',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '投递尝试时间',
  delivered_commit VARCHAR(64)
    GENERATED ALWAYS AS (IF(status = 'SUCCESS', target_commit, NULL)) STORED
    COMMENT '成功投递标记：成功时等于target_commit，失败为NULL，用于唯一约束',
  PRIMARY KEY (id),
  UNIQUE KEY uk_pending_notification_delivered (project_id, delivered_commit),
  KEY idx_pending_notification_workspace_time (workspace_id, created_at),
  KEY idx_pending_notification_project_time (project_id, created_at),
  CONSTRAINT fk_pending_notification_delivery_project
    FOREIGN KEY (project_id) REFERENCES project (id) ON DELETE CASCADE,
  CONSTRAINT fk_pending_notification_delivery_workspace
    FOREIGN KEY (workspace_id) REFERENCES workspace (id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci
  COMMENT='待检测通知投递记录表（成功与失败尝试）';

-- 3) 回填历史成功投递记录（project 删除时旧记录级联清理，故不存在孤儿数据）
INSERT INTO pending_notification_delivery
  (id, workspace_id, project_id, target_commit, channel, attempt, status, created_at)
SELECT id, workspace_id, project_id, target_commit, 'DINGTALK', 1, 'SUCCESS', delivered_at
FROM pending_notification_delivery_stage;

DROP TABLE pending_notification_delivery_stage;
