-- Remove the abandoned in-product automation execution model and redundant release shell.
-- Regression analysis keeps recommending API automation tests in analysis_task.regression_plan.

SET NAMES utf8mb4;
USE impact_flow;

DROP TABLE IF EXISTS automation_module_result;
DROP TABLE IF EXISTS automation_execution;
DROP TABLE IF EXISTS automation_module_binding;
DROP TABLE IF EXISTS analysis_module_scope;
DROP TABLE IF EXISTS business_module_catalog;
DROP TABLE IF EXISTS workspace_invitation;

SET @release_fk = (
  SELECT CONSTRAINT_NAME
  FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'analysis_task'
    AND COLUMN_NAME = 'release_id'
    AND REFERENCED_TABLE_NAME = 'release'
  LIMIT 1
);
SET @drop_release_fk = IF(
  @release_fk IS NULL,
  'SELECT 1',
  CONCAT(
    'ALTER TABLE analysis_task DROP FOREIGN KEY `',
    REPLACE(@release_fk, '`', '``'),
    '`'
  )
);
PREPARE drop_release_fk_statement FROM @drop_release_fk;
EXECUTE drop_release_fk_statement;
DEALLOCATE PREPARE drop_release_fk_statement;

SET @drop_release_column = IF(
  EXISTS(
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'analysis_task'
      AND COLUMN_NAME = 'release_id'
  ),
  'ALTER TABLE analysis_task DROP COLUMN release_id',
  'SELECT 1'
);
PREPARE drop_release_column_statement FROM @drop_release_column;
EXECUTE drop_release_column_statement;
DEALLOCATE PREPARE drop_release_column_statement;

DROP TABLE IF EXISTS `release`;
