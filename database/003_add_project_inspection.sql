-- 增加生产分支定时巡检状态
-- 适用于 MySQL 8.0+

USE impact_flow;

ALTER TABLE project
  ADD COLUMN detected_commit VARCHAR(64) NULL COMMENT '最近一次巡检检测到的提交SHA' AFTER last_analyzed_commit,
  ADD COLUMN previous_detected_commit VARCHAR(64) NULL COMMENT '上一个不同的巡检提交SHA' AFTER detected_commit,
  ADD COLUMN pending_commit_count INT NOT NULL DEFAULT 0 COMMENT '待分析提交数量' AFTER previous_detected_commit,
  ADD COLUMN pending_commits JSON NULL COMMENT '待分析提交摘要列表（JSON）' AFTER pending_commit_count,
  ADD COLUMN last_checked_at DATETIME(3) NULL COMMENT '最后巡检时间' AFTER pending_commits,
  ADD COLUMN check_status VARCHAR(20) NOT NULL DEFAULT 'IDLE' COMMENT '巡检状态：IDLE/RUNNING/SUCCESS/FAILED' AFTER last_checked_at,
  ADD COLUMN check_error VARCHAR(2000) NULL COMMENT '最近一次巡检失败原因' AFTER check_status;
