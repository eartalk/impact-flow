-- 工作空间归档：分析任务新增「已取消」状态
--
-- analysis_task.status 是 varchar(30) 而非 ENUM，因此无需修改列类型，
-- 这里只同步列注释，避免文档与实际取值范围脱节。
--
-- 执行方式：
--   mysql -h127.0.0.1 -uroot --default-character-set=utf8mb4 < database/018_add_analysis_cancelled_status.sql

USE impact_flow;

ALTER TABLE analysis_task
  MODIFY COLUMN status VARCHAR(30) NOT NULL
    COMMENT '任务状态：READY/RUNNING/SUCCESS/FAILED/NO_CHANGES/CANCELLED';
