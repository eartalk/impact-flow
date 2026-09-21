SET NAMES utf8mb4;

ALTER TABLE analysis_task
  ADD COLUMN attempt_count INT NOT NULL DEFAULT 0 COMMENT '已执行次数' AFTER ai_analysis_requested,
  ADD COLUMN max_attempts INT NOT NULL DEFAULT 3 COMMENT '最大执行次数' AFTER attempt_count,
  ADD COLUMN next_attempt_at DATETIME(3) NULL COMMENT '下次允许执行时间' AFTER max_attempts,
  ADD COLUMN worker_id VARCHAR(100) NULL COMMENT '当前租约持有者' AFTER next_attempt_at,
  ADD COLUMN locked_at DATETIME(3) NULL COMMENT '任务抢占时间' AFTER worker_id,
  ADD COLUMN lock_expires_at DATETIME(3) NULL COMMENT '任务租约过期时间' AFTER locked_at,
  ADD KEY idx_analysis_worker_queue (status, next_attempt_at, lock_expires_at);

-- 部署时遗留的 RUNNING 任务交由新 Worker 立即重新抢占。
UPDATE analysis_task
SET lock_expires_at = CURRENT_TIMESTAMP(3)
WHERE status = 'RUNNING' AND lock_expires_at IS NULL;
