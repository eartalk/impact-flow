SET NAMES utf8mb4;

-- Service Atlas was an unreleased design. Remove its storage if a development
-- database already applied the abandoned migrations.
DROP TABLE IF EXISTS service_knowledge_build;
DROP TABLE IF EXISTS ai_analysis_log;

DROP PROCEDURE IF EXISTS drop_column_if_exists;
DELIMITER $$
CREATE PROCEDURE drop_column_if_exists(IN table_name_value VARCHAR(64), IN column_name_value VARCHAR(64))
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = table_name_value
      AND COLUMN_NAME = column_name_value
  ) THEN
    SET @drop_column_sql = CONCAT(
      'ALTER TABLE `', table_name_value, '` DROP COLUMN `', column_name_value, '`'
    );
    PREPARE drop_column_statement FROM @drop_column_sql;
    EXECUTE drop_column_statement;
    DEALLOCATE PREPARE drop_column_statement;
  END IF;
END$$
DELIMITER ;

CALL drop_column_if_exists('project', 'repository_kind');
CALL drop_column_if_exists('project', 'business_system_name');
CALL drop_column_if_exists('project', 'business_system_code');
CALL drop_column_if_exists('analysis_task', 'ai_lock_expires_at');
CALL drop_column_if_exists('analysis_task', 'ai_locked_at');
CALL drop_column_if_exists('analysis_task', 'ai_worker_id');
CALL drop_column_if_exists('analysis_task', 'ai_next_attempt_at');
CALL drop_column_if_exists('analysis_task', 'ai_max_attempts');
CALL drop_column_if_exists('analysis_task', 'ai_attempt_count');
CALL drop_column_if_exists('analysis_task', 'ai_analysis_requested');
CALL drop_column_if_exists('analysis_task', 'ai_analysis');
DROP PROCEDURE drop_column_if_exists;

ALTER TABLE analysis_task
  ADD COLUMN analysis_context JSON NULL
    COMMENT '不可变分析上下文：仓库与提交版本、分析器版本' AFTER change_evidence,
  ADD COLUMN change_units JSON NULL
    COMMENT '语义化代码变更单元' AFTER analysis_context,
  ADD COLUMN regression_plan JSON NULL
    COMMENT '面向测试人员的最终回归清单' AFTER change_units,
  ADD COLUMN analysis_version INT NOT NULL DEFAULT 1
    COMMENT '回归分析领域模型版本' AFTER regression_plan;
