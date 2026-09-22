SET NAMES utf8mb4;

ALTER TABLE analysis_task
  ADD COLUMN progress_stage VARCHAR(40) NOT NULL DEFAULT 'QUEUED' COMMENT '当前执行阶段' AFTER lock_expires_at,
  ADD COLUMN progress_percent TINYINT UNSIGNED NOT NULL DEFAULT 5 COMMENT '阶段进度百分比' AFTER progress_stage,
  ADD COLUMN progress_message VARCHAR(500) NULL COMMENT '当前阶段说明' AFTER progress_percent,
  ADD COLUMN progress_updated_at DATETIME(3) NULL COMMENT '进度最后更新时间' AFTER progress_message,
  ADD COLUMN started_at DATETIME(3) NULL COMMENT '本轮任务首次开始时间' AFTER progress_updated_at;

UPDATE analysis_task
SET progress_stage = CASE
      WHEN status IN ('SUCCESS', 'NO_CHANGES') THEN 'COMPLETED'
      ELSE 'QUEUED'
    END,
    progress_percent = CASE
      WHEN status IN ('SUCCESS', 'NO_CHANGES') THEN 100
      ELSE 5
    END,
    progress_updated_at = COALESCE(finished_at, created_at),
    started_at = CASE
      WHEN status IN ('RUNNING', 'SUCCESS', 'FAILED') THEN created_at
      ELSE NULL
    END;
