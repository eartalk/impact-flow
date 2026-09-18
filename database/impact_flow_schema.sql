-- Impact Flow database schema
-- Compatible with MySQL 8.0+

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE DATABASE IF NOT EXISTS impact_flow
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE impact_flow;

CREATE TABLE IF NOT EXISTS project (
  id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(100) NOT NULL,
  repository_url VARCHAR(1000) NOT NULL,
  production_branch VARCHAR(200) NOT NULL DEFAULT 'production',
  last_analyzed_commit VARCHAR(64) NULL,
  detected_commit VARCHAR(64) NULL,
  previous_detected_commit VARCHAR(64) NULL,
  pending_commit_count INT NOT NULL DEFAULT 0,
  pending_commits JSON NULL,
  last_checked_at DATETIME(3) NULL,
  check_status VARCHAR(20) NOT NULL DEFAULT 'IDLE',
  check_error VARCHAR(2000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_project_code (code)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS project_inspection_log (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  trigger_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  detected_commit VARCHAR(64) NULL,
  pending_commit_count INT NOT NULL DEFAULT 0,
  error_message VARCHAR(2000) NULL,
  risk_level VARCHAR(20) NULL,
  risk_summary VARCHAR(1000) NULL,
  impacted_modules JSON NULL,
  regression_suggestions JSON NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_inspection_log_time (started_at),
  KEY idx_inspection_log_project_time (project_id, started_at),
  CONSTRAINT fk_inspection_log_project
    FOREIGN KEY (project_id) REFERENCES project (id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `release` (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  base_commit VARCHAR(64) NOT NULL,
  target_commit VARCHAR(64) NOT NULL,
  version VARCHAR(100) NULL,
  status VARCHAR(30) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_release_project_time (project_id, created_at),
  CONSTRAINT fk_release_project
    FOREIGN KEY (project_id) REFERENCES project (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS analysis_task (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  release_id CHAR(36) NOT NULL,
  base_commit VARCHAR(64) NOT NULL,
  target_commit VARCHAR(64) NOT NULL,
  status VARCHAR(30) NOT NULL,
  commit_count INT NOT NULL DEFAULT 0,
  changed_file_count INT NOT NULL DEFAULT 0,
  additions INT NOT NULL DEFAULT 0,
  deletions INT NOT NULL DEFAULT 0,
  commit_summary JSON NULL,
  error_message VARCHAR(2000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_analysis_project_time (project_id, created_at),
  KEY idx_analysis_status (status),
  CONSTRAINT fk_analysis_project
    FOREIGN KEY (project_id) REFERENCES project (id),
  CONSTRAINT fk_analysis_release
    FOREIGN KEY (release_id) REFERENCES `release` (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS change_file (
  id CHAR(36) NOT NULL,
  analysis_task_id CHAR(36) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  old_path VARCHAR(1000) NULL,
  change_type VARCHAR(10) NOT NULL,
  additions INT NOT NULL DEFAULT 0,
  deletions INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_change_file_analysis (analysis_task_id),
  CONSTRAINT fk_change_file_analysis
    FOREIGN KEY (analysis_task_id) REFERENCES analysis_task (id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
