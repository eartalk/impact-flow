-- 多工作空间管理：工作空间生命周期、所有者权威来源、登录默认空间、成员关系更新时间
--
-- 设计要点：
--   1. workspace.owner_user_id 是工作空间唯一所有者的权威来源；
--      workspace_member.role='OWNER' 用于权限查询，两者必须在同一事务中维护。
--   2. 通过 STORED 生成列 + 唯一键在数据库层保证「一个工作空间最多一个 OWNER」，
--      使所有权转让即使写错顺序也会直接失败而不是产生两个所有者。
--   3. 迁移前校验现有数据不存在「无 OWNER」或「多 OWNER」的工作空间，异常即中止。
--
-- 执行方式（必须显式指定字符集，否则中文注释会乱码）：
--   mysql -h127.0.0.1 -uroot --default-character-set=utf8mb4 < database/017_add_workspace_management.sql

USE impact_flow;

-- 0) 迁移前校验：每个工作空间必须恰好有一个 OWNER
DROP PROCEDURE IF EXISTS assert_single_owner_per_workspace;

DELIMITER $$
CREATE PROCEDURE assert_single_owner_per_workspace()
BEGIN
  DECLARE abnormal INT DEFAULT 0;

  SELECT COUNT(*) INTO abnormal FROM (
    SELECT w.id
    FROM workspace w
    LEFT JOIN workspace_member m
      ON m.workspace_id = w.id AND m.role = 'OWNER'
    GROUP BY w.id
    HAVING COUNT(m.user_id) <> 1
  ) AS inconsistent;

  IF abnormal > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '存在没有OWNER或存在多个OWNER的工作空间，请先人工修复后再执行迁移';
  END IF;
END$$
DELIMITER ;

CALL assert_single_owner_per_workspace();
DROP PROCEDURE assert_single_owner_per_workspace;

-- 1) workspace 扩展：描述、所有者、操作人、归档时间
ALTER TABLE workspace
  ADD COLUMN description VARCHAR(500) NULL COMMENT '工作空间描述' AFTER code,
  ADD COLUMN owner_user_id CHAR(36) NULL COMMENT '当前所有者用户ID' AFTER description,
  ADD COLUMN created_by CHAR(36) NULL COMMENT '创建用户ID' AFTER owner_user_id,
  ADD COLUMN updated_by CHAR(36) NULL COMMENT '最后修改用户ID' AFTER created_by,
  ADD COLUMN archived_at DATETIME(3) NULL COMMENT '归档时间' AFTER updated_by,
  MODIFY COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    COMMENT '状态：ACTIVE/ARCHIVED';

-- 回填所有者与创建人（创建人默认取所有者）
UPDATE workspace w
JOIN workspace_member m
  ON m.workspace_id = w.id AND m.role = 'OWNER'
SET w.owner_user_id = m.user_id
WHERE w.owner_user_id IS NULL;

UPDATE workspace
SET created_by = owner_user_id
WHERE created_by IS NULL;

ALTER TABLE workspace
  ADD KEY idx_workspace_owner (owner_user_id),
  ADD KEY idx_workspace_status (status),
  ADD CONSTRAINT fk_workspace_owner
    FOREIGN KEY (owner_user_id) REFERENCES user_account (id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_workspace_created_by
    FOREIGN KEY (created_by) REFERENCES user_account (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_workspace_updated_by
    FOREIGN KEY (updated_by) REFERENCES user_account (id) ON DELETE SET NULL;

-- 2) user_account 扩展：登录时优先进入最后使用的工作空间
ALTER TABLE user_account
  ADD COLUMN last_workspace_id CHAR(36) NULL COMMENT '最后使用的工作空间ID' AFTER status;

-- 确定性回填：优先该用户担任 OWNER 的空间，其次按加入时间最早的 ACTIVE 空间
UPDATE user_account u
SET u.last_workspace_id = (
  SELECT m.workspace_id
  FROM workspace_member m
  JOIN workspace w ON w.id = m.workspace_id
  WHERE m.user_id = u.id AND w.status = 'ACTIVE'
  ORDER BY (m.role = 'OWNER') DESC, m.joined_at ASC
  LIMIT 1
)
WHERE u.last_workspace_id IS NULL;

ALTER TABLE user_account
  ADD KEY idx_user_account_last_workspace (last_workspace_id),
  ADD CONSTRAINT fk_user_account_last_workspace
    FOREIGN KEY (last_workspace_id) REFERENCES workspace (id) ON DELETE SET NULL;

-- 3) workspace_member：成员关系更新时间 + 数据库级单所有者约束
--
-- 注意：owner_workspace_id 必须使用 VIRTUAL 而不是 STORED。
-- workspace_id 同时是主键列和外键列，STORED 生成列会触发表重建，
-- 重建过程中重新添加 fk_workspace_member_workspace 会失败并报
-- ERROR 1215 Cannot add foreign key constraint。
-- VIRTUAL 生成列可以 INPLACE 添加、不重建表，并且同样支持唯一索引。
ALTER TABLE workspace_member
  ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '成员关系更新时间',
  ADD COLUMN owner_workspace_id CHAR(36)
    GENERATED ALWAYS AS (IF(role = 'OWNER', workspace_id, NULL)) VIRTUAL
    COMMENT '仅OWNER成员写入，用于唯一约束保证单所有者';

-- 唯一键只约束 OWNER 行：非 OWNER 行该列为 NULL，而 NULL 不参与唯一性比较
ALTER TABLE workspace_member
  ADD UNIQUE KEY uk_workspace_member_single_owner (owner_workspace_id);
