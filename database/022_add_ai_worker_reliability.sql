SET NAMES utf8mb4;

ALTER TABLE analysis_task
  ADD COLUMN ai_attempt_count INT NOT NULL DEFAULT 0 COMMENT 'AI分析已执行次数' AFTER started_at,
  ADD COLUMN ai_max_attempts INT NOT NULL DEFAULT 3 COMMENT 'AI分析最大执行次数' AFTER ai_attempt_count,
  ADD COLUMN ai_next_attempt_at DATETIME(3) NULL COMMENT 'AI分析下次允许执行时间' AFTER ai_max_attempts,
  ADD COLUMN ai_worker_id VARCHAR(100) NULL COMMENT 'AI任务当前租约持有者' AFTER ai_next_attempt_at,
  ADD COLUMN ai_locked_at DATETIME(3) NULL COMMENT 'AI任务抢占时间' AFTER ai_worker_id,
  ADD COLUMN ai_lock_expires_at DATETIME(3) NULL COMMENT 'AI任务租约过期时间' AFTER ai_locked_at,
  ADD KEY idx_analysis_ai_worker_queue (ai_next_attempt_at, ai_lock_expires_at);

ALTER TABLE ai_analysis_log
  ADD COLUMN attempt INT NOT NULL DEFAULT 1 COMMENT '本次AI执行序号' AFTER status,
  ADD COLUMN worker_id VARCHAR(100) NULL COMMENT '执行Worker标识' AFTER attempt;

UPDATE analysis_task
SET ai_lock_expires_at = CURRENT_TIMESTAMP(3)
WHERE JSON_UNQUOTE(JSON_EXTRACT(ai_analysis, '$.status')) = 'RUNNING';
