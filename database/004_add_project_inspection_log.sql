-- 持久化每次自动或手动生产分支巡检的执行日志
USE impact_flow;

CREATE TABLE IF NOT EXISTS project_inspection_log (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  trigger_type VARCHAR(20) NOT NULL COMMENT '触发方式：SCHEDULED/MANUAL',
  status VARCHAR(20) NOT NULL COMMENT '执行状态：RUNNING/SUCCESS/FAILED',
  detected_commit VARCHAR(64) NULL COMMENT '本次巡检检测到的提交SHA',
  pending_commit_count INT NOT NULL DEFAULT 0 COMMENT '待分析提交数',
  error_message VARCHAR(2000) NULL COMMENT '失败原因',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '开始时间',
  finished_at DATETIME(3) NULL COMMENT '结束时间',
  PRIMARY KEY (id),
  KEY idx_inspection_log_time (started_at),
  KEY idx_inspection_log_project_time (project_id, started_at),
  CONSTRAINT fk_inspection_log_project
    FOREIGN KEY (project_id) REFERENCES project (id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
