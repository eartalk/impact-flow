CREATE TABLE IF NOT EXISTS project (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(100) NOT NULL,
  repository_url VARCHAR(1000) NOT NULL,
  production_branch VARCHAR(200) NOT NULL DEFAULT 'production',
  last_analyzed_commit VARCHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_project_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS analysis_task (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
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
  CONSTRAINT fk_analysis_project FOREIGN KEY (project_id) REFERENCES project(id),
  KEY idx_analysis_project_time (project_id, created_at),
  KEY idx_analysis_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS change_file (
  id CHAR(36) PRIMARY KEY,
  analysis_task_id CHAR(36) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  old_path VARCHAR(1000) NULL,
  change_type VARCHAR(10) NOT NULL,
  additions INT NOT NULL DEFAULT 0,
  deletions INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_change_file_analysis FOREIGN KEY (analysis_task_id)
    REFERENCES analysis_task(id) ON DELETE CASCADE,
  KEY idx_change_file_analysis (analysis_task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

